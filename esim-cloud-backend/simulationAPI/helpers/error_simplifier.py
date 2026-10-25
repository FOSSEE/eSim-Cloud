ERROR_MESSAGES = {
    'singular matrix': 'Short circuit detected — check your connections',
    'floating node': 'Unconnected component found — connect all pins',
    'timestep too small': 'Circuit is unstable — check your component values',
    'no such file': 'Simulation file not found — please try again',
    'undefined symbol': 'Unknown component model — check component type',
    'could not find': 'Component model not found — check your circuit',
    'tran simulation': 'Transient simulation failed — reduce time step',
    'ac simulation': 'AC simulation failed — check frequency range',
    'convergence': 'Circuit failed to converge — check component values',
    'time limit exceeded': 'Simulation timed out — simplify your circuit',
}

def simplify_error(raw_error):
    raw_lower = raw_error.lower()
    for key, message in ERROR_MESSAGES.items():
        if key in raw_lower:
            return message
    return 'Simulation failed — please check your circuit connections'
