"""
Shared client for the live HDL-simulation flow test suites.

Talks to a running eSim-Cloud stack exactly like the VerilogSimulator
frontend: POST api/verilog/upload (sources + testbench JSON), poll
api/verilog/status/<task_id> until the celery task settles, return the
result details dict.

Used by test_iverilog_flow.py, test_systemverilog_flow.py and
test_vhdl_flow.py — run those directly, not this module.
"""

import json
import sys
import time
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost/api').rstrip('/')
POLL_TIMEOUT = 90
POLL_INTERVAL = 1.0

PASS, FAIL = [], []


def _http(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def run_task(sources, testbench, mode='simulate', compiler='iverilog'):
    """Submit one job and poll it to completion; returns details dict."""
    body = {'sources': sources, 'testbench': testbench,
            'mode': mode, 'compiler': compiler}
    res = _http('POST', BASE + '/verilog/upload', body)
    task_id = res.get('task_id')
    assert task_id, 'no task_id in upload response: %r' % res
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        st = _http('GET', BASE + '/verilog/status/' + task_id)
        if st['state'] == 'SUCCESS':
            return st.get('details') or {}
        if st['state'] == 'FAILURE':
            raise AssertionError('celery FAILURE: %r' % (st.get('details'),))
        time.sleep(POLL_INTERVAL)
    raise AssertionError('poll timed out after %ss' % POLL_TIMEOUT)


def check(name, fn):
    t0 = time.time()
    try:
        fn()
        PASS.append(name)
        print('PASS  %-46s (%.1fs)' % (name, time.time() - t0))
    except Exception as e:
        FAIL.append((name, str(e)))
        print('FAIL  %-46s %s' % (name, e))


def finish(suite_name):
    print('\n[%s] %d passed, %d failed' % (suite_name, len(PASS), len(FAIL)))
    sys.exit(1 if FAIL else 0)
