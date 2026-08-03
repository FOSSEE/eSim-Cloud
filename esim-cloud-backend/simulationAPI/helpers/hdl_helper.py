"""
Compile & run HDL sources (Icarus Verilog / GHDL) and return parsed
VCD waveform data for the Logic Analyzer frontend.

Success payload:
    {'graph': 'vcd', 'stdout': '...', 'timescale': ..., 'endtime': ...,
     'truncated': bool, 'signals': [...]}

Failure payload (celery task still SUCCEEDS, mirroring ngspice_helper):
    {'fail': '<raw tool output>', 'error_help': {summary, hints, codes}}
"""

import glob
import os
import re
import shutil
import subprocess
import logging
from pathlib import Path
from django.conf import settings
from .vcd_parser import parse_vcd

logger = logging.getLogger(__name__)

STEP_TIMEOUT = 30  # seconds per subprocess step
GHDL_DEFAULT_STOP_TIME = '1ms'

_VHDL_ENTITY_RE = re.compile(r'^\s*entity\s+(\w+)\s+is', re.I | re.M)
_VLOG_MODULE_RE = re.compile(r'^\s*module\s+(\w+)', re.M)


def _run(cmd, cwd):
    """Run one toolchain step; returns (ok, combined_output)."""
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=STEP_TIMEOUT)
    except subprocess.TimeoutExpired:
        return False, ' '.join(cmd) + ': timed out after %ss' % STEP_TIMEOUT
    except FileNotFoundError:
        return False, cmd[0] + ': simulator not installed on this server'
    out = (proc.stdout or b'').decode('utf-8', errors='replace')
    return proc.returncode == 0, out


def _error_help(tool, output):
    """Best-effort structured hints for common HDL tool failures."""
    hints = []
    codes = []
    low = output.lower()
    if 'not installed' in low:
        hints.append('The %s toolchain is missing from the simulation '
                     'server. Contact the administrator.' % tool)
    if 'syntax error' in low or 'parse error' in low:
        hints.append('Check the reported line for a missing semicolon, '
                     'keyword typo or unbalanced begin/end block.')
    if 'timed out' in low:
        hints.append('The simulation ran too long. Make sure the '
                     'testbench calls $finish (Verilog) or that all '
                     'processes eventually wait forever (VHDL).')
    if 'no vcd file' in low:
        hints.append('Add waveform dumping to the testbench: '
                     '$dumpfile("wave.vcd"); $dumpvars(0, <testbench>); '
                     'for Verilog. GHDL dumps automatically via --vcd.')
    for m in re.finditer(r'^(.*?:\d+):', output, re.M):
        codes.append(m.group(1))
    return {
        'summary': output.strip().splitlines()[0] if output.strip()
        else tool + ' failed without output',
        'hints': hints,
        'codes': codes[:10],
    }


def _fail(tool, output):
    logger.error('%s failed:\n%s', tool, output)
    return {'fail': output, 'error_help': _error_help(tool, output)}


def _find_vcd(workdir):
    vcds = sorted(glob.glob(os.path.join(workdir, '*.vcd')),
                  key=os.path.getmtime, reverse=True)
    return vcds[0] if vcds else None


def _success(workdir, stdout):
    vcd_path = _find_vcd(workdir)
    if vcd_path is None:
        return _fail('simulation', stdout + '\nNo VCD file was produced.')
    with open(vcd_path, 'r', errors='replace') as f:
        parsed = parse_vcd(f.read())
    if not parsed['signals']:
        return _fail('simulation',
                     stdout + '\nNo VCD file was produced. The dump '
                     'contained no signals.')
    parsed['graph'] = 'vcd'
    parsed['stdout'] = stdout[-20000:]
    return parsed


def _exec_iverilog(src_path, workdir):
    out_vvp = os.path.join(workdir, 'design.vvp')
    ok, out1 = _run(['iverilog', '-g2012', '-o', out_vvp, src_path], workdir)
    if not ok:
        return _fail('iverilog', out1)
    # -n: non-interactive; VCD lands in workdir because vvp runs there
    ok, out2 = _run(['vvp', '-n', out_vvp], workdir)
    if not ok:
        return _fail('vvp', out2)
    return _success(workdir, out1 + out2)


def _exec_ghdl(src_path, workdir, stop_time):
    entities = _VHDL_ENTITY_RE.findall(open(src_path, errors='replace')
                                       .read())
    if not entities:
        return _fail('ghdl', 'No VHDL entity found in the source file.')
    top = entities[-1]  # convention: testbench entity declared last
    std = ['--std=08', '--workdir=' + workdir, '--work=work']
    ok, out1 = _run(['ghdl', '-a'] + std + [src_path], workdir)
    if not ok:
        return _fail('ghdl', out1)
    ok, out2 = _run(['ghdl', '-e'] + std + [top], workdir)
    if not ok:
        return _fail('ghdl', out2)
    run_cmd = ['ghdl', '-r'] + std + [top, '--vcd=wave.vcd']
    if stop_time:
        run_cmd.append('--stop-time=' + stop_time)
    ok, out3 = _run(run_cmd, workdir)
    # ghdl -r returns non-zero on assertion failure but may still have
    # dumped a usable VCD — only hard-fail when nothing was dumped.
    if not ok and _find_vcd(workdir) is None:
        return _fail('ghdl', out3)
    return _success(workdir, out1 + out2 + out3)


def ExecHDL(filepath, file_id, simulator, stop_time=None):
    """Entry point called from the celery task.

    simulator: 'iverilog' | 'ghdl'
    stop_time: GHDL --stop-time value, e.g. '1000ns' (default 1ms)
    """
    if not os.path.isfile(filepath):
        raise IOError(filepath + ' does not exist')

    workdir = os.path.join(settings.MEDIA_ROOT, str(file_id))
    Path(workdir).mkdir(parents=True, exist_ok=True)

    # Toolchains care about extensions; copy the upload with the right one
    ext = '.v' if simulator == 'iverilog' else '.vhdl'
    src_path = os.path.join(workdir, 'design' + ext)
    shutil.copyfile(filepath, src_path)

    if simulator == 'iverilog':
        return _exec_iverilog(src_path, workdir)
    if simulator == 'ghdl':
        return _exec_ghdl(src_path, workdir,
                          stop_time or GHDL_DEFAULT_STOP_TIME)
    return _fail(simulator, 'Unknown simulator "%s". Use "iverilog" or '
                 '"ghdl".' % simulator)
