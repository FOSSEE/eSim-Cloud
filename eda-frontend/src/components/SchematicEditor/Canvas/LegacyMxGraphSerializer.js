/**
 * LegacyMxGraphSerializer.js — backward-compatibility adapter between the
 * declarative canvas document and the legacy mxGraph XML schema stored in the
 * backend (`data_dump`) and consumed by the read-only Viewer.
 *
 * Legacy schema essentials (see old ToolbarTools.parseXmlToGraph):
 *  - <mxGraphModel><root> with base cells id="0" and id="1"
 *  - components: vertex="1" Component="1", geometry as first child,
 *    an Object as="properties" child carrying NAME/VALUE/... attributes
 *  - pins: vertex="1" Pin="1" parent="<compId>", tiny 0.5x0.5 geometry
 *  - wires: edge="1" with sourceVertex/targetVertex pin ids, tarx/tary
 *    endpoint coordinates, and waypoints as the second child's mxPoint list
 *  - every cell carries Component and Pin attributes (the legacy parser
 *    dereferences them unconditionally)
 */

import {
  pinAbsolutePosition,
  coordKey,
  rotate90,
  simplifyPolyline
} from './geometry'
import { bumpIdCounter } from './schematicStore'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function esc (v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESCAPES[c])
}

function attrs (obj) {
  return Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null)
    .map((k) => `${k}="${esc(obj[k])}"`)
    .join(' ')
}

function componentStyle (comp) {
  // data: URIs contain ';' — they cannot survive the ;-delimited style
  // string, so placeholders get no style image (the svgPath attribute on
  // the cell carries the real value; see fromLegacyXml).
  const image = String(comp.svgPath || '').startsWith('data:') ? '' : '../' + comp.svgPath
  let style = 'shape=image;fontColor=blue;image=' + image +
    ';imageVerticalAlign=bottom;verticalAlign=bottom;imageAlign=bottom;align=bottom;spacingLeft=25;'
  if (comp.rotation) style += 'rotation=' + comp.rotation + ';'
  return style
}

/**
 * Serialize the canvas document to legacy mxGraph XML.
 * @param {{components: Array, wires: Array, probes: Array}} doc
 * @returns {string}
 */
export function toLegacyXml (doc) {
  const parts = []
  parts.push('<mxGraphModel><root>')
  parts.push('<mxCell id="0" CellType="This is where you say what the vertex is" pinType=" " Component="0" Pin="0" PinNumber="0" PinName=""><Object as="properties"/></mxCell>')
  parts.push('<mxCell id="1" parent="0" CellType="This is where you say what the vertex is" pinType=" " Component="0" Pin="0" PinNumber="0" PinName=""><Object as="properties"/></mxCell>')

  // Map coordKey -> pin id so wires can rebind their legacy terminals
  const pinIdAt = new Map()
  let pinIdCursor = maxNumericId(doc) + 1

  for (const comp of doc.components) {
    parts.push('<mxCell ' + attrs({
      id: comp.id,
      value: comp.name,
      style: componentStyle(comp),
      vertex: '1',
      parent: '1',
      connectable: '0',
      Component: '1',
      Pin: '0',
      CellType: 'Component',
      symbol: comp.symbol,
      // Verbatim svgPath — style-embedded images mangle data: URIs
      svgPath: comp.svgPath,
      pinType: ' ',
      PinNumber: '0',
      PinName: ''
    }) + '>')
    parts.push(`<mxGeometry ${attrs({ x: comp.x, y: comp.y, width: comp.width, height: comp.height })} as="geometry"/>`)
    if (comp.compObject) {
      parts.push('<Object ' + attrs({
        id: comp.compObject.id,
        name: comp.compObject.name,
        svg_path: comp.compObject.svg_path,
        thumbnail_path: comp.compObject.thumbnail_path,
        symbol_prefix: comp.compObject.symbol_prefix,
        component_library: comp.compObject.component_library,
        description: comp.compObject.description,
        data_link: comp.compObject.data_link,
        full_name: comp.compObject.full_name,
        keyword: comp.compObject.keyword
      }) + ' as="CompObject"><Array as="alternate_component"/></Object>')
    }
    parts.push('<Object ' + attrs(comp.properties || {}) + ' as="properties"/>')
    parts.push('</mxCell>')

    for (const pin of comp.pins) {
      const pid = pin.id || String(pinIdCursor++)
      const abs = pinAbsolutePosition(comp, pin)
      pinIdAt.set(coordKey(abs.x, abs.y), pid)
      parts.push('<mxCell ' + attrs({
        id: pid,
        value: pin.number,
        style: 'align=right;verticalAlign=bottom;rotation=0',
        vertex: '1',
        parent: comp.id,
        Pin: '1',
        Component: '0',
        pinType: pin.type || 'Output',
        PinNumber: pin.number,
        PinName: pin.name || '',
        CellType: 'This is where you say what the vertex is'
      }) + '>')
      parts.push(`<mxGeometry ${attrs({ x: pin.dx, y: pin.dy, width: 0.5, height: 0.5 })} as="geometry"/>`)
      parts.push('</mxCell>')
    }
  }

  for (const wire of doc.wires) {
    if (wire.points.length < 2) continue
    const first = wire.points[0]
    const last = wire.points[wire.points.length - 1]
    const sourcePin = pinIdAt.get(coordKey(first.x, first.y))
    const targetPin = pinIdAt.get(coordKey(last.x, last.y))
    parts.push('<mxCell ' + attrs({
      id: wire.id,
      style: '',
      edge: '1',
      parent: '1',
      source: sourcePin,
      target: targetPin,
      sourceVertex: sourcePin || '0',
      targetVertex: targetPin || '0',
      srcx: first.x,
      srcy: first.y,
      tarx: last.x,
      tary: last.y,
      Component: '0',
      Pin: '0',
      CellType: 'Wire'
    }) + '>')
    parts.push('<mxGeometry relative="1" as="geometry">' +
      `<mxPoint ${attrs({ x: first.x, y: first.y })} as="sourcePoint"/>` +
      `<mxPoint ${attrs({ x: last.x, y: last.y })} as="targetPoint"/>` +
      '</mxGeometry>')
    // Interior waypoints — second child so the legacy parser's
    // `cells[i].children[1].children` picks them up as mxPoints.
    const waypoints = wire.points.slice(1, -1)
    parts.push('<Array as="PointsArray">' +
      waypoints.map((p) => `<mxPoint ${attrs({ x: p.x, y: p.y })}/>`).join('') +
      '</Array>')
    parts.push('</mxCell>')
  }

  for (const probe of doc.probes || []) {
    parts.push('<mxCell ' + attrs({
      id: probe.id,
      value: probe.label,
      vertex: '1',
      parent: '1',
      Component: '0',
      Pin: '0',
      CellType: 'Probe',
      probeType: probe.probeType,
      probeColor: probe.color
    }) + '>')
    parts.push(`<mxGeometry ${attrs({ x: probe.x, y: probe.y, width: 60, height: 50 })} as="geometry"/>`)
    parts.push('</mxCell>')
  }

  parts.push('</root></mxGraphModel>')
  return parts.join('')
}

function maxNumericId (doc) {
  let max = 1
  const track = (id) => {
    const n = parseInt(id, 10)
    if (!isNaN(n) && n > max) max = n
  }
  doc.components.forEach((c) => {
    track(c.id)
    c.pins.forEach((p) => p.id && track(p.id))
  })
  doc.wires.forEach((w) => track(w.id))
  ;(doc.probes || []).forEach((p) => track(p.id))
  return max
}

function styleValue (style, key) {
  const m = (style || '').match(new RegExp('(?:^|;)' + key + '=([^;]*)'))
  return m ? m[1] : null
}

function childByAs (cell, tag, asName) {
  for (let i = 0; i < cell.children.length; i++) {
    const ch = cell.children[i]
    if (ch.tagName === tag && ch.getAttribute('as') === asName) return ch
  }
  return null
}

function objectAttrs (node) {
  const out = {}
  if (!node) return out
  for (let i = 0; i < node.attributes.length; i++) {
    const a = node.attributes[i]
    if (a.name !== 'as') out[a.name] = a.value
  }
  return out
}

function geomOf (cell) {
  const g = childByAs(cell, 'mxGeometry', 'geometry') || cell.getElementsByTagName('mxGeometry')[0]
  if (!g) return { x: 0, y: 0, width: 0, height: 0, node: null }
  return {
    x: parseFloat(g.getAttribute('x')) || 0,
    y: parseFloat(g.getAttribute('y')) || 0,
    width: parseFloat(g.getAttribute('width')) || 0,
    height: parseFloat(g.getAttribute('height')) || 0,
    node: g
  }
}

/** Insert L-corners so imported polylines stay orthogonal */
function orthogonalize (points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x !== p.x && last.y !== p.y) {
      out.push({ x: p.x, y: last.y })
    }
    if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y })
  }
  return out
}

/**
 * Parse legacy mxGraph XML into a canvas document.
 * Handles both mxCodec-encoded saves from the old editor and files written
 * by toLegacyXml above.
 *
 * Old-editor saves (recognised by pin cells carrying no `parent` attribute)
 * get no wires at all: their stored wire geometry is unreliable — the old
 * mxGraph router shaped edges at render time and junction coordinates go
 * stale — so only the pin-level connectivity is extracted, returned as
 * `legacyNetGroups` (arrays of absolute pin positions, one per net). The
 * caller redraws those nets with the editor's own router (see
 * TranslationLayer/autoWire wirePointGroups), the same way the KiCad
 * importer does.
 *
 * @param {string} xml
 * @returns {{components: Array, wires: Array, probes: Array, legacyNetGroups?: Array}}
 */
export function fromLegacyXml (xml) {
  const dom = new DOMParser().parseFromString(xml, 'text/xml')
  const rootEl = dom.documentElement.getElementsByTagName('root')[0] || dom.documentElement.children[0]
  const doc = { components: [], wires: [], probes: [] }
  if (!rootEl) return doc

  const compById = new Map()
  const pinIndex = new Map() // pinId -> { comp, pin }
  const edges = []
  let lastComponent = null
  let oldDialect = false

  const cells = rootEl.children
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.tagName !== 'mxCell') continue
    const id = cell.getAttribute('id')
    if (id === '0' || id === '1') continue
    bumpIdCounter(id)

    const cellType = cell.getAttribute('CellType')
    const isEdge = cell.getAttribute('edge') === '1'
    const isComponent = cell.getAttribute('Component') === '1' || cellType === 'Component'
    const isPin = cell.getAttribute('Pin') === '1'

    if (isEdge) {
      edges.push(cell)
      continue
    }

    if (cellType === 'Probe') {
      const g = geomOf(cell)
      doc.probes.push({
        id,
        label: cell.getAttribute('value') || 'PR' + (doc.probes.length + 1),
        probeType: cell.getAttribute('probeType') || 'V',
        color: cell.getAttribute('probeColor') || '#00e676',
        x: g.x,
        y: g.y
      })
      continue
    }

    if (isComponent) {
      const g = geomOf(cell)
      const style = cell.getAttribute('style') || ''
      const image = styleValue(style, 'image') || ''
      const compObject = objectAttrs(childByAs(cell, 'Object', 'CompObject'))
      const properties = objectAttrs(childByAs(cell, 'Object', 'properties'))
      const comp = {
        id,
        name: cell.getAttribute('value') || properties.NAME || '',
        symbol: cell.getAttribute('symbol') || compObject.symbol_prefix || '',
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        rotation: parseInt(styleValue(style, 'rotation'), 10) || 0,
        svgPath: cell.getAttribute('svgPath') || compObject.svg_path || image.replace(/^(\.\.\/)+/, ''),
        compObject: Object.keys(compObject).length ? compObject : null,
        properties,
        pins: []
      }
      doc.components.push(comp)
      compById.set(id, comp)
      lastComponent = comp
      continue
    }

    if (isPin) {
      const parentId = cell.getAttribute('parent')
      const comp = compById.get(parentId) || lastComponent
      if (!comp) continue
      const g = geomOf(cell)
      const pin = {
        id,
        number: cell.getAttribute('value') || cell.getAttribute('PinNumber') || String(comp.pins.length + 1),
        name: cell.getAttribute('PinName') || '',
        type: cell.getAttribute('pinType') || 'Output',
        dx: g.x,
        dy: g.y
      }
      // Old-editor saves (pins carry no `parent` attribute) store pin
      // offsets with the component rotation already baked in — the style
      // rotation there only turned the image. Two baked variants exist for
      // 90/270 on non-square symbols:
      //  - true rotation about the centre: offsets land OUTSIDE the
      //    unrotated w×h box (on the rotated artwork's lead tips) — use
      //    them as-is;
      //  - pins re-seated on the UNROTATED bbox border (dx in {0..w}) while
      //    the rotated artwork spans h×w, leaving pins (h-w)/2 short of the
      //    lead tips — rescale the offsets onto the rotated frame first.
      // Either way, un-rotate back into the local frame afterwards so
      // pinAbsolutePosition doesn't rotate twice.
      if (!parentId) {
        oldDialect = true
        if (comp.rotation) {
          let relX = pin.dx - comp.width / 2
          let relY = pin.dy - comp.height / 2
          const insideBox = Math.abs(relX) <= comp.width / 2 + 0.5 &&
            Math.abs(relY) <= comp.height / 2 + 0.5
          if (comp.rotation % 180 !== 0 && comp.width && comp.height && insideBox) {
            relX *= comp.height / comp.width
            relY *= comp.width / comp.height
          }
          const local = rotate90(relX, relY, -comp.rotation)
          pin.dx = comp.width / 2 + local.x
          pin.dy = comp.height / 2 + local.y
        }
      }
      comp.pins.push(pin)
      pinIndex.set(id, { comp, pin })
    }
  }

  if (oldDialect) {
    doc.legacyNetGroups = extractLegacyNetGroups(edges, pinIndex)
    return doc
  }

  for (const cell of edges) {
    const id = cell.getAttribute('id')
    const geomNode = geomOf(cell).node

    const pointAt = (asName) => {
      if (!geomNode) return null
      for (let i = 0; i < geomNode.children.length; i++) {
        const ch = geomNode.children[i]
        if (ch.tagName === 'mxPoint' && ch.getAttribute('as') === asName) {
          return { x: parseFloat(ch.getAttribute('x')) || 0, y: parseFloat(ch.getAttribute('y')) || 0 }
        }
      }
      return null
    }

    const pinPoint = (ref) => {
      const entry = ref && pinIndex.get(ref)
      if (!entry) return null
      return pinAbsolutePosition(entry.comp, entry.pin)
    }

    const numAttr = (name) => {
      const v = cell.getAttribute(name)
      return v === null || v === '' ? null : parseFloat(v)
    }

    const start =
      pinPoint(cell.getAttribute('source')) ||
      pinPoint(cell.getAttribute('sourceVertex')) ||
      pointAt('sourcePoint') ||
      (numAttr('srcx') !== null ? { x: numAttr('srcx'), y: numAttr('srcy') || 0 } : null)

    const end =
      pinPoint(cell.getAttribute('target')) ||
      pinPoint(cell.getAttribute('targetVertex')) ||
      pointAt('targetPoint') ||
      (numAttr('tarx') !== null ? { x: numAttr('tarx'), y: numAttr('tary') || 0 } : null)

    // Waypoints: geometry <Array as="points"> (mxCodec) or <Array as="PointsArray">
    const waypoints = []
    const collect = (arrayNode) => {
      if (!arrayNode) return
      for (let i = 0; i < arrayNode.children.length; i++) {
        const p = arrayNode.children[i]
        if (p.tagName === 'mxPoint') {
          waypoints.push({ x: parseFloat(p.getAttribute('x')) || 0, y: parseFloat(p.getAttribute('y')) || 0 })
        }
      }
    }
    collect(geomNode && childByAs({ children: geomNode.children }, 'Array', 'points'))
    if (waypoints.length === 0) collect(childByAs(cell, 'Array', 'PointsArray'))

    if (!start || !end) continue
    const points = orthogonalize([start, ...waypoints, end])
    if (points.length >= 2) doc.wires.push({ id, points: simplifyPolyline(points) })
  }

  return doc
}

/**
 * Group the old editor's pins into nets using only edge connectivity — no
 * stored wire geometry. Union-find over pin ids and edge ids: an edge unions
 * with whatever each terminal references (a pin, or another edge for the old
 * editor's wire-on-wire junctions); terminals that reference nothing fall
 * back to the nearest pin within tolerance of their stored coordinate.
 *
 * @returns {Array<Array<{x, y}>>} absolute pin positions per net (nets with
 *   at least two pins only), ready for autoWire's wirePointGroups
 */
function extractLegacyNetGroups (edgeCells, pinIndex, tolerance = 15) {
  const parent = new Map()
  const find = (k) => {
    if (!parent.has(k)) {
      parent.set(k, k)
      return k
    }
    let root = k
    while (parent.get(root) !== root) root = parent.get(root)
    while (parent.get(k) !== root) {
      const next = parent.get(k)
      parent.set(k, root)
      k = next
    }
    return root
  }
  const union = (a, b) => parent.set(find(a), find(b))

  const pinPos = new Map()
  for (const [pid, entry] of pinIndex) {
    pinPos.set(pid, pinAbsolutePosition(entry.comp, entry.pin))
  }

  const edgeIds = new Set(edgeCells.map((c) => c.getAttribute('id')))
  const loose = [] // terminals with no usable reference, matched by coordinate

  for (const cell of edgeCells) {
    const ekey = 'edge:' + cell.getAttribute('id')
    const geomNode = geomOf(cell).node

    const sides = [
      { refs: ['source', 'sourceVertex'], pointAs: 'sourcePoint', xAttr: 'srcx', yAttr: 'srcy' },
      { refs: ['target', 'targetVertex'], pointAs: 'targetPoint', xAttr: 'tarx', yAttr: 'tary' }
    ]
    for (const side of sides) {
      const ref = cell.getAttribute(side.refs[0]) || cell.getAttribute(side.refs[1])
      if (ref && pinIndex.has(ref)) {
        union(ekey, 'pin:' + ref)
        continue
      }
      if (ref && edgeIds.has(ref)) {
        union(ekey, 'edge:' + ref)
        continue
      }
      let pt = null
      if (geomNode) {
        for (let i = 0; i < geomNode.children.length; i++) {
          const ch = geomNode.children[i]
          if (ch.tagName === 'mxPoint' && ch.getAttribute('as') === side.pointAs) {
            pt = { x: parseFloat(ch.getAttribute('x')) || 0, y: parseFloat(ch.getAttribute('y')) || 0 }
          }
        }
      }
      if (!pt) {
        const x = cell.getAttribute(side.xAttr)
        if (x !== null && x !== '') pt = { x: parseFloat(x) || 0, y: parseFloat(cell.getAttribute(side.yAttr)) || 0 }
      }
      if (pt) loose.push({ ekey, pt })
    }
  }

  for (const t of loose) {
    let best = null
    let bestD = tolerance
    for (const [pid, p] of pinPos) {
      const d = Math.hypot(p.x - t.pt.x, p.y - t.pt.y)
      if (d < bestD) {
        bestD = d
        best = pid
      }
    }
    if (best) union(t.ekey, 'pin:' + best)
  }

  const groups = new Map()
  for (const [pid, p] of pinPos) {
    const root = find('pin:' + pid)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push({ x: p.x, y: p.y })
  }
  return [...groups.values()].filter((g) => g.length >= 2)
}
