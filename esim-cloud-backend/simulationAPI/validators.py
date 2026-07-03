"""
Simulation input validation and sanitization (Task 5).

Enforces:
  - File size limits
  - Allowed MIME types
  - Netlist content sanity checks (suspicious shell-injection patterns)
  - Simulation type whitelist
"""
import re
import logging

from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_NETLIST_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB
ALLOWED_EXTENSIONS = {'.cir', '.sp', '.spice', '.net', '.txt'}
ALLOWED_SIMULATION_TYPES = {
    'NgSpiceSimulator',
    'KicadtoNgspice',
    'EsimSimulator',
}

# Patterns that should never appear in a legitimate netlist
DANGEROUS_PATTERNS = [
    re.compile(r'`[^`]*`'),                      # backtick command substitution
    re.compile(r'\$\(.*?\)', re.DOTALL),         # $(command)
    re.compile(r';\s*(rm|wget|curl|bash|sh)\b', re.IGNORECASE),
    re.compile(r'\|\s*(bash|sh)\b', re.IGNORECASE),
    re.compile(r'\.system\b', re.IGNORECASE),    # ngspice .system directive
    re.compile(r'\.exec\b', re.IGNORECASE),      # .exec directive
]


# ---------------------------------------------------------------------------
# Public validators
# ---------------------------------------------------------------------------

def validate_netlist_input(request) -> None:
    """
    Validate the incoming simulation POST request.

    Raises rest_framework.exceptions.ValidationError on failure so that
    views can propagate a structured 400 response.
    """
    files = request.FILES.getlist('file')

    if not files:
        raise ValidationError({'file': 'No netlist file provided.'})

    if len(files) > 1:
        raise ValidationError({'file': 'Only one netlist file per request is supported.'})

    netlist_file = files[0]

    # --- File size ---
    if netlist_file.size > MAX_NETLIST_SIZE_BYTES:
        raise ValidationError({
            'file': f'Netlist file exceeds the maximum allowed size of '
                    f'{MAX_NETLIST_SIZE_BYTES // 1024 // 1024} MB.'
        })

    # --- Extension ---
    filename = netlist_file.name.lower()
    if not any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise ValidationError({
            'file': f'Invalid file type "{netlist_file.name}". '
                    f'Allowed extensions: {", ".join(sorted(ALLOWED_EXTENSIONS))}.'
        })

    # --- Content sanity check ---
    try:
        content = netlist_file.read(MAX_NETLIST_SIZE_BYTES).decode('utf-8', errors='replace')
        netlist_file.seek(0)  # reset for subsequent read by serializer
    except Exception as exc:
        raise ValidationError({'file': f'Could not read file content: {exc}'})

    _check_dangerous_patterns(content)

    # --- Simulation type whitelist ---
    sim_type = request.data.get('simulationType', 'NgSpiceSimulator')
    if sim_type not in ALLOWED_SIMULATION_TYPES:
        raise ValidationError({
            'simulationType': f'Unknown simulation type "{sim_type}". '
                              f'Allowed: {", ".join(sorted(ALLOWED_SIMULATION_TYPES))}.'
        })


def _check_dangerous_patterns(content: str) -> None:
    """Scan netlist content for shell-injection or dangerous directives."""
    for pattern in DANGEROUS_PATTERNS:
        match = pattern.search(content)
        if match:
            logger.warning(
                "Suspicious pattern detected in netlist: %r at pos %d",
                match.group(0)[:80], match.start()
            )
            raise ValidationError({
                'file': 'Netlist content contains disallowed directives or patterns. '
                        'Please check your netlist for shell commands or dangerous directives.'
            })


def sanitize_string_field(value: str, max_length: int = 255) -> str:
    """Strip leading/trailing whitespace and truncate to max_length."""
    if not isinstance(value, str):
        return ''
    return value.strip()[:max_length]
