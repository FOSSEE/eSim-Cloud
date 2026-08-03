from celery.exceptions import SoftTimeLimitExceeded
import os
import logging
import subprocess
from pathlib import Path
from django.conf import settings
from .parse import extract_data_from_ngspice_output
from simulationAPI.helpers.error_parser import parse_ngspice_error
logger = logging.getLogger(__name__)


class CannotRunSpice(Exception):
    """Base class for exceptions in this module."""
    pass


"""
Note: If there is no valid data, the error text is propagated
through output. However, the celery task is passed.
"""


def ExecNetlist(filepath, file_id):
    if not os.path.isfile(filepath):
        raise IOError
    try:

        current_dir = settings.MEDIA_ROOT+'/'+str(file_id)
        # Make Unique Directory for simulation to run
        Path(current_dir).mkdir(parents=True, exist_ok=True)
        # Note: Do NOT os.chdir() here — it changes CWD for the entire process
        # and causes race conditions under concurrent simulations.
        # The cwd= argument to Popen handles this correctly.
        logger.info('will run ngSpice command')
        proc = subprocess.Popen(['ngspice', '-ab', filepath],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                cwd=current_dir)
        stdout, stderr = proc.communicate()
        logger.info('Ran ngSpice command')
        if proc.returncode not in [0, 1]:
            # ngspice died on a signal (e.g. -11 = SIGSEGV on a malformed
            # .model line). It prints nothing in that case, so log the
            # netlist itself for diagnosis and report a structured failure —
            # raising here used to be swallowed below and returned None,
            # which the frontend rendered as an infinite "Loading...".
            logger.error('ngspice error encountered')
            logger.error(stderr)
            logger.error(proc.returncode)
            logger.error(stdout)
            try:
                with open(filepath, 'r', errors='replace') as f:
                    logger.error('netlist that killed ngspice:\n%s', f.read())
            except OSError:
                pass
            msg = (stderr or b'').decode('utf-8', errors='replace').strip()
            if not msg:
                msg = ('ngspice crashed (exit code {}) without output. '
                       'The generated netlist contains a construct ngspice '
                       'cannot parse — check component values and .model '
                       'lines.').format(proc.returncode)
            return {'fail': msg, 'error_help': parse_ngspice_error(msg)}
        else:
            logger.info('Ran ngSpice')

        logger.info("Reading Output")
        # When the analysis aborts (e.g. "Fatal error: instance v1 is a
        # shorted VSRC"), the .control block still executes and `print all`
        # dumps ngspice's *constants* plot (e, pi, boltz, ...) into data.txt.
        # That parses as a plausible table and used to be reported as a
        # successful result — surface the fatal error instead.
        err_txt = (stderr or b'').decode('utf-8', errors='replace')
        run_aborted = ('Fatal error' in err_txt or
                       'simulation(s) aborted' in err_txt)
        if run_aborted:
            try:
                with open(filepath, 'r', errors='replace') as f:
                    logger.error('netlist of aborted run:\n%s', f.read())
            except OSError:
                pass
            output = {'fail': err_txt, 'error_help': parse_ngspice_error(err_txt)}
        elif os.path.isfile(current_dir+'/data.txt'):
            output = extract_data_from_ngspice_output(current_dir+'/data.txt')
            if output["data"]:
                """
                This means output data file exists and has
                data parsed by parse.py
                """
                pass
            else:
                """
                if the output is blank, the err is logged in stderr
                """
                tmp = stderr.decode("utf-8")
                foo = '{}'.format(tmp)
                # JSON shape of the full failure response:
                # {
                #     'fail': '<original_stderr_text>',
                #     'error_help': {
                #         'summary': '<A short sentence describing what went wrong>',
                #         'hints': ['<A list of actionable steps to fix the problem>'],
                #         'codes': ['<A list of specific error codes or keywords>']
                #     }
                # }
                output = {'fail': foo, 'error_help': parse_ngspice_error(tmp)}
        else:
            out = stdout.decode("utf-8")
            err = stderr.decode("utf-8")
            foo = '{}'.format(out+err)
            # JSON shape of the full failure response:
            # {
            #     'fail': '<original_stderr_text>',
            #     'error_help': {
            #         'summary': '<A short sentence describing what went wrong>',
            #         'hints': ['<A list of actionable steps to fix the problem>'],
            #         'codes': ['<A list of specific error codes or keywords>']
            #     }
            # }
            output = {'fail': foo, 'error_help': parse_ngspice_error(err)}
        logger.info('output from ngspice_helper.py')
        logger.info(stderr)
        # logger.info(output)
        logger.info(stdout)
        return output
    except SoftTimeLimitExceeded:
        output = {'fail': "time limit exceeded"}
        print('tle')
        return output
    except Exception as e:
        # Never return None: the task would be marked SUCCESS with an empty
        # result and the frontend would poll forever.
        logger.exception('Encountered Exception:')
        logger.exception(e)
        return {'fail': 'Simulation failed: {}'.format(e),
                'error_help': None}
    finally:
        target = os.listdir(current_dir)
        os.remove(filepath)
        for item in target:
            os.remove(os.path.join(current_dir, item))
        os.rmdir(current_dir)
        logger.info('Deleted Files')
