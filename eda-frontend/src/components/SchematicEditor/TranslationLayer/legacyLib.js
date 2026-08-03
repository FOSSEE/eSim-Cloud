/**
 * legacyLib.js — parser for legacy KiCad symbol libraries (.lib, "EESchema-
 * LIBRARY" format), used for the -cache.lib file that ships next to every
 * legacy .sch project.
 *
 * The cache lib is the legacy equivalent of v6's embedded lib_symbols: it
 * holds the exact pin positions of every symbol the schematic uses. With it
 * the importer can compute the exact original position of every pin on the
 * sheet — no proximity guessing — and can place a functional placeholder for
 * any component the backend library doesn't know.
 *
 * Coordinates are mils, Y-up, relative to the symbol anchor.
 *
 * @typedef {Object} LegacyLibPin
 * @property {string} name
 * @property {string} number  ('~' happens, e.g. plot_v1)
 * @property {number} x
 * @property {number} y
 * @property {number} length
 * @property {string} dir     U | D | L | R
 *
 * @typedef {Object} LegacyLibDef
 * @property {string} name
 * @property {string} reference  e.g. 'U', 'X', '#PWR'
 * @property {LegacyLibPin[]} pins
 * @property {{minX, minY, maxX, maxY}} bbox  drawing + pin extents (mils, Y-up)
 */

/** Parse a .lib text into a Map of symbol name → LegacyLibDef (plus aliases) */
export function parseLegacyLib (text) {
  const defs = new Map()
  const lines = text.split('\n')
  let cur = null
  let aliases = []

  const extend = (x, y) => {
    if (x < cur.bbox.minX) cur.bbox.minX = x
    if (x > cur.bbox.maxX) cur.bbox.maxX = x
    if (y < cur.bbox.minY) cur.bbox.minY = y
    if (y > cur.bbox.maxY) cur.bbox.maxY = y
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const p = line.split(/\s+/)

    if (p[0] === 'DEF') {
      cur = {
        // A leading ~ marks an invisible reference name, not part of the name
        name: p[1].replace(/^~/, ''),
        reference: (p[2] || 'U').replace(/^~/, ''),
        pins: [],
        bbox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      }
      aliases = []
      continue
    }
    if (!cur) continue

    if (p[0] === 'ALIAS') {
      aliases.push(...p.slice(1))
    } else if (p[0] === 'X') {
      // X name number posx posy length direction ...
      const pin = {
        name: p[1],
        number: p[2],
        x: parseInt(p[3], 10),
        y: parseInt(p[4], 10),
        length: parseInt(p[5], 10) || 0,
        dir: p[6] || 'R'
      }
      cur.pins.push(pin)
      extend(pin.x, pin.y)
    } else if (p[0] === 'S') {
      // S x1 y1 x2 y2 ...
      extend(parseInt(p[1], 10), parseInt(p[2], 10))
      extend(parseInt(p[3], 10), parseInt(p[4], 10))
    } else if (p[0] === 'C') {
      // C posx posy radius ...
      const r = parseInt(p[3], 10)
      extend(parseInt(p[1], 10) - r, parseInt(p[2], 10) - r)
      extend(parseInt(p[1], 10) + r, parseInt(p[2], 10) + r)
    } else if (p[0] === 'P') {
      // P count parts convert thickness x1 y1 x2 y2 ... fill
      const count = parseInt(p[1], 10)
      for (let i = 0; i < count; i++) {
        const x = parseInt(p[5 + i * 2], 10)
        const y = parseInt(p[6 + i * 2], 10)
        if (!isNaN(x) && !isNaN(y)) extend(x, y)
      }
    } else if (p[0] === 'A') {
      // A posx posy radius ... — bound by the full circle, cheap and safe
      const r = parseInt(p[3], 10)
      extend(parseInt(p[1], 10) - r, parseInt(p[2], 10) - r)
      extend(parseInt(p[1], 10) + r, parseInt(p[2], 10) + r)
    } else if (p[0] === 'ENDDEF') {
      if (cur.bbox.minX === Infinity) {
        cur.bbox = { minX: -50, minY: -50, maxX: 50, maxY: 50 }
      }
      defs.set(cur.name, cur)
      for (const a of aliases) defs.set(a.replace(/^~/, ''), cur)
      cur = null
    }
  }
  return defs
}

/**
 * Exact sheet position (canvas units) of a lib pin for a placed instance.
 *
 * Legacy orientation matrix [m0, m1, m2, m3] straight from the file's
 * position line; symbol space is Y-up, the matrix folds the flip in
 * (identity placement is written as "1 0 0 -1"):
 *   sheetX = instX + (m0·x + m1·y) / 5
 *   sheetY = instY + (m2·x + m3·y) / 5
 * (component instX/instY are already divided by 5 by the .sch parser)
 */
export function legacyPinPosition (component, pin) {
  const m = component.matrix || [1, 0, 0, -1]
  return {
    x: component.x + (m[0] * pin.x + m[1] * pin.y) / 5,
    y: component.y + (m[2] * pin.x + m[3] * pin.y) / 5
  }
}

/**
 * Build a canvas placeholder component descriptor for an instance whose
 * symbol is missing from the backend library. The lib def's transformed
 * geometry is baked into the pin offsets (rotation stays 0 on canvas), so
 * connectivity and relative pin layout are exact.
 *
 * @returns {{x, y, width, height, pins, svgPath, name}} ready for addComponent
 */
export function buildPlaceholder (component, def) {
  const m = component.matrix || [1, 0, 0, -1]
  const t = (x, y) => ({
    x: (m[0] * x + m[1] * y) / 5,
    y: (m[2] * x + m[3] * y) / 5
  })

  // Transform the four bbox corners and every pin; take the canvas hull.
  const b = def.bbox
  const corners = [
    t(b.minX, b.minY), t(b.maxX, b.minY), t(b.minX, b.maxY), t(b.maxX, b.maxY)
  ]
  const pinPts = def.pins.map((p) => t(p.x, p.y))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of [...corners, ...pinPts]) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const width = Math.max(20, maxX - minX)
  const height = Math.max(20, maxY - minY)

  return {
    name: def.name.toUpperCase(),
    x: component.x + minX,
    y: component.y + minY,
    width,
    height,
    pins: def.pins.map((p, idx) => {
      const pt = pinPts[idx]
      return {
        number: p.number,
        name: p.name,
        type: 'passive',
        dx: pt.x - minX,
        dy: pt.y - minY
      }
    }),
    svgPath: placeholderSvg(def.name, width, height)
  }
}

/** Self-contained data-URI SVG: dashed box + symbol name */
function placeholderSvg (label, w, h) {
  const fontSize = Math.max(8, Math.min(12, w / (label.length * 0.7)))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="#fffde7" stroke="#6d4c41" stroke-width="1.5" stroke-dasharray="5 3"/>` +
    `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="#6d4c41">${label}</text>` +
    '</svg>'
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
