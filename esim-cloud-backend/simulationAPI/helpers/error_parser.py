import re

def parse_ngspice_error(stderr_text: str) -> dict:
    """
    Parses ngspice stderr text and extracts friendly error summaries,
    hints, and specific error codes or keywords.

    Args:
        stderr_text (str): Raw stderr text from ngspice output.

    Returns:
        dict: A dictionary containing:
            - 'summary' (str): A short sentence describing what went wrong.
            - 'hints' (list of str): Actionable steps to fix the problem.
            - 'codes' (list of str): Specific error codes or keywords.
    """
    try:
        if not isinstance(stderr_text, str):
            stderr_text = str(stderr_text)
            
        lower_stderr = stderr_text.lower()
        
        # Extract important lines (ERROR:, Note:, could not find, can't find model)
        pattern = r'(?i)(?:error:|note:|could not find|can\'t find model).*'
        important_lines = re.findall(pattern, stderr_text)
        extracted_codes = [line.strip() for line in important_lines]
        
        # Pattern 1 — floating node
        if "floating node" in lower_stderr or "node is floating" in lower_stderr:
            match = re.search(r'(?:floating node|node is floating)\s+([^\s,;.]+)', stderr_text, re.IGNORECASE)
            node_name = match.group(1) if match else "unknown"
            return {
                "summary": f"Node {node_name} is floating.",
                "hints": ["Connect all component pins to a wire or to ground."],
                "codes": extracted_codes + ["floating node"]
            }

        # Pattern 2 — unknown subcircuit
        if "unknown subckt" in lower_stderr or "unknown subcircuit" in lower_stderr or "could not find subcircuit" in lower_stderr:
            match = re.search(r'(?:unknown subckt:?|unknown subcircuit|could not find subcircuit)\s+(?:.*?\s+)?([^\s,;.]+)(?:\r|\n|$)', stderr_text, re.IGNORECASE)
            subckt_name = match.group(1) if match else "unknown"
            return {
                "summary": f"Unknown subcircuit reference: {subckt_name}.",
                "hints": ["Check that the component model file is included and the name matches exactly."],
                "codes": extracted_codes + ["unknown subcircuit"]
            }

        # Pattern 3 — missing ground
        if "no ground node" in lower_stderr or "node 0 is not defined" in lower_stderr or "no dc path to ground" in lower_stderr or "missing ground" in lower_stderr:
            return {
                "summary": "The circuit has no ground connection.",
                "hints": ["Every circuit must have at least one ground symbol connected."],
                "codes": extracted_codes + ["missing ground"]
            }

        # Pattern 4 — singular matrix
        if "singular matrix" in lower_stderr or "matrix is singular" in lower_stderr or "matrix singular" in lower_stderr:
            return {
                "summary": "The circuit has a mathematical inconsistency.",
                "hints": ["Check for voltage sources in a loop without resistance and for disconnected nodes."],
                "codes": extracted_codes + ["singular matrix"]
            }
            
        # Pattern 5 — timestep too small
        if "timestep too small" in lower_stderr or "time step is too small" in lower_stderr or "internal timestep" in lower_stderr:
            return {
                "summary": "The simulation could not converge.",
                "hints": ["Increase the simulation step size or reduce the simulation end time."],
                "codes": extracted_codes + ["timestep too small"]
            }
            
        # Pattern 6 — no such function
        if "no such function" in lower_stderr or "unknown function" in lower_stderr:
            match = re.search(r'(?:no such function|unknown function)\s+([^\s,;.]+)', stderr_text, re.IGNORECASE)
            func_name = match.group(1) if match else "unknown"
            return {
                "summary": f"Function {func_name} is not recognized.",
                "hints": ["Check the function name spelling and verify it is supported by ngspice."],
                "codes": extracted_codes + ["no such function"]
            }

        # Pattern 7 — device not found
        if "device not found" in lower_stderr or "unknown device type" in lower_stderr or "no model provided" in lower_stderr:
            match = re.search(r'(?:device not found|unknown device type|no model provided)\s+([^\s,;.]+)', stderr_text, re.IGNORECASE)
            dev_name = match.group(1) if match else "unknown"
            return {
                "summary": f"Device {dev_name} not found.",
                "hints": ["Check that the component model is correctly defined in the netlist or model library."],
                "codes": extracted_codes + ["device not found"]
            }

        # Pattern 9 — malformed B line
        if "mal formed b line" in lower_stderr:
            return {
                "summary": "Malformed voltage/current source",
                "hints": [
                    "The battery or source component generated an invalid netlist line",
                    "Check the properties of your voltage/current source component",
                    "Try replacing the source component and re-running"
                ],
                "codes": extracted_codes
            }

        # Pattern 10 — component model not found
        if "could not find a valid modelname" in lower_stderr or "can't find model" in lower_stderr or "ngspice stopped due to error, no simulation run" in lower_stderr:
            return {
                "summary": "Component model not found in ngspice library.",
                "hints": [
                    "The component model (e.g. BC546B, BC547) is not installed in eSim-Cloud's ngspice",
                    "Try using a component from the DEFAULT library instead of custom models",
                    "Check if the component has a .model or .lib definition in the netlist"
                ],
                "codes": extracted_codes
            }

        # Pattern 8 — no simulation command (Generic fallback)
        if "no .plot" in lower_stderr or "no simulations run" in lower_stderr:
            return {
                "summary": "No simulation command found",
                "hints": [
                    "Add a .tran, .ac, or .dc analysis line to your netlist",
                    "Add a .print or .plot output directive",
                    "Check if your circuit has a valid simulation type selected"
                ],
                "codes": extracted_codes
            }

    except Exception:
        extracted_codes = []
        pass
        
    # Safe fallback
    return {
        "summary": "Simulation failed with an unknown error",
        "hints": ["Check all nodes are connected", "Check all component models are defined", "Verify netlist syntax"],
        "codes": extracted_codes if 'extracted_codes' in locals() else []
    }
