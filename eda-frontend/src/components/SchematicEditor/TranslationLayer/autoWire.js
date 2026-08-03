/**
 * autoWire.js — draws the wires for imported nets using the editor's own
 * routing, instead of copying KiCad wire geometry.
 *
 * Input is the topological netlist ({reference, pin} groups) plus the
 * components already placed on the canvas. For every net the pins are
 * chained with a greedy minimum-spanning-tree (Prim on Manhattan distance)
 * and each tree edge is routed with the same obstacle-aware Manhattan
 * router the interactive wire tool uses, so imported wires look exactly
 * like hand-drawn ones and connect by coordinate coincidence.
 */

import { pinAbsolutePosition, componentBBox, routeManhattan, projectOntoSegment, pathClear } from '../Canvas/geometry'
import { schematicStore } from '../Canvas/schematicStore'

/**
 * Canvas endpoint for one net pin: the placed component + its matching pin.
 * Pins are matched by number; when the library symbol numbers its pins
 * differently from KiCad, falls back to sorted index order.
 */
function resolveNetPin (netPin, placedByUuid) {
  const comp = placedByUuid.get(netPin.instanceUuid)
  if (!comp || !comp.pins || comp.pins.length === 0) return null
  let pin = comp.pins.find((p) => String(p.number) === String(netPin.pin))
  if (!pin) {
    const sorted = [...comp.pins].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }))
    const idx = parseInt(netPin.pin, 10) - 1
    pin = sorted[idx] || null
  }
  if (!pin) return null
  const p = pinAbsolutePosition(comp, pin)
  return { x: p.x, y: p.y }
}

function manhattan (a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** Prim's MST over the net's pin positions; returns index pairs [i, j] */
export function mstEdges (points) {
  const edges = []
  if (points.length < 2) return edges
  const inTree = new Array(points.length).fill(false)
  inTree[0] = true
  for (let step = 1; step < points.length; step++) {
    let best = null
    for (let i = 0; i < points.length; i++) {
      if (!inTree[i]) continue
      for (let j = 0; j < points.length; j++) {
        if (inTree[j]) continue
        const d = manhattan(points[i], points[j])
        if (!best || d < best.d) best = { d, i, j }
      }
    }
    inTree[best.j] = true
    edges.push([best.i, best.j])
  }
  return edges
}

// Matches the merge tolerance of dsuNetlist's onSegment (eps 0.5) with a
// safety margin: anything nearer than this to a foreign conductor would be
// unioned into its net by the netlist compiler.
const TOUCH_EPS = 0.75

function pointNearSegment (p, a, b, eps = TOUCH_EPS) {
  const { d } = projectOntoSegment(p, a, b)
  return d <= eps
}

/**
 * True when the candidate polyline would electrically touch a conductor of
 * another net: a foreign pin on one of its segments, one of its vertices on
 * a foreign wire, or a foreign wire's vertex on one of its segments (the
 * three coincidence rules dsuNetlist merges by).
 */
function touchesForeign (pts, foreign) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    for (const pin of foreign.pins) {
      if (pointNearSegment(pin, a, b)) return true
    }
    for (const v of foreign.vertices) {
      if (pointNearSegment(v, a, b)) return true
    }
  }
  for (const p of pts) {
    for (const seg of foreign.segments) {
      if (pointNearSegment(p, seg.a, seg.b)) return true
    }
  }
  return false
}

/**
 * Wire each group of canvas points into one net using the editor's router.
 * Components must already be committed to the schematic store so the router
 * can see their bounding boxes as obstacles.
 *
 * Routing is net-aware: connectivity is coordinate coincidence, so a wire
 * that merely brushes another net's pin or wire would short the two nets in
 * the compiled netlist even though the imported topology was correct. Each
 * candidate route is validated against every pin outside the net and all
 * previously routed wires.
 *
 * @param {Array<Array<{x, y}>>} groups pin positions per net
 * @returns {number} wires added
 */
export function wirePointGroups (groups) {
  const state = schematicStore.getState()
  const obstacles = state.components.map(componentBBox)

  const allPins = []
  for (const comp of state.components) {
    for (const pin of comp.pins) allPins.push(pinAbsolutePosition(comp, pin))
  }
  const key = (p) => Math.round(p.x) + ',' + Math.round(p.y)

  // Conductors of other nets, grown as wiring progresses
  const foreign = { pins: [], segments: [], vertices: [] }
  for (const wire of state.wires) {
    for (let i = 0; i < wire.points.length; i++) {
      foreign.vertices.push(wire.points[i])
      if (i > 0) foreign.segments.push({ a: wire.points[i - 1], b: wire.points[i] })
    }
  }

  let wired = 0
  for (const points of groups) {
    if (points.length < 2) continue
    const netKeys = new Set(points.map(key))
    foreign.pins = allPins.filter((p) => !netKeys.has(key(p)))

    const netWires = []
    for (const [i, j] of mstEdges(points)) {
      const from = points[i]
      const to = points[j]
      const dir = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'HV' : 'VH'
      const validate = (pts) => !touchesForeign(pts, foreign)
      let corners = routeManhattan(from, to, dir, obstacles, validate)
      let pts = [from, ...corners, to]
      if (!pathClear(pts, obstacles) || touchesForeign(pts, foreign)) {
        // Symbols whose pins sit inside their own bounding box (common in the
        // old editor's artwork) make their own body an unavoidable obstacle —
        // the router then degrades to its blind fallback. Retry without the
        // boxes that contain the endpoints.
        const owns = (r, p) => p.x >= r.x - 2 && p.x <= r.x + r.width + 2 &&
          p.y >= r.y - 2 && p.y <= r.y + r.height + 2
        const edgeObstacles = obstacles.filter((r) => !owns(r, from) && !owns(r, to))
        corners = routeManhattan(from, to, dir, edgeObstacles, validate)
        pts = [from, ...corners, to]
      }
      if (touchesForeign(pts, foreign)) {
        console.warn('[autoWire] no short-free route found', from, to)
      }
      const id = schematicStore.addWire(pts, { undoable: false })
      if (id) {
        wired++
        netWires.push(pts)
      }
    }
    // This net's wires become foreign conductors for every following net
    for (const pts of netWires) {
      for (let i = 0; i < pts.length; i++) {
        foreign.vertices.push(pts[i])
        if (i > 0) foreign.segments.push({ a: pts[i - 1], b: pts[i] })
      }
    }
  }
  return wired
}

/**
 * Wire up nets from the KiCad v6+ importer (pins referenced by instance uuid
 * + pin number, resolved against the placed components).
 *
 * @param {Array} nets      output of extractNets
 * @param {Map} placedByUuid KiCad instance uuid → placed SchematicComponent
 * @returns {{wired: number, openNets: number}}
 */
export function autoWireNets (nets, placedByUuid) {
  const groups = []
  let openNets = 0
  for (const net of nets) {
    const points = []
    for (const netPin of net.pins) {
      const p = resolveNetPin(netPin, placedByUuid)
      if (p) points.push(p)
    }
    if (points.length < 2 && net.pins.length >= 2) {
      openNets++ // pins existed but components were not resolved
    }
    groups.push(points)
  }
  return { wired: wirePointGroups(groups), openNets }
}
