"""
SPICE -> ngspice parser.
Sia's endpoint calls: convert_spice(text) -> dict
Return keys: 'components' (list), 'netlist' (str), 'errors' (list)
"""

MAPPING = {
    'R': 'resistor',
    'C': 'capacitor',
    'L': 'inductor',
    'V': 'vsource',
    'I': 'isource',
    'D': 'diode',
    'Q': 'transistor',
    'M': 'mosfet',
    'E': 'vcvs',
    'F': 'cccs',
    'G': 'vccs',
    'H': 'ccvs',
    'K': 'coupling',
    'T': 'transmission_line',
    'X': 'subcircuit'
}


def convert_spice(text):
    components = []
    directives = []
    errors = []
    sim_type = 'tran'
    sim_directive = '.tran 1m 10m'

    for i, line in enumerate(text.splitlines(), 1):
        line = line.strip()

        if not line or line.startswith('*'):
            continue

        if line.startswith('.'):
            low = line.lower()
            if low.startswith('.end'):
                continue
            if low.startswith('.tran') or low.startswith('.ac') or low.startswith('.dc'):
                sim_directive = line
                sim_type = low.split()[0][1:]
            directives.append({'line': i, 'directive': line})
            continue

        parts = line.split()
        if len(parts) < 3:
            errors.append(f"Line {i}: too short — '{line}'")
            continue

        name = parts[0]
        first = name[0].upper()
        component_type = MAPPING.get(first, 'unknown')

        # Multi-node components
        if first == 'Q':
            # Q name collector base emitter model
            components.append({
                'name': name,
                'type': 'transistor',
                'nodes': parts[1:4],
                'value': parts[4] if len(parts) > 4 else None,
                'extra': parts[5:] if len(parts) > 5 else []
            })
        elif first == 'M':
            # M name drain gate source bulk model
            components.append({
                'name': name,
                'type': 'mosfet',
                'nodes': parts[1:5],
                'value': parts[5] if len(parts) > 5 else None,
                'extra': parts[6:] if len(parts) > 6 else []
            })
        elif first == 'X':
            # X name node1 node2 ... subckt_name
            components.append({
                'name': name,
                'type': 'subcircuit',
                'nodes': parts[1:-1],
                'value': parts[-1],
                'extra': []
            })
        else:
            components.append({
                'name': name,
                'type': component_type,
                'nodes': [parts[1], parts[2]],
                'value': parts[3] if len(parts) > 3 else None,
                'extra': parts[4:] if len(parts) > 4 else []
            })

    # Netlist generate karo
    netlist_lines = []
    netlist_lines.append('* Converted by eSim LTspice Parser')
    netlist_lines.append('')

    for c in components:
        if c['type'] in ['resistor', 'capacitor', 'inductor']:
            netlist_lines.append(
                f"{c['name']} {c['nodes'][0]} {c['nodes'][1]} {c['value']}"
            )
        elif c['type'] == 'vsource':
            extra = ' '.join(c['extra']) if c['extra'] else ''
            netlist_lines.append(
                f"{c['name']} {c['nodes'][0]} {c['nodes'][1]} {c['value']} {extra}".strip()
            )
        elif c['type'] == 'isource':
            extra = ' '.join(c['extra']) if c['extra'] else ''
            netlist_lines.append(
                f"{c['name']} {c['nodes'][0]} {c['nodes'][1]} {c['value']} {extra}".strip()
            )
        elif c['type'] == 'diode':
            netlist_lines.append(
                f"{c['name']} {c['nodes'][0]} {c['nodes'][1]} {c['value']}"
            )
        elif c['type'] == 'transistor':
            nodes = ' '.join(c['nodes'])
            netlist_lines.append(
                f"{c['name']} {nodes} {c['value']}"
            )
        elif c['type'] == 'mosfet':
            nodes = ' '.join(c['nodes'])
            netlist_lines.append(
                f"{c['name']} {nodes} {c['value']}"
            )
        elif c['type'] == 'subcircuit':
            nodes = ' '.join(c['nodes'])
            netlist_lines.append(
                f"{c['name']} {nodes} {c['value']}"
            )
        else:
            netlist_lines.append(f"* UNKNOWN: {c['name']}")

    netlist_lines.append('')
    netlist_lines.append(sim_directive)
    netlist_lines.append('')

    # Control block — simulation run karo
    netlist_lines.append('.control')
    netlist_lines.append('run')
    netlist_lines.append('print all')
    netlist_lines.append('.endc')
    netlist_lines.append('')
    netlist_lines.append('.end')

    return {
        'components': components,
        'netlist': '\n'.join(netlist_lines),
        'errors': errors
    }