// Generates an on-the-fly SVG symbol (a labelled box with pins) for a saved
// custom component, matching the exact <metadata> format the schematic
// editor's SvgParser expects, and returns a blob URL usable directly as
// `component.svg_path`. No backend / static files involved.

// Parse pin/port names from the saved SPICE text.
//  - subckt:  .subckt NAME p1 p2 p3 ...   -> [p1, p2, p3]
//  - model:   .model NAME TYPE (...)      -> pins inferred from device type
export function parsePins (spiceText, modelType) {
  const text = (spiceText || '').trim()

  if (modelType === 'subckt') {
    const m = text.match(/\.subckt\s+\S+\s+([^\n]*)/i)
    if (m && m[1].trim()) return m[1].trim().split(/\s+/)
    return ['1', '2']
  }

  // model: infer pins from the device type token after the name
  const m = text.match(/\.model\s+\S+\s+(\w+)/i)
  const type = m ? m[1].toUpperCase() : 'D'
  if (type.startsWith('D')) return ['A', 'K'] // diode: anode / cathode
  if (type === 'NPN' || type === 'PNP' || type.startsWith('Q')) return ['C', 'B', 'E']
  if (type.includes('MOS') || type.startsWith('M')) return ['D', 'G', 'S']
  return ['1', '2']
}

// SPICE prefix that drives netlist generation later.
export function symbolPrefixFor (spiceText, modelType) {
  if (modelType === 'subckt') return 'x' // subcircuits are X instances
  const m = (spiceText || '').match(/\.model\s+\S+\s+(\w+)/i)
  const type = m ? m[1].toUpperCase() : 'D'
  if (type.startsWith('D')) return 'd'
  if (type === 'NPN' || type === 'PNP' || type.startsWith('Q')) return 'q'
  if (type.includes('MOS') || type.startsWith('M')) return 'm'
  return 'x'
}

function escapeXml (s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pinEl (num, x, y, type, pinName, orientation, length) {
  // NOTE: metadata Y uses a Y-up convention (the parser does height/2 - y/scale),
  // so callers pass the negated SVG y.
  return `<p-${num}><x>${Math.round(x)}</x><y>${Math.round(y)}</y>` +
    `<type>${type}</type><name>${escapeXml(pinName)}</name>` +
    `<orientation>${orientation}</orientation><length>${length}</length>` +
    '<pinShape></pinShape></p-' + num + '>'
}

// Build the SVG string (box + pin stubs + metadata).
export function generateSymbolSvg ({ name, pins, symbolPrefix }) {
  const n = pins.length
  const perSide = Math.ceil(n / 2)
  const otherSide = n - perSide
  const W = 300
  const bodyW = 200
  const bodyHalf = bodyW / 2
  const halfW = W / 2
  const rowGap = 150
  const H = Math.max(300, perSide * rowGap + rowGap)
  const halfH = H / 2

  const lines = []   // visible drawing
  const meta = []    // <p-N> metadata

  pins.forEach((pinName, i) => {
    const leftSide = i < perSide
    const idxOnSide = leftSide ? i : i - perSide
    const countOnSide = leftSide ? perSide : otherSide
    // distribute pins vertically inside the body
    const y = -halfH + (H * (idxOnSide + 1)) / (countOnSide + 1)
    if (leftSide) {
      const xTip = -halfW
      lines.push(`<path d="M${-bodyHalf},${y.toFixed(1)} L${xTip},${y.toFixed(1)}" stroke="black" stroke-width="5" />`)
      lines.push(`<text x="${-bodyHalf + 12}" y="${(y + 9).toFixed(1)}" font-size="26" text-anchor="start">${escapeXml(pinName)}</text>`)
      meta.push(pinEl(i + 1, xTip, -y, 'I', pinName, 'L', halfW - bodyHalf))
    } else {
      const xTip = halfW
      lines.push(`<path d="M${bodyHalf},${y.toFixed(1)} L${xTip},${y.toFixed(1)}" stroke="black" stroke-width="5" />`)
      lines.push(`<text x="${bodyHalf - 12}" y="${(y + 9).toFixed(1)}" font-size="26" text-anchor="end">${escapeXml(pinName)}</text>`)
      meta.push(pinEl(i + 1, xTip, -y, 'O', pinName, 'R', halfW - bodyHalf))
    }
  })

  const body =
    `<rect x="${-bodyHalf}" y="${(-halfH + 20).toFixed(1)}" width="${bodyW}" height="${(H - 40).toFixed(1)}" fill-opacity="0" stroke="black" stroke-width="6" />` +
    `<text x="0" y="6" font-size="30" text-anchor="middle">${escapeXml(name)}</text>`

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${-halfW} ${-halfH} ${W} ${H}">\n` +
    '<defs></defs>\n' +
    body + '\n' +
    lines.join('\n') + '\n' +
    `<metadata width="${W}" height="${H}" symbolPrefix="${symbolPrefix}" cmpPartDmgLabel="1:A" nameOfSymbol="${escapeXml(name)}">` +
    meta.join('') +
    '</metadata>\n</svg>'
}

// Convenience: generate symbol + return a blob URL for component.svg_path.
export function makeSymbolUrl ({ name, pins, symbolPrefix }) {
  const svg = generateSymbolSvg({ name, pins, symbolPrefix })
  // URL-encoded (not base64): avoids ';' and '=' which break mxGraph's style string
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}