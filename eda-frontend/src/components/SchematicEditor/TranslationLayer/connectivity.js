/**
 * connectivity.js — extracts pin-to-pin nets from a parsed KiCad document.
 *
 * Everything here works in KiCad sheet millimetres. The output is purely
 * topological ({reference, pin} groups), so downstream placement is free to
 * lay components out however it likes and re-route wires from scratch —
 * the imported geometry of the KiCad wires never reaches the canvas.
 *
 * Union rules (matching eeschema semantics closely enough for import):
 *  - the two endpoints of a wire segment are one conductor
 *  - a segment endpoint lying anywhere on another segment connects to it
 *    (plain crossings share no endpoint, so they stay separate)
 *  - a junction connects every segment passing through its point
 *  - a pin connects to any segment its electrical point lies on
 *  - labels name a net; same-text global labels union across the sheet
 *  - all power symbols with the same value (GND, VCC, ...) form one net
 */

const EPS = 0.01 // mm — file coordinates are written with 2+ decimals

function key (x, y) {
  return Math.round(x * 100) + ',' + Math.round(y * 100)
}

// ---------------------------------------------------------------------------
// Symbol instance transform (KiCad symbol space → sheet space)
// ---------------------------------------------------------------------------

/**
 * 2x2 transform [a, b, c, d] with x' = a·x + c·y, y' = b·x + d·y.
 * Symbol space is Y-up, the sheet is Y-down, so the base matrices fold the
 * Y negation in; the instance angle is CCW on screen (KiCad convention).
 * Mirroring is applied after rotation, in sheet space, matching the order
 * eeschema's parser applies SetOrientation calls.
 */
export function instanceMatrix (angle, mirror) {
  let m
  switch (((angle % 360) + 360) % 360) {
    case 90: m = [0, -1, -1, 0]; break
    case 180: m = [-1, 0, 0, 1]; break
    case 270: m = [0, 1, 1, 0]; break
    default: m = [1, 0, 0, -1]
  }
  if (mirror === 'x') m = [m[0], -m[1], m[2], -m[3]] // flip sheet Y
  if (mirror === 'y') m = [-m[0], m[1], -m[2], m[3]] // flip sheet X
  return m.map((v) => (v === 0 ? 0 : v)) // normalise -0
}

/** Absolute sheet-mm position of a symbol-local point */
export function transformPoint (instance, lx, ly) {
  const m = instanceMatrix(instance.angle, instance.mirror)
  return {
    x: instance.x + m[0] * lx + m[2] * ly,
    y: instance.y + m[1] * lx + m[3] * ly
  }
}

/**
 * Pins of an instance with absolute sheet positions.
 * Includes unit-0 (shared) pins plus the pins of the instance's unit.
 */
export function instancePins (instance, template) {
  if (!template) return []
  const out = []
  for (const pin of template.pins) {
    if (pin.unit !== 0 && pin.unit !== instance.unit) continue
    const p = transformPoint(instance, pin.x, pin.y)
    out.push({ number: pin.number, name: pin.name, type: pin.type, x: p.x, y: p.y })
  }
  return out
}

// ---------------------------------------------------------------------------
// Union-find over coordinate keys
// ---------------------------------------------------------------------------

export class DSU {
  constructor () {
    this.parent = new Map()
  }

  find (k) {
    if (!this.parent.has(k)) this.parent.set(k, k)
    let root = k
    while (this.parent.get(root) !== root) root = this.parent.get(root)
    while (this.parent.get(k) !== root) {
      const next = this.parent.get(k)
      this.parent.set(k, root)
      k = next
    }
    return root
  }

  union (a, b) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/** True when point p lies on segment ab (inclusive of endpoints) */
export function pointOnSegment (p, a, b) {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < EPS) return Math.hypot(p.x - a.x, p.y - a.y) < EPS
  if (Math.abs(cross) / len > EPS) return false
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
  return dot >= -EPS * len && dot <= len * len + EPS * len
}

/**
 * Compile the netlist.
 *
 * @param {Object} doc parsed KiCad document (kicadDocument.parseKicadSch)
 * @returns {Array<{name: string|null, pins: Array<{instanceUuid, reference, pin, x, y}>}>}
 *          nets with at least one pin; single-pin nets are included so the
 *          caller can decide to skip them.
 */
export function extractNets (doc) {
  const dsu = new DSU()
  const segs = doc.wires

  // Attach a point to every segment passing through it.
  const unionPointToSegments = (p, pk) => {
    for (const s of segs) {
      if (pointOnSegment(p, s.a, s.b)) dsu.union(pk, key(s.a.x, s.a.y))
    }
  }

  // 1. Each segment is one conductor.
  for (const s of segs) dsu.union(key(s.a.x, s.a.y), key(s.b.x, s.b.y))

  // 2. Segment endpoints landing on other segments (T connections).
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      unionPointToSegments(p, key(p.x, p.y))
    }
  }

  // 3. Junctions connect everything through their point (incl. crossings).
  for (const j of doc.junctions) {
    unionPointToSegments(j, key(j.x, j.y))
  }

  // 4. Pins.
  const pinEntries = []
  const powerNets = new Map() // value → virtual key
  for (const inst of doc.instances) {
    const template = doc.templates[inst.libId]
    const pins = instancePins(inst, template)
    const isPower = template && template.isPower
    for (const pin of pins) {
      const pk = key(pin.x, pin.y)
      unionPointToSegments(pin, pk)
      pinEntries.push({
        instanceUuid: inst.uuid,
        reference: inst.reference,
        pin: pin.number,
        x: pin.x,
        y: pin.y,
        key: pk,
        isPower
      })
      if (isPower) {
        const netName = inst.value || inst.libId.replace(/^power:/, '')
        const vk = 'power:' + netName
        if (!powerNets.has(netName)) powerNets.set(netName, vk)
        dsu.union(pk, vk)
      }
    }
  }

  // 5. Labels: name nets; global labels with the same text union together.
  const labelsByRoot = new Map() // filled after unions settle
  const globalKeys = new Map() // text → virtual key
  for (const l of doc.labels) {
    const lk = key(l.x, l.y)
    unionPointToSegments(l, lk)
    if (l.kind !== 'local') {
      const vk = 'glabel:' + l.text
      if (!globalKeys.has(l.text)) globalKeys.set(l.text, vk)
      dsu.union(lk, vk)
    }
  }
  for (const l of doc.labels) {
    const root = dsu.find(key(l.x, l.y))
    if (!labelsByRoot.has(root)) labelsByRoot.set(root, l.text)
  }
  for (const [name, vk] of powerNets) {
    labelsByRoot.set(dsu.find(vk), name)
  }

  // 6. Group pins by DSU root.
  const groups = new Map()
  for (const e of pinEntries) {
    const root = dsu.find(e.key)
    let g = groups.get(root)
    if (!g) {
      g = { name: labelsByRoot.get(root) || null, pins: [] }
      groups.set(root, g)
    }
    g.pins.push(e)
  }
  return [...groups.values()]
}
