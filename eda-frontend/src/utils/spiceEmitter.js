// Pure helpers that turn Model / Subcircuit Builder form state into
// ngspice-compatible SPICE text. No validation or I/O here — the backend
// sanitizer pipeline is the source of truth for what's actually valid.

// {IS: '1e-14', N: '1.5'} -> "IS=1e-14 N=1.5", dropping blanks
function formatParams (params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => `${key.trim().toUpperCase()}=${String(value).trim()}`)
    .join(' ')
}

// { name: 'MyDiode', deviceType: 'D', params: { IS: '1e-14', N: '1.5' } }
//   -> ".model MyDiode D (IS=1e-14 N=1.5)"
export function generateModelCard ({ name, deviceType, params } = {}) {
  const safeName = (name || 'UNNAMED').trim()
  const type = (deviceType || '').trim().toUpperCase()
  const body = formatParams(params)
  if (!body) return `.model ${safeName} ${type}`.trim()
  return `.model ${safeName} ${type} (${body})`
}

// { name: 'RCFilter', ports: ['in','out','gnd'], body: 'R1 in out 1k\nC1 out gnd 10u' }
//   -> ".subckt RCFilter in out gnd\nR1 in out 1k\nC1 out gnd 10u\n.ends RCFilter"
export function generateSubcircuit ({ name, ports, body } = {}) {
  const safeName = (name || 'UNNAMED').trim()
  const portList = (ports || [])
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0)
    .join(' ')
  const netlist = (body || '').trim()
  const header = `.subckt ${safeName} ${portList}`.trim()
  return [header, netlist, `.ends ${safeName}`]
    .filter((line) => line.length > 0)
    .join('\n')
}