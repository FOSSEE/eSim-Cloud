/**
 * legacyNets.js — netlist extraction for legacy KiCad v4/v5 (.sch) imports.
 *
 * The legacy format has no embedded symbol library, so the original pin
 * positions are unknowable from the file alone: wire endpoints sit where the
 * *KiCad* symbol's pins were, while the placed *library* symbol puts its pins
 * somewhere nearby — often on different sides entirely (a horizontal KiCad
 * resistor placed as a vertical library resistor). Copying the wires
 * verbatim therefore always leaves stubs that miss the pins.
 *
 * This module reconstructs pure connectivity instead. Wire segments,
 * junctions and labels form conductor groups exactly (their coordinates are
 * exact in the file). Pins are then attached per component by competitive
 * matching: every pin gets a distance to every nearby net (minimum
 * perpendicular projection onto the net's segments) and the component's pins
 * are greedily assigned nearest-first, each net used at most once per
 * component. That resolves ambiguity when the placed symbol's pins land
 * closer to the *wrong* wire than the right one — the right wire wins
 * because the closer pin claims the closer net first. A second pass lets
 * genuinely shorted pins reuse a net when nothing else is in range.
 */

import { DSU, pointOnSegment } from './connectivity'
import { projectOntoSegment } from '../Canvas/geometry'

/** 100 canvas units = 500 mil — generous, because library symbols can put a
 *  pin a few grid steps away from where the original KiCad symbol had it. */
const DEFAULT_MATCH_TOLERANCE = 100

function key (x, y) {
  return Math.round(x * 100) + ',' + Math.round(y * 100)
}

/**
 * Group placed pins into nets.
 *
 * @param {Object} input
 * @param {Array<{a: Point, b: Point}>} input.segments  wire segments (canvas units)
 * @param {Array<Point>} input.junctions               explicit Connection points
 * @param {Array<{text: string, x, y}>} input.labels   global/local labels
 * @param {Array<{x, y, componentId, pin}>} input.pins placed library pins (absolute)
 * @param {number} [input.matchTolerance]
 * @returns {Array<{name: string|null, points: Array<{x, y, componentId, pin}>}>}
 *          one entry per net with >= 1 attached pin
 */
export function extractLegacyNets ({ segments, junctions = [], labels = [], pins = [], matchTolerance = DEFAULT_MATCH_TOLERANCE }) {
  const dsu = new DSU()

  const unionPointToSegments = (p, pk) => {
    for (const s of segments) {
      if (pointOnSegment(p, s.a, s.b)) dsu.union(pk, key(s.a.x, s.a.y))
    }
  }

  // Conductors: exact, straight from the file.
  for (const s of segments) dsu.union(key(s.a.x, s.a.y), key(s.b.x, s.b.y))
  for (const s of segments) {
    unionPointToSegments(s.a, key(s.a.x, s.a.y))
    unionPointToSegments(s.b, key(s.b.x, s.b.y))
  }
  for (const j of junctions) unionPointToSegments(j, key(j.x, j.y))

  // Labels attach to the conductor under them; same-text labels unify nets
  // (matching KiCad global-label semantics) and provide the net name.
  for (const l of labels) {
    const lk = key(l.x, l.y)
    unionPointToSegments(l, lk)
    dsu.union(lk, 'label:' + l.text)
  }
  const namesByRoot = new Map()
  for (const l of labels) {
    const root = dsu.find(key(l.x, l.y))
    if (!namesByRoot.has(root)) namesByRoot.set(root, l.text)
  }

  // Segments per net root, for pin→net distances.
  const segsByRoot = new Map()
  for (const s of segments) {
    const root = dsu.find(key(s.a.x, s.a.y))
    let list = segsByRoot.get(root)
    if (!list) {
      list = []
      segsByRoot.set(root, list)
    }
    list.push(s)
  }

  // Distance from a pin to a net = min projection distance over its segments.
  const netDistance = (pin, segs) => {
    let best = Infinity
    for (const s of segs) {
      const pr = projectOntoSegment(pin, s.a, s.b)
      if (pr.d < best) best = pr.d
    }
    return best
  }

  // Competitive per-component assignment.
  const pinsByComponent = new Map()
  for (const pin of pins) {
    let list = pinsByComponent.get(pin.componentId)
    if (!list) {
      list = []
      pinsByComponent.set(pin.componentId, list)
    }
    list.push(pin)
  }

  const groups = new Map()
  const attach = (root, pin) => {
    let g = groups.get(root)
    if (!g) {
      g = { name: namesByRoot.get(root) || null, points: [] }
      groups.set(root, g)
    }
    g.points.push(pin)
  }

  for (const compPins of pinsByComponent.values()) {
    const pairs = []
    for (const pin of compPins) {
      for (const [root, segs] of segsByRoot) {
        const d = netDistance(pin, segs)
        if (d <= matchTolerance) pairs.push({ pin, root, d })
      }
    }
    pairs.sort((a, b) => a.d - b.d)

    const assigned = new Set()
    const usedNets = new Set()
    // Pass 1: distinct nets — the closer pin claims the closer net first.
    for (const { pin, root } of pairs) {
      if (assigned.has(pin) || usedNets.has(root)) continue
      assigned.add(pin)
      usedNets.add(root)
      attach(root, pin)
    }
    // Pass 2: leftovers may share an already-used net (genuine shorts).
    for (const { pin, root } of pairs) {
      if (assigned.has(pin)) continue
      assigned.add(pin)
      attach(root, pin)
    }
  }
  return [...groups.values()]
}
