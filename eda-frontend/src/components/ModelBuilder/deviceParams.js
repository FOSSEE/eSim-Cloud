// Device types offered in the dropdown. `value` is the literal ngspice
// .model type keyword the emitter uses.
export const DEVICE_TYPES = [
  { value: 'D', label: 'Diode' },
  { value: 'NPN', label: 'BJT (NPN)' },
  { value: 'PNP', label: 'BJT (PNP)' },
  { value: 'NMOS', label: 'MOSFET (NMOS)' },
  { value: 'PMOS', label: 'MOSFET (PMOS)' }
]

// Starter parameter sets — the most common ngspice params per device.
// Extend any list straight from the ngspice manual; the form picks it up
// automatically. NPN/PNP share one set, NMOS/PMOS share another.
const DIODE_PARAMS = [
  { key: 'IS', label: 'IS — saturation current (A)', placeholder: '1e-14' },
  { key: 'N', label: 'N — emission coefficient', placeholder: '1' },
  { key: 'RS', label: 'RS — series resistance (Ω)', placeholder: '10' },
  { key: 'CJO', label: 'CJO — junction capacitance (F)', placeholder: '2p' },
  { key: 'BV', label: 'BV — reverse breakdown (V)', placeholder: '100' },
  { key: 'TT', label: 'TT — transit time (s)', placeholder: '0' }
]

const BJT_PARAMS = [
  { key: 'IS', label: 'IS — saturation current (A)', placeholder: '1e-16' },
  { key: 'BF', label: 'BF — forward beta', placeholder: '100' },
  { key: 'BR', label: 'BR — reverse beta', placeholder: '1' },
  { key: 'VAF', label: 'VAF — forward Early voltage (V)', placeholder: '100' },
  { key: 'RB', label: 'RB — base resistance (Ω)', placeholder: '10' },
  { key: 'RC', label: 'RC — collector resistance (Ω)', placeholder: '1' }
]

const MOS_PARAMS = [
  { key: 'LEVEL', label: 'LEVEL — model level', placeholder: '1' },
  { key: 'VTO', label: 'VTO — threshold voltage (V)', placeholder: '0.7' },
  { key: 'KP', label: 'KP — transconductance (A/V²)', placeholder: '110u' },
  { key: 'GAMMA', label: 'GAMMA — bulk threshold (√V)', placeholder: '0.37' },
  { key: 'LAMBDA', label: 'LAMBDA — channel-length mod (1/V)', placeholder: '0.02' },
  { key: 'PHI', label: 'PHI — surface potential (V)', placeholder: '0.65' }
]

export const DEVICE_PARAMS = {
  D: DIODE_PARAMS,
  NPN: BJT_PARAMS,
  PNP: BJT_PARAMS,
  NMOS: MOS_PARAMS,
  PMOS: MOS_PARAMS
}