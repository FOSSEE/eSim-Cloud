"""
VCD (Value Change Dump) Parser for Verilog Simulation Output.

Converts a standard IEEE 1364 VCD file into the JSON format consumed by
the eSim-Cloud frontend Graph.js component:

    {
        "data": [
            {
                "labels": ["clk", "a", "b", "out"],
                "x": [0, 5, 10, ...],
                "y": [[0,1,0,...], [0,0,1,...], ...]
            }
        ],
        "graph": "true"
    }

For digital signals, values are converted to integers (0/1).
Multi-bit buses are converted to their decimal integer representation.
"""

import re
import logging

logger = logging.getLogger(__name__)


def parse_vcd(filepath):
    """
    Parse a VCD file and return data in the Graph.js-compatible format.

    Args:
        filepath: Absolute path to the .vcd file.

    Returns:
        dict with keys 'data', 'graph', or 'error' on failure.
    """
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            contents = f.read()
    except Exception as e:
        logger.error('Cannot open/read VCD file: %s, error: %s', filepath, str(e))
        return {'data': [], 'graph': 'false', 'error': 'Failed to read VCD file. File may be corrupt or binary.'}

    # --- Phase 1: Parse header to extract signal definitions ---
    # Map: identifier_code -> { name, size, scope }
    signals = {}
    # Track current scope for hierarchical naming
    scope_stack = []

    # Extract $var definitions
    # Format: $var wire 1 ! clk $end
    # Format: $var reg 8 " data [7:0] $end
    header_section = contents.split('$enddefinitions')[0] if '$enddefinitions' in contents else ''

    for line in header_section.split('\n'):
        line = line.strip()
        if line.startswith('$scope'):
            parts = line.split()
            if len(parts) >= 3:
                scope_stack.append(parts[2])
        elif line.startswith('$upscope'):
            if scope_stack:
                scope_stack.pop()
        elif line.startswith('$var'):
            # Parse: $var <type> <size> <id> <name> $end
            # Some names may include bit ranges like [7:0]
            match = re.match(
                r'\$var\s+\w+\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+\[.*?\])?\s+\$end',
                line
            )
            if match:
                size = int(match.group(1))
                identifier = match.group(2)
                name = match.group(3)
                # Prefix with scope hierarchy
                if scope_stack:
                    full_name = '.'.join(scope_stack) + '.' + name
                else:
                    full_name = name
                signals[identifier] = {
                    'name': full_name,
                    'size': size,
                    'values': [],   # list of (time, value) tuples
                }

    if not signals:
        return {"data": [], "graph": "false",
                "error": "No signal definitions found in VCD file"}

    # --- Phase 2: Parse value changes ---
    # Find the section after $enddefinitions $end
    data_section = ''
    if '$enddefinitions' in contents:
        data_section = contents.split('$enddefinitions')[1]
        # Skip past the $end that closes $enddefinitions
        idx = data_section.find('$end')
        if idx >= 0:
            data_section = data_section[idx + 4:]

    current_time = 0
    for line in data_section.split('\n'):
        line = line.strip()
        if not line or line.startswith('$'):
            # Skip empty lines and VCD directives ($dumpvars, $end, etc.)
            continue

        # Timestamp line: #<number>
        if line.startswith('#'):
            try:
                current_time = int(line[1:])
            except ValueError:
                continue

        # Single-bit value change: <value><identifier>
        # e.g., "0!" or "1!" or "x!"
        elif len(line) >= 2 and line[0] in '01xXzZ':
            value_char = line[0]
            identifier = line[1:]
            if identifier in signals:
                if value_char in ('x', 'X', 'z', 'Z'):
                    int_val = 0  # Map undefined to 0 for plotting
                else:
                    int_val = int(value_char)
                signals[identifier]['values'].append(
                    (current_time, int_val))

        # Multi-bit value change: b<binary> <identifier>
        # e.g., "b10110 #"
        elif line.startswith('b') or line.startswith('B'):
            parts = line.split()
            if len(parts) >= 2:
                binary_str = parts[0][1:]  # strip leading 'b'
                identifier = parts[1]
                if identifier in signals:
                    # Replace x/z with 0 for numeric conversion
                    clean = binary_str.replace('x', '0').replace(
                        'X', '0').replace('z', '0').replace('Z', '0')
                    try:
                        int_val = int(clean, 2)
                    except ValueError:
                        int_val = 0
                    signals[identifier]['values'].append(
                        (current_time, int_val))

    # --- Phase 3: Convert to Graph.js format ---
    # Collect all unique timestamps across all signals
    all_times = set()
    for sig in signals.values():
        for t, _ in sig['values']:
            all_times.add(t)

    if not all_times:
        return {"data": [], "graph": "false",
                "error": "No value changes found in VCD file"}

    sorted_times = sorted(all_times)

    # Build the x and y arrays
    labels = []
    y_arrays = []

    for identifier in sorted(signals.keys(),
                              key=lambda k: signals[k]['name']):
        sig = signals[identifier]
        labels.append(sig['name'])

        # For each timestamp, find the signal's value at that time
        # VCD is event-driven: a signal holds its value until the next change
        value_dict = {}
        for t, v in sig['values']:
            value_dict[t] = v

        # Build the continuous y array by carrying forward the last known value
        y = []
        last_val = 0
        for t in sorted_times:
            if t in value_dict:
                last_val = value_dict[t]
            y.append(str(last_val))
        y_arrays.append(y)

    x_values = [str(t) for t in sorted_times]

    json_data = {
        "data": [
            {
                "labels": labels,
                "x": x_values,
                "y": y_arrays
            }
        ],
        "graph": "true"
    }

    return json_data


if __name__ == '__main__':
    import sys
    import json
    if len(sys.argv) > 1:
        result = parse_vcd(sys.argv[1])
        print(json.dumps(result, indent=2))
