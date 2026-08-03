/**
 * junctions.js — junction-dot computation and probe magnetic snapping.
 */

import { coordKey, wireSegments, projectOntoSegment, pinAbsolutePosition } from './geometry'

/** True when p lies on orthogonal segment ab (within eps), excluding endpoints */
function strictlyInsideSegment (p, a, b, eps = 0.5) {
  if (Math.abs(a.y - b.y) <= eps) {
    // horizontal
    return Math.abs(p.y - a.y) <= eps &&
      p.x > Math.min(a.x, b.x) + eps && p.x < Math.max(a.x, b.x) - eps
  }
  if (Math.abs(a.x - b.x) <= eps) {
    // vertical
    return Math.abs(p.x - a.x) <= eps &&
      p.y > Math.min(a.y, b.y) + eps && p.y < Math.max(a.y, b.y) - eps
  }
  return false
}

/**
 * Compute junction dots: coordinates where 3+ wire segment ENDS meet, or where
 * a segment end (or component pin) lands on the interior of another segment
 * (a T junction). Plain crossings — two segments passing through each other
 * with no endpoint at the crossing — do NOT get a dot.
 *
 * @returns {Array<{x: number, y: number}>}
 */
export function computeJunctions (wires, components = []) {
  const endCounts = new Map() // coordKey -> { p, count }
  const allSegments = []

  for (const wire of wires) {
    const segs = wireSegments(wire)
    for (const [a, b] of segs) allSegments.push([a, b])
    for (const [a, b] of segs) {
      for (const p of [a, b]) {
        const key = coordKey(p.x, p.y)
        const entry = endCounts.get(key) || { p, count: 0 }
        entry.count++
        endCounts.set(key, entry)
      }
    }
  }

  const junctions = []
  const emitted = new Set()
  const emit = (p) => {
    const key = coordKey(p.x, p.y)
    if (!emitted.has(key)) {
      emitted.add(key)
      junctions.push({ x: p.x, y: p.y })
    }
  }

  // Interior vertices of a single polyline count twice (segment i end +
  // segment i+1 start) but are just corners — a dot needs >= 3 ends, meaning
  // a third segment terminates there, or a T against another segment's body.
  for (const { p, count } of endCounts.values()) {
    if (count >= 3) {
      emit(p)
      continue
    }
    for (const [a, b] of allSegments) {
      if (strictlyInsideSegment(p, a, b)) {
        emit(p)
        break
      }
    }
  }

  // Pin landing on a segment interior also forms an electrical T junction.
  for (const comp of components) {
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      for (const [a, b] of allSegments) {
        if (strictlyInsideSegment(p, a, b)) {
          emit(p)
          break
        }
      }
    }
  }

  return junctions
}

/**
 * Probe magnetic snap: orthogonally project the probe tip onto the nearest
 * wire segment (clamped to the segment); snap when within `tolerance` px.
 *
 * @param {{x: number, y: number}} tip probe tip in canvas coordinates
 * @param {Array} wires committed wires
 * @param {number} tolerance snap radius (default 8 canvas px)
 * @returns {{x, y, wireId, segIndex, d} | null}
 */
export function snapProbeToWire (tip, wires, tolerance = 8) {
  let best = null
  for (const wire of wires) {
    const segs = wireSegments(wire)
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i]
      const pr = projectOntoSegment(tip, a, b)
      if (pr.d <= tolerance && (!best || pr.d < best.d)) {
        best = { x: pr.x, y: pr.y, wireId: wire.id, segIndex: i, d: pr.d }
      }
    }
  }
  return best
}
