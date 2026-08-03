"""
Minimal, dependency-free VCD (Value Change Dump) parser.

Converts VCD text produced by Icarus Verilog (vvp) or GHDL into the
JSON-friendly structure consumed by the frontend Logic Analyzer:

    {
        'timescale': '1ns',
        'endtime': 1500,
        'signals': [
            {
                'name': 'tb_counter.uut.count',
                'width': 4,
                'wave': [[0, 'xxxx'], [10, '0000'], [30, '0001'], ...]
            },
            ...
        ]
    }

Scalar values are single characters ('0', '1', 'x', 'z').
Vector values are plain binary strings without the 'b' prefix,
zero-extended to the declared width. Real values are kept as their
string representation.
"""

import re

_VAR_RE = re.compile(
    r'\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+(.+?)\s+\$end')
_SCOPE_RE = re.compile(r'\$scope\s+\w+\s+(\S+)\s+\$end')
_TIMESCALE_RE = re.compile(r'\$timescale\s+(.+?)\s*\$end', re.S)


def _extend(value, width):
    """Zero/x/z-extend a binary vector to its declared width
    (VCD emitters strip leading repeated bits)."""
    if len(value) >= width:
        return value[-width:] if len(value) > width else value
    pad = value[0] if value and value[0] in 'xz' else '0'
    return pad * (width - len(value)) + value


def parse_vcd(text, max_signals=256, max_changes=200000):
    """Parse VCD text. Returns dict described in the module docstring.

    max_signals / max_changes guard against pathological dumps blowing
    up the JSON payload; extra data is truncated, and a 'truncated'
    flag is set so the UI can warn the user.
    """
    timescale = '1ns'
    m = _TIMESCALE_RE.search(text)
    if m:
        timescale = ' '.join(m.group(1).split())

    # id -> {'name', 'width', 'wave'}; several $var lines may share an
    # id (aliases) — keep the first, remember the alias names.
    signals_by_id = {}
    order = []
    scope_stack = []
    truncated = False

    lines = text.splitlines()
    i = 0
    n = len(lines)

    # ---- header ----
    while i < n:
        line = lines[i].strip()
        i += 1
        if line.startswith('$scope'):
            m = _SCOPE_RE.match(line)
            if m:
                scope_stack.append(m.group(1))
        elif line.startswith('$upscope'):
            if scope_stack:
                scope_stack.pop()
        elif line.startswith('$var'):
            m = _VAR_RE.match(line)
            if m:
                _vtype, width, ident, ref = m.groups()
                width = int(width)
                # strip bit-range suffix like "count [3:0]"
                name = ref.split('[')[0].strip()
                full = '.'.join(scope_stack + [name])
                if ident not in signals_by_id:
                    if len(signals_by_id) >= max_signals:
                        truncated = True
                        continue
                    signals_by_id[ident] = {
                        'name': full, 'width': width, 'wave': []}
                    order.append(ident)
        elif line.startswith('$enddefinitions'):
            break

    # ---- value changes ----
    time = 0
    endtime = 0
    total_changes = 0
    while i < n:
        line = lines[i].strip()
        i += 1
        if not line:
            continue
        c = line[0]
        if c == '#':
            try:
                time = int(line[1:])
                endtime = max(endtime, time)
            except ValueError:
                pass
        elif c in 'bB':
            # vector: b1010 identifier
            parts = line.split()
            if len(parts) == 2:
                val, ident = parts[0][1:].lower(), parts[1]
                sig = signals_by_id.get(ident)
                if sig is not None and total_changes < max_changes:
                    sig['wave'].append([time, _extend(val, sig['width'])])
                    total_changes += 1
                elif sig is not None:
                    truncated = True
        elif c in 'rR':
            parts = line.split()
            if len(parts) == 2:
                val, ident = parts[0][1:], parts[1]
                sig = signals_by_id.get(ident)
                if sig is not None and total_changes < max_changes:
                    sig['wave'].append([time, val])
                    total_changes += 1
        elif c in '01xXzZ':
            # scalar: 0identifier
            ident = line[1:]
            sig = signals_by_id.get(ident)
            if sig is not None and total_changes < max_changes:
                sig['wave'].append([time, c.lower()])
                total_changes += 1
            elif sig is not None:
                truncated = True
        # $dumpvars / $end / comments — ignore

    return {
        'timescale': timescale,
        'endtime': endtime,
        'truncated': truncated,
        'signals': [signals_by_id[k] for k in order],
    }
