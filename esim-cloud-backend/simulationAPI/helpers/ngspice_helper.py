from celery.exceptions import SoftTimeLimitExceeded
import os
import re
import logging
import subprocess
from pathlib import Path
from django.conf import settings
from .parse import extract_data_from_ngspice_output
logger = logging.getLogger(__name__)


class CannotRunSpice(Exception):
    """Base class for exceptions in this module."""
    pass


"""
Note: If there is no valid data, the error text is propagated
through output. However, the celery task is passed.
"""


# =========================================================================
# Custom Model Injection (Issue #539)
# =========================================================================

def inject_custom_models(netlist_text, model_ids):
    """
    Inject sanitized custom SPICE model definitions inline into a netlist.

    Security contract:
    - Only `sanitized_content` from SpiceModel records is injected — this
      content has already passed the whitelist parser.
    - Content is injected as plain text BEFORE the first .control block
      (or before .end if no .control exists). NO .include directives,
      NO temp files on disk.
    - Each injected block is wrapped in comment markers for traceability.

    Args:
        netlist_text (str): The original netlist file content.
        model_ids (list): List of SpiceModel UUID strings to inject.

    Returns:
        str: The augmented netlist with model definitions prepended.
    """
    # Import here to avoid circular imports at module level
    from simulationAPI.models import SpiceModel

    if not model_ids:
        return netlist_text

    # Fetch all requested models in one query
    models = SpiceModel.objects.filter(id__in=model_ids)
    if not models.exists():
        logger.warning(
            'No SpiceModel records found for ids: %s', model_ids)
        return netlist_text

    # Build the injection block from sanitized content
    injection_lines = []
    injection_lines.append(
        '* ============================================')
    injection_lines.append(
        '* BEGIN INJECTED CUSTOM MODELS (Issue #539)')
    injection_lines.append(
        '* ============================================')

    for model in models:
        injection_lines.append('')
        injection_lines.append(
            '* --- BEGIN MODEL: {} (id: {}) ---'.format(
                model.name, model.id))
        injection_lines.append(model.sanitized_content)
        injection_lines.append(
            '* --- END MODEL: {} ---'.format(model.name))

    injection_lines.append('')
    injection_lines.append(
        '* ============================================')
    injection_lines.append(
        '* END INJECTED CUSTOM MODELS')
    injection_lines.append(
        '* ============================================')
    injection_lines.append('')

    injection_block = '\n'.join(injection_lines)

    # Find the insertion point: just BEFORE the first .control line,
    # or just BEFORE .end if no .control exists.
    lines = netlist_text.split('\n')
    insert_idx = None

    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        if stripped.startswith('.control'):
            insert_idx = i
            break

    if insert_idx is None:
        # No .control block — insert before .end
        for i, line in enumerate(lines):
            stripped = line.strip().lower()
            if stripped == '.end':
                insert_idx = i
                break

    if insert_idx is not None:
        lines.insert(insert_idx, injection_block)
        return '\n'.join(lines)
    else:
        # Fallback: append before the last line
        logger.warning(
            'Could not find .control or .end in netlist — '
            'appending models at end')
        return netlist_text + '\n' + injection_block


def inject_ngbehavior_ps(netlist_text):
    """
    Inject 'set ngbehavior=ps' into the .control block of a netlist.

    This is CRITICAL for ngspice v31 to correctly handle industry-standard
    PSPICE/LTspice syntax in custom models (e.g. behavioral sources with
    TABLE, LAPLACE, IF-THEN-ELSE, VALUE expressions).

    Without this flag, ngspice v31 will crash or misparse these constructs.

    Strategy:
    - Find the first '.control' line and inject 'set ngbehavior=ps'
      immediately after it.
    - If no .control block exists, do nothing (the netlist uses pure
      ngspice syntax and doesn't need this).

    Args:
        netlist_text (str): The netlist content.

    Returns:
        str: The netlist with 'set ngbehavior=ps' injected, or unchanged.
    """
    lines = netlist_text.split('\n')

    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        if stripped.startswith('.control'):
            # Insert 'set ngbehavior=ps' right after the .control line
            lines.insert(i + 1, 'set ngbehavior=ps')
            logger.info('Injected "set ngbehavior=ps" after .control')
            return '\n'.join(lines)

    # No .control block found — nothing to inject
    return netlist_text


# =========================================================================
# Core Execution (modified to support custom models)
# =========================================================================

def ExecNetlist(filepath, file_id, model_ids=None):
    """
    Execute a netlist file through ngspice.

    If model_ids are provided, the sanitized content of those SpiceModel
    records is injected inline into the netlist before execution.
    'set ngbehavior=ps' is also injected for PSPICE/LTspice compatibility.

    Args:
        filepath (str): Path to the uploaded netlist .cir file.
        file_id (UUID): Unique file identifier for temp directory naming.
        model_ids (list, optional): List of SpiceModel UUID strings.

    Returns:
        dict: Parsed simulation output or error information.
    """
    if not os.path.isfile(filepath):
        raise IOError
    try:

        current_dir = settings.MEDIA_ROOT+'/'+str(file_id)
        # Make Unique Directory for simulation to run
        Path(current_dir).mkdir(parents=True, exist_ok=True)
        os.chdir(current_dir)

        # ---------------------------------------------------------------
        # Custom model injection (Issue #539)
        # Read the netlist, inject models + ngbehavior, write augmented file
        # ---------------------------------------------------------------
        with open(filepath, 'r') as f:
            netlist_text = f.read()

        if model_ids:
            logger.info(
                'Injecting %d custom model(s) into netlist',
                len(model_ids))
            netlist_text = inject_custom_models(netlist_text, model_ids)

        # Always inject ngbehavior=ps for PSPICE/LTspice compat
        netlist_text = inject_ngbehavior_ps(netlist_text)

        # Write augmented netlist to the temp simulation directory.
        # Use a new filename to avoid mutating the original upload.
        augmented_path = os.path.join(current_dir, 'augmented_netlist.cir')
        with open(augmented_path, 'w') as f:
            f.write(netlist_text)

        exec_path = augmented_path
        # ---------------------------------------------------------------

        logger.info('will run ngSpice command')
        proc = subprocess.Popen(['ngspice', '-ab', exec_path],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                cwd=current_dir)
        stdout, stderr = proc.communicate()
        logger.info('Ran ngSpice command')
        if proc.returncode not in [0, 1]:
            logger.error('ngspice error encountered')
            logger.error(stderr)
            logger.error(proc.returncode)
            logger.error(stdout)
            target = os.listdir(current_dir)
            for item in target:
                if (item.endswith(".txt")):
                    os.remove(os.path.join('.', item))
            raise CannotRunSpice("ngspice exited with error")
        else:
            logger.info('Ran ngSpice')

        logger.info("Reading Output")
        if os.path.isfile(current_dir+'/data.txt'):
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
                output = {'fail': foo}
        else:
            out = stdout.decode("utf-8")
            err = stderr.decode("utf-8")
            foo = '{}'.format(out+err)
            output = {'fail': foo}
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
        logger.exception('Encountered Exception:')
        logger.exception(e)
    finally:
        target = os.listdir(current_dir)
        os.remove(filepath)
        for item in target:
            os.remove(os.path.join(current_dir, item))
        os.rmdir(current_dir)
        logger.info('Deleted Files')

