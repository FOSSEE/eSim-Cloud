"""
spice_model_parser.py — Whitelist-based SPICE model sanitizer for Issue #539.

Security-critical module. This is the ONLY gate between user-uploaded content
and the ngspice execution engine. It operates as a WHITELIST parser: only
explicitly allowed SPICE constructs pass through. Everything else is rejected.

Key security properties:
1. Line continuations ('+') are resolved BEFORE any directive checking,
   preventing evasion via split directives like ".con\\n+trol".
2. Blocked directives are checked against the fully-resolved logical line.
3. No `.include`, `.lib` (file ref), `.control`, `shell`, `system`, `set`
   directives are permitted.
4. Shell metacharacters (|, ;, backticks, $()) are rejected at the character
   level on every logical line.

Author: Backend team (Issue #539)
"""

import re
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# Maximum upload size enforced at serializer level (512KB), but also
# defend-in-depth here with a hard character limit.
# ============================================================================
MAX_MODEL_CHARS = 524288  # 512 * 1024

# ============================================================================
# BLOCKED DIRECTIVES — checked against fully-resolved (continuation-joined)
# logical lines. Case-insensitive.
# ============================================================================
BLOCKED_DIRECTIVES_RE = re.compile(
    r'^\s*\.'
    r'(?:control|endc|include|lib\s+[\"\']|options|save|op\b|'
    r'four|sens|disto|noise|pz|tf\b)',
    re.IGNORECASE
)

# Standalone dangerous commands (not dot-prefixed)
BLOCKED_COMMANDS_RE = re.compile(
    r'^\s*(?:shell|system|set\s|unset\s|source\s|cd\s|quit|exit)',
    re.IGNORECASE
)

# Shell metacharacters that should NEVER appear in component values.
# Catches: | ; ` $( ) and common shell injection patterns.
SHELL_METACHAR_RE = re.compile(
    r'[|;`]'
    r'|\$\('
    r'|\$\{'
    r'|>\s*/'       # output redirection to absolute path
    r'|<\s*/'       # input redirection from absolute path
)

# ============================================================================
# ALLOWED line prefixes — whitelist of safe SPICE constructs.
# Checked against the FIRST non-whitespace character(s) of each logical line.
# ============================================================================
# Component instance prefixes (case-insensitive first char):
#   R=resistor, C=capacitor, L=inductor, D=diode, Q=BJT, M=MOSFET,
#   J=JFET, V=voltage source, I=current source, E/F/G/H=dependent sources,
#   X=subcircuit instance, K=mutual inductance, T/W=transmission lines,
#   S/W=switches, B=behavioral source (PSPICE/LTspice)
COMPONENT_PREFIX_RE = re.compile(
    r'^[RCLVIDEQMJXKTWSFGHB]\w*\s',
    re.IGNORECASE
)

# Allowed dot-directives
ALLOWED_DOT_DIRECTIVES_RE = re.compile(
    r'^\s*\.'
    r'(?:subckt|ends|model|param|func|global|tran|ac|dc|'
    r'ic|nodeset|temp|meas|measure|step|print|plot|probe|width|'
    r'end)\b',
    re.IGNORECASE
)

# Comment lines (* at start, or $ inline — $ is handled separately)
COMMENT_RE = re.compile(r'^\s*\*')

# Blank / whitespace-only
BLANK_RE = re.compile(r'^\s*$')


class SanitizeResult:
    """Result of the sanitization pass."""

    __slots__ = (
        'is_valid', 'sanitized_content', 'errors', 'warnings', 'metadata'
    )

    def __init__(self):
        self.is_valid = False
        self.sanitized_content = ''
        self.errors = []
        self.warnings = []
        self.metadata = {}

    def to_dict(self):
        return {
            'is_valid': self.is_valid,
            'errors': self.errors,
            'warnings': self.warnings,
            'metadata': self.metadata,
        }


# ============================================================================
# PUBLIC API
# ============================================================================

def sanitize_spice_model(raw_text):
    """
    Main entry point. Ingests raw user-uploaded SPICE model text,
    validates structure, strips dangerous constructs, and returns a
    SanitizeResult.

    Args:
        raw_text (str): The raw uploaded file content.

    Returns:
        SanitizeResult with is_valid, sanitized_content, errors,
        warnings, and metadata.
    """
    result = SanitizeResult()

    # ------------------------------------------------------------------
    # 0. Size guard (defense-in-depth; serializer also enforces 512KB)
    # ------------------------------------------------------------------
    if len(raw_text) > MAX_MODEL_CHARS:
        result.errors.append(
            'File exceeds maximum allowed size of 512KB '
            '({} chars)'.format(len(raw_text))
        )
        return result

    if not raw_text.strip():
        result.errors.append('File is empty')
        return result

    # ------------------------------------------------------------------
    # 1. Normalize line endings and resolve line continuations.
    #    In SPICE, a '+' at the start of a line means "continuation of
    #    the previous logical line". We MUST resolve these BEFORE checking
    #    for blocked directives, otherwise an attacker can split
    #    ".control" across lines as ".con\n+trol".
    # ------------------------------------------------------------------
    raw_lines = raw_text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    logical_lines = _resolve_continuations(raw_lines)

    # ------------------------------------------------------------------
    # 2. Per-line whitelist validation on each LOGICAL (resolved) line.
    # ------------------------------------------------------------------
    safe_lines = []
    for line_num, logical_line in enumerate(logical_lines, start=1):
        is_safe, reason = _is_line_safe(logical_line)
        if is_safe:
            safe_lines.append(logical_line)
        else:
            result.errors.append(
                'Line {}: BLOCKED — {}'.format(line_num, reason)
            )

    if result.errors:
        # If any line was blocked, the entire model is invalid.
        # Do NOT return partial content.
        return result

    # ------------------------------------------------------------------
    # 3. Structural validation: matched .subckt/.ends pairs.
    # ------------------------------------------------------------------
    structural_errors = _validate_structure(safe_lines)
    if structural_errors:
        result.errors.extend(structural_errors)
        return result

    # ------------------------------------------------------------------
    # 4. Extract metadata from the validated content.
    # ------------------------------------------------------------------
    sanitized_text = '\n'.join(safe_lines)
    result.metadata = extract_metadata(sanitized_text)
    result.sanitized_content = sanitized_text
    result.is_valid = True

    return result


def extract_metadata(sanitized_text):
    """
    Extract structural metadata from already-sanitized SPICE text.

    Returns dict with keys:
    - subckt_name (str): name of the first .subckt found, or ''
    - pin_names (list[str]): pin names of the first .subckt
    - pin_count (int): number of pins
    - model_names (list[str]): names from .model directives
    - has_subckt (bool): whether a .subckt block exists
    """
    meta = {
        'subckt_name': '',
        'pin_names': [],
        'pin_count': 0,
        'model_names': [],
        'has_subckt': False,
    }

    for line in sanitized_text.split('\n'):
        stripped = line.strip().lower()

        # Match .subckt <name> <pin1> <pin2> ... [optional params]
        if stripped.startswith('.subckt'):
            tokens = line.split()
            if len(tokens) >= 2:
                meta['has_subckt'] = True
                if not meta['subckt_name']:
                    meta['subckt_name'] = tokens[1]
                    # Pins are tokens after the name, up to any
                    # param assignment (contains '=')
                    pins = []
                    for tok in tokens[2:]:
                        if '=' in tok:
                            break
                        pins.append(tok)
                    meta['pin_names'] = pins
                    meta['pin_count'] = len(pins)

        # Match .model <name> <type>(...)
        elif stripped.startswith('.model'):
            tokens = line.split()
            if len(tokens) >= 3:
                meta['model_names'].append(tokens[1])

    return meta


# ============================================================================
# INTERNAL HELPERS
# ============================================================================

def _resolve_continuations(raw_lines):
    """
    Resolve SPICE line continuations: a line starting with '+' is joined
    to the previous logical line. Returns a list of logical lines.

    Example:
        [".sub", "+ckt FOO a b", "R1 a b 1k"]
        → [".subckt FOO a b", "R1 a b 1k"]

    This is CRITICAL for security: without this, ".con\\n+trol" would
    bypass the .control block check.
    """
    logical = []
    for raw_line in raw_lines:
        stripped = raw_line.lstrip()
        if stripped.startswith('+') and logical:
            # Continuation: append to previous logical line.
            # Strip the leading '+' and any whitespace after it.
            continuation_text = stripped[1:].lstrip()
            logical[-1] = logical[-1] + ' ' + continuation_text
        else:
            logical.append(raw_line)
    return logical


def _is_line_safe(line):
    """
    Check a single LOGICAL line (continuations already resolved) against
    the whitelist. Returns (True, '') if safe, or (False, reason) if blocked.
    """
    # Blank lines and comments are always safe
    if BLANK_RE.match(line):
        return True, ''
    if COMMENT_RE.match(line):
        return True, ''

    # ------------------------------------------------------------------
    # BLOCK: Shell metacharacters anywhere in the FULL line.
    # This MUST run BEFORE $-based inline comment stripping, because
    # $(command) and ${variable} would otherwise be silently discarded
    # as "inline comments" by the split('$') below.
    # ------------------------------------------------------------------
    meta_match = SHELL_METACHAR_RE.search(line)
    if meta_match:
        return False, (
            'Shell metacharacter detected: "{}"'.format(
                meta_match.group())
        )

    # Strip inline comments ($ is the inline comment char in SPICE)
    # but preserve the line content before the comment.
    # Safe to do AFTER the metachar check above has already scanned
    # the full line for dangerous $ patterns.
    active_content = line.split('$')[0] if '$' in line else line

    # ------------------------------------------------------------------
    # BLOCK: Dangerous directives (checked on active content)
    # ------------------------------------------------------------------
    if BLOCKED_DIRECTIVES_RE.match(active_content):
        return False, (
            'Blocked directive: {}'.format(
                active_content.strip().split()[0])
        )

    if BLOCKED_COMMANDS_RE.match(active_content):
        return False, (
            'Blocked command: {}'.format(
                active_content.strip().split()[0])
        )

    # ------------------------------------------------------------------
    # ALLOW: Known-safe dot-directives
    # ------------------------------------------------------------------
    if active_content.strip().startswith('.'):
        if ALLOWED_DOT_DIRECTIVES_RE.match(active_content):
            return True, ''
        else:
            # Unknown dot-directive — reject by default (whitelist policy)
            directive = active_content.strip().split()[0]
            return False, (
                'Unknown/disallowed directive: {}'.format(directive)
            )

    # ------------------------------------------------------------------
    # ALLOW: Component instance lines (R1, C2, X1, M1, etc.)
    # ------------------------------------------------------------------
    if COMPONENT_PREFIX_RE.match(active_content.strip()):
        return True, ''

    # ------------------------------------------------------------------
    # If we reached here, the line doesn't match any known pattern.
    # Reject by default — whitelist policy.
    # ------------------------------------------------------------------
    return False, (
        'Line does not match any allowed SPICE construct: '
        '"{}"'.format(active_content.strip()[:80])
    )


def _validate_structure(lines):
    """
    Validate structural integrity: .subckt/.ends must be properly paired
    and nested. Returns a list of error strings (empty = valid).
    """
    errors = []
    subckt_stack = []

    for line_num, line in enumerate(lines, start=1):
        stripped = line.strip().lower()

        if stripped.startswith('.subckt'):
            tokens = line.split()
            subckt_name = tokens[1] if len(tokens) >= 2 else '<unnamed>'
            subckt_stack.append((subckt_name, line_num))

        elif stripped.startswith('.ends'):
            if not subckt_stack:
                errors.append(
                    'Line {}: .ends without matching .subckt'.format(line_num)
                )
            else:
                opened_name, opened_line = subckt_stack.pop()
                # If .ends has a name, it must match the .subckt name
                tokens = line.split()
                if len(tokens) >= 2:
                    ends_name = tokens[1]
                    if ends_name.lower() != opened_name.lower():
                        errors.append(
                            'Line {}: .ends {} does not match '
                            '.subckt {} from line {}'.format(
                                line_num, ends_name,
                                opened_name, opened_line)
                        )

    # Check for unclosed .subckt blocks
    for name, line_num in subckt_stack:
        errors.append(
            'Line {}: .subckt {} was never closed with .ends'.format(
                line_num, name)
        )

    return errors
