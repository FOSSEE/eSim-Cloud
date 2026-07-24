"""
chatbotAPI/services/context.py

Placeholder for context-building utilities. Will be used to gather
relevant schematic/simulation data before sending it to the LLM.
"""
import re
import logging

logger = logging.getLogger(__name__)

ALLOWED_CONTEXT_KEYS = {'page', 'components', 'netlist_snippet', 'last_simulation_error', 'analysis_type'}

def _truncate_string(s, max_chars=2048):
    if not isinstance(s, str):
        s = str(s)
    if len(s) > max_chars:
        return s[:max_chars] + "...[truncated]"
    return s

def _strip_html(s):
    if not isinstance(s, str):
        return s
    # Strip <script>...</script> blocks entirely
    s = re.sub(r'<script.*?</script>', '', s, flags=re.IGNORECASE | re.DOTALL)
    # Strip remaining HTML tags
    s = re.sub(r'<[^>]+>', '', s)
    return s

def _limit_depth(value, current_depth=1, max_depth=3, max_chars=2048):
    if current_depth > max_depth:
        return "[truncated: max depth exceeded]"
    
    if isinstance(value, dict):
        return {k: _limit_depth(v, current_depth + 1, max_depth, max_chars) for k, v in value.items()}
    elif isinstance(value, list):
        return [_limit_depth(v, current_depth + 1, max_depth, max_chars) for v in value]
    elif isinstance(value, str):
        return _truncate_string(_strip_html(value), max_chars)
    else:
        return value

def sanitize_context(data):
    """
    Takes the raw context dict and returns a cleaned, safe dict.
    """
    try:
        if not isinstance(data, dict) or not data:
            return {}
            
        # Map frontend camelCase to expected snake_case
        if 'netlistSnippet' in data and 'netlist_snippet' not in data:
            data['netlist_snippet'] = data.pop('netlistSnippet')
        if 'lastSimulationError' in data and 'last_simulation_error' not in data:
            data['last_simulation_error'] = data.pop('lastSimulationError')
            
        cleaned = {}
        for k, v in data.items():
            if k in ALLOWED_CONTEXT_KEYS:
                # 2e. netlist_snippet SPECIFIC TRUNCATION
                max_chars = 3000 if k == 'netlist_snippet' else 2048
                cleaned[k] = _limit_depth(v, current_depth=1, max_depth=3, max_chars=max_chars)
                    
        return cleaned
    except Exception as e:
        logger.error("Error in sanitize_context: %s", e)
        return {}

def build_context(request_data):
    """
    Build a context dictionary from the incoming chat request data.
    """
    return {}
