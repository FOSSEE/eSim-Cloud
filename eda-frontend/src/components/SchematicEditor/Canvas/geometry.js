/**
 * geometry.js — pure math for the React SVG schematic canvas.
 *
 * Coordinate spaces:
 *  - Screen space  (clientX/clientY relative to the svg element)
 *  - Canvas space  (schematic coordinates; components/wires live here)
 *  - Grid space    (canvas coordinates quantised to GRID_SIZE)
 *
 * screen -> canvas:  x = (cx - dx) / s ,  y = (cy - dy) / s
 * canvas -> screen:  cx = x * s + dx  ,  cy = y * s + dy
 */

export const GRID_SIZE = 20

/** @typedef {{x: number, y: number}} Point */
/** @typedef {{s: number, dx: number, dy: number}} ViewTransform */

/** Snap a scalar to the grid: round(v / G) * G */
export function snap (v, grid = GRID_SIZE) {
  return Math.round(v / grid) * grid
}

/** Snap a point to the grid */
export function snapPoint (p, grid = GRID_SIZE) {
  return { x: snap(p.x, grid), y: snap(p.y, grid) }
}

/** Convert a screen-space point (relative to the svg) to canvas space */
export function screenToCanvas (cx, cy, view) {
  return {
    x: (cx - view.dx) / view.s,
    y: (cy - view.dy) / view.s
  }
}

/** Convert a canvas-space point to screen space */
export function canvasToScreen (x, y, view) {
  return {
    x: x * view.s + view.dx,
    y: y * view.s + view.dy
  }
}

/**
 * Pointer-centred zoom. Returns the new view transform such that the canvas
 * point under the cursor stays put:
 *   dx' = cx - (cx - dx) * (s' / s)
 */
export function zoomAtPoint (view, cx, cy, factor, minScale = 0.1, maxScale = 10) {
  const sNew = Math.min(maxScale, Math.max(minScale, view.s * factor))
  if (sNew === view.s) return view
  const k = sNew / view.s
  return {
    s: sNew,
    dx: cx - (cx - view.dx) * k,
    dy: cy - (cy - view.dy) * k
  }
}

/** Rotate a point by `rot` degrees (multiples of 90) around origin */
export function rotate90 (x, y, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90: return { x: -y, y: x }
    case 180: return { x: -x, y: -y }
    case 270: return { x: y, y: -x }
    default: return { x, y }
  }
}

/**
 * Absolute canvas position of a component pin, honouring rotation.
 * Pins are stored relative to the un-rotated top-left of the component;
 * rotation happens around the component centre.
 */
export function pinAbsolutePosition (component, pin) {
  const cx = component.x + component.width / 2
  const cy = component.y + component.height / 2
  const local = rotate90(pin.dx - component.width / 2, pin.dy - component.height / 2, component.rotation || 0)
  return { x: cx + local.x, y: cy + local.y }
}

/** Axis-aligned bounding box of a rotated component */
export function componentBBox (component) {
  const rot = ((component.rotation || 0) / 90) % 2 !== 0
  const w = rot ? component.height : component.width
  const h = rot ? component.width : component.height
  const cx = component.x + component.width / 2
  const cy = component.y + component.height / 2
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/**
 * Orthogonal project of point P onto segment AB, clamped to the segment.
 * Returns { x, y, d } where d is the distance from P to the projection.
 */
export function projectOntoSegment (p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const x = a.x + t * dx
  const y = a.y + t * dy
  return { x, y, d: Math.hypot(p.x - x, p.y - y), t }
}

/**
 * KiCad-style L-route between two points.
 * dir 'HV' = horizontal-then-vertical; 'VH' = vertical-then-horizontal.
 * Returns intermediate corner points only (may be empty for straight runs).
 */
export function orthogonalRoute (from, to, dir = 'HV') {
  if (from.x === to.x || from.y === to.y) return []
  return dir === 'HV'
    ? [{ x: to.x, y: from.y }]
    : [{ x: from.x, y: to.y }]
}

/**
 * True when segment ab crosses the interior of rect r. The rect is shrunk by
 * `shrink` so wires may touch a component's edge (pins sit on the outline)
 * without being counted as passing through the body.
 */
export function segIntersectsRect (a, b, r, shrink = 2) {
  const x0 = r.x + shrink
  const x1 = r.x + r.width - shrink
  const y0 = r.y + shrink
  const y1 = r.y + r.height - shrink
  if (x0 >= x1 || y0 >= y1) return false
  return Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1 &&
    Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1
}

/** True when no segment of the polyline crosses any obstacle rect */
export function pathClear (points, obstacles) {
  for (let i = 1; i < points.length; i++) {
    for (const r of obstacles) {
      if (segIntersectsRect(points[i - 1], points[i], r)) return false
    }
  }
  return true
}

/**
 * Obstacle-aware Manhattan route. Tries the preferred L direction, then the
 * flipped one, then Z-shaped detours hugging each obstacle's padded edges.
 * Falls back to the plain preferred L when everything collides, so a route
 * always comes back. Returns intermediate corners only, like orthogonalRoute.
 *
 * `validate(points)` optionally vetoes a candidate polyline for reasons the
 * rect obstacles can't express (the importer rejects paths that would touch
 * another net's pins or wires). When a validator is present, Z-routes over a
 * sweep of grid channels between and around the endpoints are also tried
 * before giving up, since the rect-hugging detours only dodge components.
 */
export function routeManhattan (from, to, dir = 'HV', obstacles = [], validate = null) {
  const check = (corners) => {
    const pts = [from, ...corners, to]
    return pathClear(pts, obstacles) && (!validate || validate(pts))
  }
  const primary = orthogonalRoute(from, to, dir)
  if (check(primary)) return primary
  const flipped = orthogonalRoute(from, to, dir === 'HV' ? 'VH' : 'HV')
  if (check(flipped)) return flipped
  for (const r of obstacles) {
    const pad = GRID_SIZE
    for (const mx of [snap(r.x - pad), snap(r.x + r.width + pad)]) {
      const corners = [{ x: mx, y: from.y }, { x: mx, y: to.y }]
      if (check(corners)) return corners
    }
    for (const my of [snap(r.y - pad), snap(r.y + r.height + pad)]) {
      const corners = [{ x: from.x, y: my }, { x: to.x, y: my }]
      if (check(corners)) return corners
    }
  }
  if (validate) {
    const midX = snap((from.x + to.x) / 2)
    const midY = snap((from.y + to.y) / 2)
    for (let k = 0; k <= 40; k++) {
      for (const s of k === 0 ? [0] : [-1, 1]) {
        const mx = midX + s * k * GRID_SIZE
        const zx = [{ x: mx, y: from.y }, { x: mx, y: to.y }]
        if (check(zx)) return zx
        const my = midY + s * k * GRID_SIZE
        const zy = [{ x: from.x, y: my }, { x: to.x, y: my }]
        if (check(zy)) return zy
      }
    }
  }
  return primary
}

/**
 * Weld the endpoints of a wire onto the exact coordinates of nearby pins or
 * wire vertices. Connectivity is coordinate coincidence at sub-pixel precision
 * (dsuNetlist onSegment eps = 0.5), while symbols routinely put pins at
 * off-grid positions — grid-snapping an endpoint that the user dropped on a
 * pin silently opens the net. Interior vertices stay grid-snapped.
 *
 * When welding shifts an endpoint off its neighbour's axis, a 90° elbow is
 * inserted beside the welded end (mirroring applyWireStretch) so the wire
 * stays strictly Manhattan.
 *
 * @param {Array<Point>} points grid-snapped polyline (length >= 2)
 * @param {SpatialHash} index   committed pins + wire vertices
 * @param {Array<Point>} raw    pre-snap polyline, used for proximity lookup
 */
export function weldWireEndpoints (points, index, raw, tolerance = 8) {
  if (points.length < 2) return points
  const pts = points.map((p) => ({ ...p }))
  const weldEnd = (i, rawP) => {
    const near = index.nearestPoint(rawP.x, rawP.y, tolerance)
    if (!near) return
    pts[i] = { x: near.x, y: near.y }
  }
  weldEnd(0, raw[0])
  weldEnd(pts.length - 1, raw[raw.length - 1])

  // Repair any diagonal the weld introduced: elbow beside the welded end so
  // the segment reaching the untouched neighbour keeps its original axis.
  const out = []
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && !segmentAxis(pts[i - 1], pts[i]) &&
      (pts[i - 1].x !== pts[i].x || pts[i - 1].y !== pts[i].y)) {
      const axis = segmentAxis(points[i - 1], points[i]) || 'H'
      const weldedEnd = i === 1 ? 'a' : 'b' // diagonals only appear beside a welded endpoint
      const perpendicularFirst = weldedEnd === 'a' ? axis === 'H' : axis === 'V'
      out.push(perpendicularFirst
        ? { x: pts[i - 1].x, y: pts[i].y }
        : { x: pts[i].x, y: pts[i - 1].y })
    }
    out.push(pts[i])
  }
  return out
}

/** Expand a wire's ordered vertex list into [ [a, b], ... ] segments */
export function wireSegments (wire) {
  const segs = []
  for (let i = 0; i < wire.points.length - 1; i++) {
    const a = wire.points[i]
    const b = wire.points[i + 1]
    if (a.x !== b.x || a.y !== b.y) segs.push([a, b])
  }
  return segs
}

/** Stable string key for a canvas coordinate (grid resolution) */
export function coordKey (x, y) {
  return Math.round(x) + ',' + Math.round(y)
}

/**
 * Find the wires that ride on the pins of a set of moving components.
 *
 * There are no wire→pin reference links: a wire is connected to a pin when
 * their coordinates coincide (the same rule the netlist DSU uses). So a drag
 * that moves a component without moving the wire vertices sitting on its pins
 * silently breaks the net. This classifies each affected wire:
 *
 *   'translate' — both endpoints ride moving pins, so the whole wire travels
 *                 with the drag and keeps its shape
 *   'stretch'   — only some vertices ride moving pins; just those follow, and
 *                 the wire rubber-bands
 *
 * Wires already in `movingIds` are skipped — the caller translates those.
 * Call this against the pre-move component positions.
 *
 * @param {Set<string>} movingIds ids of components/wires/probes being dragged
 * @returns {Array<{wire: Object, mode: 'translate'|'stretch', indices: Set<number>}>}
 */
export function wiresAttachedToComponents (components, wires, movingIds) {
  const pinKeys = new Set()
  for (const comp of components) {
    if (!movingIds.has(comp.id)) continue
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      pinKeys.add(coordKey(p.x, p.y))
    }
  }
  if (pinKeys.size === 0) return []

  const out = []
  for (const wire of wires) {
    if (movingIds.has(wire.id)) continue
    const indices = new Set()
    for (let i = 0; i < wire.points.length; i++) {
      if (pinKeys.has(coordKey(wire.points[i].x, wire.points[i].y))) indices.add(i)
    }
    if (indices.size === 0) continue
    const bothEnds = indices.has(0) && indices.has(wire.points.length - 1)
    out.push({ wire, mode: bothEnds ? 'translate' : 'stretch', indices })
  }
  return out
}

/** Axis of an axis-aligned segment: 'H' | 'V', or null when degenerate */
export function segmentAxis (a, b) {
  if (a.y === b.y && a.x !== b.x) return 'H'
  if (a.x === b.x && a.y !== b.y) return 'V'
  return null
}

/** Drop repeated vertices and merge colinear runs. Coordinates are never moved. */
export function simplifyPolyline (points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p)
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1]
    const b = out[i]
    const c = out[i + 1]
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1)
  }
  return out
}

/**
 * Apply a drag delta to the attachments from wiresAttachedToComponents.
 *
 * Wires are strictly Manhattan: every segment stays axis-aligned. Shifting one
 * end of a segment while the other stays put would tilt it, so such a segment
 * is re-routed as an L. The elbow is placed beside the vertex that moved, which
 * leaves the segment meeting the stationary vertex on its original axis — the
 * untouched part of the wire keeps its shape and only a stub appears at the
 * dragged pin.
 *
 * When `obstacles` (component bboxes at their post-move positions) are given
 * and the preferred elbow would cross one, the flipped orientation is used
 * instead — provided it is itself clear.
 *
 * Pure: returns fresh wire objects, leaving the originals untouched.
 */
export function applyWireStretch (attachments, dx, dy, obstacles = []) {
  const shift = (p) => ({ x: p.x + dx, y: p.y + dy })
  return attachments.map(({ wire, mode, indices }) => {
    if (mode === 'translate') return { ...wire, points: wire.points.map(shift) }

    const old = wire.points
    const moved = old.map((p, i) => (indices.has(i) ? shift(p) : p))
    const out = [moved[0]]
    for (let i = 1; i < moved.length; i++) {
      const a = moved[i - 1]
      const b = moved[i]
      const stubAtA = indices.has(i - 1)
      const stubAtB = indices.has(i)
      if (stubAtA !== stubAtB) {
        // Exactly one end moved: bend. Fall back to 'H' for legacy non-orthogonal input.
        const axis = segmentAxis(old[i - 1], old[i]) || 'H'
        let perpendicularFirst = stubAtA ? axis === 'H' : axis === 'V'
        const elbow = (perp) => (perp ? { x: a.x, y: b.y } : { x: b.x, y: a.y })
        if (obstacles.length &&
          !pathClear([a, elbow(perpendicularFirst), b], obstacles) &&
          pathClear([a, elbow(!perpendicularFirst), b], obstacles)) {
          perpendicularFirst = !perpendicularFirst
        }
        out.push(elbow(perpendicularFirst))
      }
      out.push(b)
    }
    return { ...wire, points: simplifyPolyline(out) }
  })
}

/**
 * SpatialHash — square-cell spatial index giving O(1) neighbourhood queries.
 *
 * Pins and wire vertices are inserted once per committed-state change; every
 * mousemove during a drag then only inspects the 3x3 cell neighbourhood of
 * the cursor instead of sweeping all canvas nodes.
 */
export class SpatialHash {
  constructor (cellSize = 100) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  _key (x, y) {
    return Math.floor(x / this.cellSize) + ',' + Math.floor(y / this.cellSize)
  }

  insert (x, y, payload) {
    const key = this._key(x, y)
    let bucket = this.cells.get(key)
    if (!bucket) {
      bucket = []
      this.cells.set(key, bucket)
    }
    bucket.push({ x, y, payload })
  }

  /**
   * Insert a segment by registering it in every cell its bounding box covers,
   * so point→segment queries stay O(1) for orthogonal wires.
   */
  insertSegment (a, b, payload) {
    const minX = Math.floor(Math.min(a.x, b.x) / this.cellSize)
    const maxX = Math.floor(Math.max(a.x, b.x) / this.cellSize)
    const minY = Math.floor(Math.min(a.y, b.y) / this.cellSize)
    const maxY = Math.floor(Math.max(a.y, b.y) / this.cellSize)
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const key = gx + ',' + gy
        let bucket = this.cells.get(key)
        if (!bucket) {
          bucket = []
          this.cells.set(key, bucket)
        }
        bucket.push({ a, b, payload, isSegment: true })
      }
    }
  }

  /** All entries within the 3x3 cell neighbourhood of (x, y) */
  neighbourhood (x, y) {
    const gx = Math.floor(x / this.cellSize)
    const gy = Math.floor(y / this.cellSize)
    const out = []
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const bucket = this.cells.get(ix + ',' + iy)
        if (bucket) out.push(...bucket)
      }
    }
    return out
  }

  /** Nearest point entry within `tolerance` of (x, y); null when none */
  nearestPoint (x, y, tolerance) {
    let best = null
    let bestD = tolerance
    for (const e of this.neighbourhood(x, y)) {
      if (e.isSegment) continue
      const d = Math.hypot(e.x - x, e.y - y)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  /** Nearest segment (projected) within `tolerance`; null when none */
  nearestSegment (x, y, tolerance) {
    let best = null
    let bestD = tolerance
    for (const e of this.neighbourhood(x, y)) {
      if (!e.isSegment) continue
      const pr = projectOntoSegment({ x, y }, e.a, e.b)
      if (pr.d < bestD) {
        bestD = pr.d
        best = { x: pr.x, y: pr.y, d: pr.d, a: e.a, b: e.b, payload: e.payload }
      }
    }
    return best
  }
}

/**
 * Build the spatial index for a schematic snapshot: pins as points,
 * wire segments as segments, wire vertices as points.
 */
export function buildSpatialIndex (components, wires, cellSize = 100) {
  const index = new SpatialHash(cellSize)
  for (const comp of components) {
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      index.insert(p.x, p.y, { kind: 'pin', componentId: comp.id, pinNumber: pin.number })
    }
  }
  for (const wire of wires) {
    for (const pt of wire.points) {
      index.insert(pt.x, pt.y, { kind: 'wireVertex', wireId: wire.id })
    }
    for (const [a, b] of wireSegments(wire)) {
      index.insertSegment(a, b, { kind: 'wireSegment', wireId: wire.id })
    }
  }
  return index
}
