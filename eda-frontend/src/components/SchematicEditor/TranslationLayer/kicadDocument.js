/**
 * kicadDocument.js — compiles the parsed .kicad_sch S-expression AST into a
 * flat document model: symbol templates (with pins), placed instances, wire
 * segments, junctions and labels. All coordinates stay in KiCad millimetres;
 * scaling to canvas units happens at placement time.
 *
 * @typedef {Object} KiPin
 * @property {string} number
 * @property {string} name
 * @property {string} type      electrical type ('passive', 'power_in', ...)
 * @property {number} x         symbol-local mm (Y-up, KiCad symbol space)
 * @property {number} y
 * @property {number} angle
 * @property {number} length
 * @property {number} unit      0 = shared across all units
 *
 * @typedef {Object} KiTemplate
 * @property {string} libId
 * @property {boolean} isPower
 * @property {KiPin[]} pins
 *
 * @typedef {Object} KiInstance
 * @property {string} uuid
 * @property {string} libId
 * @property {number} x  sheet mm
 * @property {number} y
 * @property {number} angle    degrees CCW (KiCad convention)
 * @property {'x'|'y'|null} mirror
 * @property {number} unit
 * @property {string} reference   e.g. 'R1'
 * @property {string} value       e.g. '10k'
 */

import { parseSExpr, child, children, atoms, childValue } from './sExprParser'

function parseAt (node) {
  const at = child(node, 'at')
  if (!at) return { x: 0, y: 0, angle: 0 }
  const a = atoms(at)
  return { x: a[0] || 0, y: a[1] || 0, angle: a[2] || 0 }
}

function parseProperties (node) {
  const props = {}
  for (const p of children(node, 'property')) {
    const a = atoms(p)
    props[a[0]] = a[1]
  }
  return props
}

/** Unit index from a nested lib-symbol name like "R_0_1" → 0 */
function unitFromName (name, libName) {
  const tail = name.slice(libName.length + 1) // "0_1"
  const unit = parseInt(tail.split('_')[0], 10)
  return isNaN(unit) ? 0 : unit
}

function parsePins (symbolNode, unit) {
  const out = []
  for (const pin of children(symbolNode, 'pin')) {
    const a = atoms(pin) // [electricalType, graphicStyle]
    const at = parseAt(pin)
    out.push({
      number: String(childValue(pin, 'number') != null ? childValue(pin, 'number') : ''),
      name: String(childValue(pin, 'name') != null ? childValue(pin, 'name') : ''),
      type: String(a[0] || 'passive'),
      x: at.x,
      y: at.y,
      angle: at.angle,
      length: childValue(pin, 'length') || 0,
      unit
    })
  }
  return out
}

function parseLibSymbols (root) {
  const templates = {}
  const lib = child(root, 'lib_symbols')
  if (!lib) return templates

  for (const sym of children(lib, 'symbol')) {
    const libId = String(atoms(sym)[0])
    const libName = libId.includes(':') ? libId.split(':')[1] : libId
    const pins = parsePins(sym, 0) // pins directly on the root (uncommon)
    for (const unitSym of children(sym, 'symbol')) {
      const unitName = String(atoms(unitSym)[0])
      pins.push(...parsePins(unitSym, unitFromName(unitName, libName)))
    }
    templates[libId] = {
      libId,
      isPower: !!child(sym, 'power') || libId.startsWith('power:'),
      pins,
      extends: childValue(sym, 'extends')
    }
  }

  // Resolve (extends "Parent") aliases — pins come from the parent definition.
  for (const t of Object.values(templates)) {
    if (t.extends && t.pins.length === 0) {
      const prefix = t.libId.includes(':') ? t.libId.split(':')[0] + ':' : ''
      const parent = templates[prefix + t.extends] || templates[t.extends]
      if (parent) t.pins = parent.pins
    }
    delete t.extends
  }
  return templates
}

function parseInstances (root) {
  const out = []
  for (const sym of children(root, 'symbol')) {
    const libId = childValue(sym, 'lib_id')
    if (libId == null) continue // lib_symbols container has none
    const at = parseAt(sym)
    const mirrorNode = child(sym, 'mirror')
    const props = parseProperties(sym)
    out.push({
      uuid: String(childValue(sym, 'uuid') || 'sym-' + out.length),
      libId: String(libId),
      x: at.x,
      y: at.y,
      angle: at.angle,
      mirror: mirrorNode ? String(atoms(mirrorNode)[0]) : null,
      unit: childValue(sym, 'unit') || 1,
      reference: props.Reference || '?',
      value: props.Value || ''
    })
  }
  return out
}

function parseWires (root) {
  const out = []
  for (const wire of children(root, 'wire')) {
    const pts = child(wire, 'pts')
    if (!pts) continue
    const xy = children(pts, 'xy').map((p) => {
      const a = atoms(p)
      return { x: a[0], y: a[1] }
    })
    for (let i = 1; i < xy.length; i++) {
      out.push({ a: xy[i - 1], b: xy[i] })
    }
  }
  return out
}

function parseJunctions (root) {
  return children(root, 'junction').map((j) => {
    const at = parseAt(j)
    return { x: at.x, y: at.y }
  })
}

function parseLabels (root) {
  const out = []
  const kinds = [
    ['label', 'local'],
    ['global_label', 'global'],
    ['hierarchical_label', 'hierarchical']
  ]
  for (const [kw, kind] of kinds) {
    for (const l of children(root, kw)) {
      const at = parseAt(l)
      out.push({ text: String(atoms(l)[0]), x: at.x, y: at.y, kind })
    }
  }
  return out
}

/**
 * Parse .kicad_sch text into the flat document model.
 * Throws on non-v6 files (legacy .sch is line-based, not an S-expression).
 */
export function parseKicadSch (text) {
  const root = parseSExpr(text)
  if (root[0] !== 'kicad_sch') {
    throw new Error('Not a KiCad v6+ schematic (expected kicad_sch, got ' + root[0] + ')')
  }
  return {
    version: childValue(root, 'version'),
    generator: childValue(root, 'generator'),
    templates: parseLibSymbols(root),
    instances: parseInstances(root),
    wires: parseWires(root),
    junctions: parseJunctions(root),
    labels: parseLabels(root)
  }
}
