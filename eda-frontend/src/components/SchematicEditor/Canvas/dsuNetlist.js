/**
 * dsuNetlist.js — Disjoint Set Union network compiler.
 *
 * Replaces the legacy DFS/BFS mxGraph cell traversal with a coordinate-based
 * DSU (path compression + union by rank):
 *
 *   1. every component pin coordinate seeds a set
 *   2. all vertices of one wire are unioned together
 *   3. pins coincident with wire points/segments are unioned
 *   4. wire-to-wire T junctions (vertex on another segment) are unioned
 *   5. sets containing a PWR/GND pin become SPICE node '0';
 *      the rest get incremental names N1, N2, ...
 */

import { coordKey, wireSegments, pinAbsolutePosition, projectOntoSegment } from './geometry'

/** Disjoint Set Union with path compression and union by rank */
export class DSU {
  constructor () {
    this.parent = new Map()
    this.rank = new Map()
  }

  add (key) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key)
      this.rank.set(key, 0)
    }
    return key
  }

  find (key) {
    let root = key
    while (this.parent.get(root) !== root) root = this.parent.get(root)
    // Path compression
    let cur = key
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union (a, b) {
    this.add(a)
    this.add(b)
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return ra
    const rka = this.rank.get(ra)
    const rkb = this.rank.get(rb)
    if (rka < rkb) {
      this.parent.set(ra, rb)
      return rb
    }
    if (rka > rkb) {
      this.parent.set(rb, ra)
      return ra
    }
    this.parent.set(rb, ra)
    this.rank.set(ra, rka + 1)
    return ra
  }
}

function onSegment (p, a, b, eps = 0.5) {
  return projectOntoSegment(p, a, b).d <= eps
}

/**
 * Build the electrical network of a schematic document.
 *
 * @param {{components: Array, wires: Array}} doc
 * @returns {{
 *   dsu: DSU,
 *   nodeOf: (x: number, y: number) => string|null,  // SPICE node name at coord
 *   pinNode: Map<string, string>,      // `${componentId}:${pinNumber}` -> node
 *   wireNode: Map<string, string>,     // wireId -> node
 *   nodeList: Set<string>
 * }}
 */
export function buildNetwork (doc) {
  const dsu = new DSU()
  const pinKeys = [] // { key, componentId, pinNumber, isPower }
  const wireKeysByWire = new Map()

  // 1. pins
  for (const comp of doc.components) {
    const isPower = comp.symbol === 'PWR' || comp.symbol === 'GND'
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      const key = dsu.add(coordKey(p.x, p.y))
      pinKeys.push({ key, p, componentId: comp.id, pinNumber: pin.number, isPower })
    }
  }

  // 2. wires: union every vertex of a wire into one set
  const allSegments = [] // { a, b, wireId }
  for (const wire of doc.wires) {
    const keys = wire.points.map((p) => dsu.add(coordKey(p.x, p.y)))
    for (let i = 1; i < keys.length; i++) dsu.union(keys[0], keys[i])
    wireKeysByWire.set(wire.id, keys[0])
    for (const [a, b] of wireSegments(wire)) allSegments.push({ a, b, wireId: wire.id })
  }

  // 3. pins touching wire segments (endpoint coincidence is already handled
  //    by shared coordinate keys; this catches pins on segment interiors)
  for (const pk of pinKeys) {
    for (const seg of allSegments) {
      if (onSegment(pk.p, seg.a, seg.b)) {
        dsu.union(pk.key, wireKeysByWire.get(seg.wireId))
      }
    }
  }

  // 4. wire-to-wire T junctions: any wire vertex on another wire's segment
  for (const wire of doc.wires) {
    for (const p of wire.points) {
      const key = coordKey(p.x, p.y)
      for (const seg of allSegments) {
        if (seg.wireId === wire.id) continue
        if (onSegment(p, seg.a, seg.b)) {
          dsu.union(key, wireKeysByWire.get(seg.wireId))
        }
      }
    }
  }

  // 5. name the sets: ground roots first, then N1, N2, ...
  const groundRoots = new Set()
  for (const pk of pinKeys) {
    if (pk.isPower) groundRoots.add(dsu.find(pk.key))
  }

  const rootNames = new Map()
  let counter = 0
  const nameOfRoot = (root) => {
    if (groundRoots.has(root)) return '0'
    let name = rootNames.get(root)
    if (!name) {
      name = 'N' + (++counter)
      rootNames.set(root, name)
    }
    return name
  }

  const pinNode = new Map()
  const nodeList = new Set()
  for (const pk of pinKeys) {
    if (pk.isPower) continue
    const name = nameOfRoot(dsu.find(pk.key))
    pinNode.set(pk.componentId + ':' + pk.pinNumber, name)
    nodeList.add(name)
  }

  const wireNode = new Map()
  for (const wire of doc.wires) {
    const root = dsu.find(wireKeysByWire.get(wire.id))
    // Only label wires that reach at least one pin (named nets)
    if (groundRoots.has(root)) wireNode.set(wire.id, '0')
    else if (rootNames.has(root)) wireNode.set(wire.id, rootNames.get(root))
  }

  const nodeOf = (x, y) => {
    const key = coordKey(x, y)
    if (!dsu.parent.has(key)) return null
    const root = dsu.find(key)
    if (groundRoots.has(root)) return '0'
    return rootNames.get(root) || null
  }

  return { dsu, nodeOf, pinNode, wireNode, nodeList }
}

/**
 * ERC over the document. Return shape matches the legacy checkNetlistErc.
 */
export function checkErc (doc) {
  const network = buildNetwork(doc)
  let vertexCount = 0
  let pinNC = 0
  let ground = 0

  const index = wireTouchIndex(doc)

  for (const comp of doc.components) {
    vertexCount++
    if (comp.symbol === 'PWR' || comp.symbol === 'GND') {
      ground++
    }
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      if (!index(p)) pinNC++
    }
  }

  const errorCount = pinNC
  let errorMsg = null
  if (vertexCount === 0) errorMsg = 'No Component added'
  else if (pinNC !== 0) errorMsg = 'Pins not connected'
  else if (ground === 0) errorMsg = 'Ground not connected'

  return {
    isValid: vertexCount > 0 && pinNC === 0 && ground > 0 && errorCount === 0,
    errorCount,
    vertexCount,
    pinNC,
    ground,
    errorMsg,
    network
  }
}

/** Returns a predicate telling whether a point touches any wire */
function wireTouchIndex (doc) {
  const endpointKeys = new Set()
  const segments = []
  for (const wire of doc.wires) {
    for (const p of wire.points) endpointKeys.add(coordKey(p.x, p.y))
    for (const [a, b] of wireSegments(wire)) segments.push([a, b])
  }
  return (p) => {
    if (endpointKeys.has(coordKey(p.x, p.y))) return true
    for (const [a, b] of segments) {
      if (onSegment(p, a, b)) return true
    }
    return false
  }
}

/** Assign R1/V1/C1/... prefixes. Mutates a copy; returns annotated components. */
export function assignPrefixes (components) {
  const counters = {}
  return components.map((comp) => {
    if (comp.symbol === 'PWR' || comp.symbol === 'GND' || comp.symbol === 'FLG') return comp
    const sym = comp.symbol || 'U'
    counters[sym] = (counters[sym] || 0) + 1
    const prefix = sym + counters[sym]
    return { ...comp, properties: { ...comp.properties, PREFIX: prefix } }
  })
}

/**
 * Compile the document into SPICE netlist text.
 * Output shape matches the legacy buildNetlistFromGraph.
 *
 * @returns {{models: string, main: string, componentlist: string[], nodelist: Set<string>,
 *            wireNode: Map<string, string>, annotated: Array}}
 */
export function compileNetlist (doc) {
  const network = buildNetwork(doc)
  const annotated = assignPrefixes(doc.components)

  let main = ''
  let models = ''
  const componentlist = []

  for (const comp of annotated) {
    // PWR/GND anchor nets, FLG is KiCad's PWR_FLAG (an ERC marker) — none
    // are devices. An emitted "FLG1 <node>" line reads as a malformed
    // current-controlled source and segfaults ngspice.
    if (comp.symbol === 'PWR' || comp.symbol === 'GND' || comp.symbol === 'FLG') continue
    const props = comp.properties || {}
    const prefix = props.PREFIX || comp.symbol

    let line = prefix
    for (const pin of comp.pins) {
      const node = network.pinNode.get(comp.id + ':' + pin.number)
      line += ' ' + (node !== undefined ? node : 'NC')
    }

    if (props.MODEL && props.MODEL.length > 0) {
      line += ' ' + props.MODEL.split(' ')[1]
    }

    line += valueExpression(prefix, props)

    if (props.EXTRA_EXPRESSION && props.EXTRA_EXPRESSION.length > 0) {
      line += ' ' + props.EXTRA_EXPRESSION
    }
    if (props.MODEL && props.MODEL.length > 0) {
      models += props.MODEL + '\n'
    }

    main += line + ' \n'
    componentlist.push(prefix)
  }

  return {
    models,
    main,
    componentlist,
    nodelist: network.nodeList,
    wireNode: network.wireNode,
    pinNode: network.pinNode,
    annotated,
    network
  }
}

/* eslint-disable eqeqeq */
/** Per-prefix value/parameter emission, ported from the legacy exporter */
function valueExpression (prefix, props) {
  const c0 = prefix.charAt(0).toUpperCase()
  let k = ''

  if (c0 === 'V' || c0 === 'I') {
    if (props.NAME === 'SINE') {
      k += ` SIN(${props.OFFSET} ${props.AMPLITUDE} ${props.FREQUENCY} ${props.DELAY} ${props.DAMPING_FACTOR} ${props.PHASE} )`
    } else if (props.NAME === 'EXP') {
      k += ` EXP(${props.INITIAL_VALUE} ${props.PULSED_VALUE} ${props.FREQUENCY} ${props.RISE_DELAY_TIME} ${props.RISE_TIME_CONSTANT} ${props.FALL_DELAY_TIME} ${props.FALL_TIME_CONSTANT} )`
    } else if (props.NAME === 'DC') {
      if (props.VALUE !== undefined) k += ' DC ' + props.VALUE
    } else if (props.NAME === 'PULSE') {
      k += ` PULSE(${props.INITIAL_VALUE} ${props.PULSED_VALUE} ${props.DELAY_TIME} ${props.RISE_TIME} ${props.FALL_TIME} ${props.PULSE_WIDTH} ${props.PERIOD} ${props.PHASE} )`
    } else if (props.VALUE !== undefined) {
      k += ' ' + props.VALUE
    }
  } else if (c0 === 'C') {
    k += ' ' + props.VALUE
    if (props.IC != 0 && props.IC !== undefined) k += ' IC=' + props.IC
  } else if (c0 === 'L') {
    k += ' ' + props.VALUE
    if (props.IC != 0 && props.IC !== undefined) k += ' IC=' + props.IC
    if (props.DTEMP != 27 && props.DTEMP !== undefined) k += ' dtemp=' + props.DTEMP
  } else if (c0 === 'M' || c0 === 'Q') {
    if (props.MULTIPLICITY_PARAMETER != 1 && props.MULTIPLICITY_PARAMETER !== undefined) {
      k += ' m=' + props.MULTIPLICITY_PARAMETER
    }
    if (props.DTEMP != 27 && props.DTEMP !== undefined) k += ' dtemp=' + props.DTEMP
  } else if (c0 === 'R') {
    k += ' ' + props.VALUE
    if (props.SHEET_RESISTANCE != 0 && props.SHEET_RESISTANCE !== undefined) {
      k += ' RSH=' + props.SHEET_RESISTANCE
    }
    if (props.FIRST_ORDER_TEMPERATURE_COEFF != 0 && props.FIRST_ORDER_TEMPERATURE_COEFF !== undefined) {
      k += ' tc1=' + props.FIRST_ORDER_TEMPERATURE_COEFF
    }
    if (props.SECOND_ORDER_TEMPERATURE_COEFF != 0 && props.SECOND_ORDER_TEMPERATURE_COEFF !== undefined) {
      k += ' tc2=' + props.SECOND_ORDER_TEMPERATURE_COEFF
    }
    if (props.PARAMETER_MEASUREMENT_TEMPERATURE != 27 && props.PARAMETER_MEASUREMENT_TEMPERATURE !== undefined) {
      k += ' TNOM=' + props.PARAMETER_MEASUREMENT_TEMPERATURE
    }
  } else if (props.VALUE !== undefined) {
    k += ' ' + props.VALUE
  }

  return k
}
