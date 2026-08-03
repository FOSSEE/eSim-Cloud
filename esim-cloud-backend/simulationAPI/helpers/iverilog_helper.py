"""
Icarus Verilog simulation helper.

Follows the exact same pattern as ngspice_helper.py:
1. Write source files to a unique temp directory
2. Compile with iverilog
3. Simulate with vvp
4. Parse VCD output
5. Clean up and return results
"""

import os
import shutil
import logging
import subprocess
import re
from pathlib import Path
from django.conf import settings
from celery.exceptions import SoftTimeLimitExceeded
from .verilog_vcd_parser import parse_vcd

logger = logging.getLogger(__name__)


class CannotRunIverilog(Exception):
    """Raised when iverilog or vvp fails to execute."""
    pass


def inject_dumpvars(testbench_content, dumpfile_name='dump.vcd'):
    """
    If the testbench does not contain $dumpfile and $dumpvars,
    inject them into the first 'initial begin' block.
    This is a safety net for beginners who forget to add VCD output.
    """
    if '$dumpfile' in testbench_content and '$dumpvars' in testbench_content:
        return testbench_content

    # Find the first 'initial begin' and inject after it
    pattern = r'(initial\s+begin)'
    replacement = (
        r'\1\n'
        '    $dumpfile("' + dumpfile_name + '");\n'
        '    $dumpvars(0);\n'
    )
    modified = re.sub(pattern, replacement, testbench_content, count=1)

    # If no 'initial begin' was found, try 'initial' without 'begin'
    if modified == testbench_content:
        pattern = r'(initial\b)'
        replacement = (
            r'\1 begin\n'
            '    $dumpfile("' + dumpfile_name + '");\n'
            '    $dumpvars(0);\n'
            '    end\n    initial'
        )
        # Don't try this fallback — it's too fragile.
        # Just return as-is and let the user handle it.
        pass

    return modified


def exec_verilog(sources, testbench, task_id, mode='simulate', compiler='iverilog'):
    """
    Execute Verilog compilation and simulation.

    Args:
        sources: list of dicts [{"filename": "alu.v", "content": "..."}]
        testbench: dict {"filename": "tb_alu.v", "content": "..."}
        task_id: UUID string for unique directory
        mode: 'simulate' or 'syntax_check'

    Returns:
        dict with keys: compile_log, sim_output, waveform, success
    """
    result = {
        'compile_log': '',
        'sim_output': '',
        'waveform': {"data": [], "graph": "false"},
        'success': False
    }

    current_dir = os.path.join(settings.MEDIA_ROOT, str(task_id))

    try:
        # Make unique directory for this simulation
        Path(current_dir).mkdir(parents=True, exist_ok=True)

        # Write all source files to the temp directory
        all_files = []
        for src in sources:
            filename = src['filename']
            if compiler == 'vhdl' and filename.endswith('.v'):
                filename = filename[:-2] + '.vhd'
            elif compiler == 'vhdl' and filename.endswith('.sv'):
                filename = filename[:-3] + '.vhd'
                
            filepath = os.path.join(current_dir, filename)
            with open(filepath, 'w') as f:
                f.write(src['content'])
            all_files.append(filepath)

        # Write testbench (with auto-injected $dumpvars if missing for Verilog)
        tb_filename = testbench['filename']
        if compiler == 'vhdl':
            tb_content = testbench['content']
            if tb_filename.endswith('.v'):
                tb_filename = tb_filename[:-2] + '.vhd'
            elif tb_filename.endswith('.sv'):
                tb_filename = tb_filename[:-3] + '.vhd'
        else:
            tb_content = inject_dumpvars(testbench['content'])
            
        tb_filepath = os.path.join(current_dir, tb_filename)
        with open(tb_filepath, 'w') as f:
            f.write(tb_content)
        all_files.append(tb_filepath)

        # --- Step 1: Compile & Simulate ---
        if compiler == 'vhdl':
            compile_log_out = ''
            tb_entity = tb_filename.split('.')[0]
            
            # Dynamically extract the entity name from the testbench VHDL
            # code. When one file holds both the design and the testbench,
            # the testbench entity is conventionally declared last.
            entities = re.findall(r'(?i)entity\s+([a-zA-Z0-9_]+)\s+is',
                                  tb_content)
            if entities:
                tb_entity = entities[-1]
            
            if mode == 'syntax_check':
                for filepath in all_files:
                    proc = subprocess.Popen(['nvc', '-a', filepath], stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=current_dir)
                    stdout, stderr = proc.communicate(timeout=30)
                    compile_log_out += stdout.decode('utf-8', errors='replace') + stderr.decode('utf-8', errors='replace')
                    if proc.returncode != 0:
                        result['compile_log'] = compile_log_out + '\n[ERROR] Syntax check failed for ' + filepath
                        return result
                result['success'] = True
                result['compile_log'] = '[OK] VHDL Syntax check passed.\n' + compile_log_out
                return result

            # Full simulation: analyze + elaborate + run in ONE nvc
            # invocation. Separate -a / -e / -r processes fail with
            # "missing body for WORK.<ENTITY>" on the NVC 1.11 build used
            # in the container; the combined form is also what upstream
            # documents.
            logger.info('Running NVC simulation (top: %s)', tb_entity)
            cmd = (['nvc', '-a'] + all_files +
                   ['-e', tb_entity,
                    '-r', tb_entity, '--wave=dump.vcd', '--format=vcd'])
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=current_dir)
            stdout, stderr = proc.communicate(timeout=30)
            out = (stdout.decode('utf-8', errors='replace') +
                   stderr.decode('utf-8', errors='replace'))
            if proc.returncode != 0 and not [
                    f for f in os.listdir(current_dir)
                    if f.endswith('.vcd') and
                    os.path.getsize(os.path.join(current_dir, f)) > 0]:
                result['compile_log'] = out + \
                    '\n[ERROR] NVC simulation failed for ' + tb_entity
                return result
            result['compile_log'] = '[OK] VHDL Compilation successful.'
            result['sim_output'] = out
            logger.info('nvc simulation completed with code %d', proc.returncode)

        else:
            # --- Icarus Verilog Logic ---
            output_vvp = os.path.join(current_dir, 'sim.vvp')
            if compiler == 'systemverilog':
                compile_cmd = ['iverilog', '-g2012']
            else:
                compile_cmd = ['iverilog']

            if mode == 'syntax_check':
                compile_cmd += ['-t', 'null'] + all_files
            else:
                compile_cmd += ['-o', output_vvp] + all_files

            logger.info('Running iverilog compile: %s', ' '.join(compile_cmd))
            proc = subprocess.Popen(compile_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=current_dir)
            stdout, stderr = proc.communicate(timeout=30)

            compile_stdout = stdout.decode('utf-8', errors='replace')
            compile_stderr = stderr.decode('utf-8', errors='replace')
            result['compile_log'] = compile_stdout + compile_stderr

            if proc.returncode != 0:
                logger.error('iverilog compilation failed: %s', compile_stderr)
                result['compile_log'] = '[ERROR] Compilation failed with exit code ' + str(proc.returncode) + '\n' + result['compile_log']
                return result

            if mode == 'syntax_check':
                result['success'] = True
                result['compile_log'] = '[OK] Syntax check passed. No errors found.\n' + result['compile_log']
                return result

            if not os.path.isfile(output_vvp):
                result['compile_log'] += '\n[ERROR] Compiled output not found.'
                return result

            logger.info('Running vvp simulation')
            proc = subprocess.Popen(['vvp', output_vvp], stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=current_dir)
            stdout, stderr = proc.communicate(timeout=30)

            sim_stdout = stdout.decode('utf-8', errors='replace')
            sim_stderr = stderr.decode('utf-8', errors='replace')
            result['sim_output'] = sim_stdout + sim_stderr
            result['compile_log'] = '[OK] Compilation successful.\n' + result['compile_log']
            logger.info('vvp simulation completed with code %d', proc.returncode)

        # --- Step 3: Parse VCD ---
        vcd_files = [f for f in os.listdir(current_dir) if f.endswith('.vcd')]
        if vcd_files:
            vcd_path = os.path.join(current_dir, vcd_files[0])
            result['waveform'] = parse_vcd(vcd_path)

            # Also read raw VCD for download
            try:
                with open(vcd_path, 'r') as f:
                    result['vcd_raw'] = f.read()
            except Exception:
                result['vcd_raw'] = ''
        else:
            # No VCD file — simulation ran but no waveform output
            result['waveform'] = {
                "data": [], "graph": "false",
                "error": "No VCD file generated. Ensure your testbench "
                         "contains $dumpfile and $dumpvars."
            }

        result['success'] = True
        return result

    except subprocess.TimeoutExpired:
        result['compile_log'] += '\n[ERROR] Process timed out (30s limit).'
        return result
    except SoftTimeLimitExceeded:
        result['compile_log'] += '\n[ERROR] Celery time limit exceeded.'
        return result
    except Exception as e:
        logger.exception('Verilog simulation error:')
        result['compile_log'] += '\n[ERROR] ' + str(e)
        return result
    finally:
        # Clean up temp directory
        try:
            if os.path.isdir(current_dir):
                shutil.rmtree(current_dir)
                logger.info('Cleaned up temp dir: %s', current_dir)
        except Exception as e:
            logger.warning('Cleanup failed: %s', e)
