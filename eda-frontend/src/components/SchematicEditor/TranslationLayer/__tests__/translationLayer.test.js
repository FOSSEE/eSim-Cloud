/**
 * translationLayer.test.js — KiCad v6+ import pipeline units.
 *
 * Run: CI=true NODE_OPTIONS=--openssl-legacy-provider npx react-scripts test \
 *        --watchAll=false --testPathPattern=translationLayer
 */

import { parseSExpr, child, children, atoms, childValue } from '../sExprParser'
import { parseKicadSch } from '../kicadDocument'
import { instanceMatrix, transformPoint, instancePins, pointOnSegment, extractNets } from '../connectivity'
import { mstEdges, autoWireNets } from '../autoWire'
import { schematicStore } from '../../Canvas/schematicStore'
import { pinAbsolutePosition } from '../../Canvas/geometry'

// ---------------------------------------------------------------------------
// Fixture: voltage divider R1/R2 with GND, a local label on the mid node,
// a junction-connected side branch and one floating pin (R1.1 only has the
// unterminated label-less wire below it via nothing — it stays single-pin).
//
// Device:R pins (symbol space, Y-up): pin1 at (0, 3.81) [top], pin2 at
// (0, -3.81) [bottom]. On the Y-down sheet an unrotated R at (x, y) puts
// pin1 at (x, y-3.81) and pin2 at (x, y+3.81).
// ---------------------------------------------------------------------------

const FIXTURE = `
(kicad_sch (version 20230121) (generator eeschema)
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide) (pin_names (offset 0))
      (property "Reference" "R" (at 2.032 0 90))
      (property "Value" "R" (at -2.032 0 90))
      (symbol "R_0_1"
        (rectangle (start -1.016 -2.54) (end 1.016 2.54)
          (stroke (width 0.254) (type default)) (fill (type none))))
      (symbol "R_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27)
          (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -3.81 90) (length 1.27)
          (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))))
    (symbol "power:GND" (power) (pin_names (offset 0))
      (property "Reference" "#PWR" (at 0 -6.35 0))
      (property "Value" "GND" (at 0 -3.81 0))
      (symbol "GND_1_1"
        (pin power_in line (at 0 0 270) (length 0) (name "GND") (number "1")))))
  (symbol (lib_id "Device:R") (at 100 100 0) (unit 1)
    (property "Reference" "R1" (at 102 98 0))
    (property "Value" "10k" (at 102 100 0))
    (uuid "uuid-r1"))
  (symbol (lib_id "Device:R") (at 100 120 0) (unit 1)
    (property "Reference" "R2" (at 102 118 0))
    (property "Value" "4.7k" (at 102 120 0))
    (uuid "uuid-r2"))
  (symbol (lib_id "power:GND") (at 100 130 0) (unit 1)
    (property "Reference" "#PWR01" (at 100 136.35 0))
    (property "Value" "GND" (at 100 133.81 0))
    (uuid "uuid-gnd"))
  (wire (pts (xy 100 103.81) (xy 100 116.19)) (stroke (width 0) (type default)) (uuid "w1"))
  (wire (pts (xy 100 123.81) (xy 100 130)) (stroke (width 0) (type default)) (uuid "w2"))
  (wire (pts (xy 100 110) (xy 110 110)) (stroke (width 0) (type default)) (uuid "w3"))
  (junction (at 100 110) (diameter 0) (color 0 0 0 0))
  (label "MID" (at 105 110 0) (effects (font (size 1.27 1.27))))
)`

describe('sExprParser', () => {
  it('parses nested lists, strings and numbers', () => {
    const root = parseSExpr('(a (b 1 -2.5) "he said \\"hi\\"" (c (d x)))')
    expect(root[0]).toBe('a')
    expect(child(root, 'b')).toEqual(['b', 1, -2.5])
    expect(root[2]).toBe('he said "hi"')
    expect(atoms(child(child(root, 'c'), 'd'))).toEqual(['x'])
  })

  it('handles keywords that look numeric-ish and empty lists', () => {
    const root = parseSExpr('(top (version 20230121) (flag) name-1)')
    expect(childValue(root, 'version')).toBe(20230121)
    expect(children(root, 'flag')).toHaveLength(1)
    expect(atoms(root)).toEqual(['name-1'])
  })

  it('rejects unbalanced input', () => {
    expect(() => parseSExpr('(a (b)')).toThrow()
  })
})

describe('kicadDocument', () => {
  const doc = parseKicadSch(FIXTURE)

  it('extracts templates with unit-tagged pins', () => {
    const r = doc.templates['Device:R']
    expect(r).toBeTruthy()
    expect(r.pins).toHaveLength(2)
    expect(r.pins[0]).toMatchObject({ number: '1', x: 0, y: 3.81, unit: 1 })
    expect(doc.templates['power:GND'].isPower).toBe(true)
  })

  it('extracts instances with properties', () => {
    expect(doc.instances).toHaveLength(3)
    const r1 = doc.instances.find((i) => i.reference === 'R1')
    expect(r1).toMatchObject({ libId: 'Device:R', x: 100, y: 100, angle: 0, mirror: null, value: '10k' })
  })

  it('extracts wires as segments, junctions and labels', () => {
    expect(doc.wires).toHaveLength(3)
    expect(doc.junctions).toEqual([{ x: 100, y: 110 }])
    expect(doc.labels).toEqual([{ text: 'MID', x: 105, y: 110, kind: 'local' }])
  })

  it('rejects legacy files', () => {
    expect(() => parseKicadSch('(export (version D))')).toThrow(/kicad_sch/)
  })
})

describe('instance transforms', () => {
  const pin1 = { x: 0, y: 3.81 } // resistor top pin, symbol space (Y-up)
  const closeTo = (p, x, y) => {
    expect(p.x).toBeCloseTo(x, 6)
    expect(p.y).toBeCloseTo(y, 6)
  }

  it('unrotated: symbol Y-up folds to sheet Y-down', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 0, mirror: null }, pin1.x, pin1.y), 100, 96.19)
  })

  it('90° CCW moves the top pin to the left', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 90, mirror: null }, pin1.x, pin1.y), 96.19, 100)
  })

  it('180° moves the top pin to the bottom', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 180, mirror: null }, pin1.x, pin1.y), 100, 103.81)
  })

  it('270° moves the top pin to the right', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 270, mirror: null }, pin1.x, pin1.y), 103.81, 100)
  })

  it('mirror x flips vertically in sheet space', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 0, mirror: 'x' }, pin1.x, pin1.y), 100, 103.81)
    expect(instanceMatrix(0, 'x')).toEqual([1, 0, 0, 1])
  })

  it('mirror y flips horizontally in sheet space', () => {
    closeTo(transformPoint({ x: 100, y: 100, angle: 0, mirror: 'y' }, 1.27, 3.81), 100 - 1.27, 96.19)
  })

  it('instancePins filters by unit and keeps shared unit-0 pins', () => {
    const template = {
      pins: [
        { number: '1', name: 'A', type: 'passive', x: 0, y: 2.54, unit: 1 },
        { number: '2', name: 'B', type: 'passive', x: 0, y: -2.54, unit: 2 },
        { number: '8', name: 'VCC', type: 'power_in', x: 2.54, y: 0, unit: 0 }
      ]
    }
    const pins = instancePins({ uuid: 'u', x: 0, y: 0, angle: 0, mirror: null, unit: 2 }, template)
    expect(pins.map((p) => p.number).sort()).toEqual(['2', '8'])
  })
})

describe('connectivity', () => {
  it('pointOnSegment: interior, endpoint, off-line, off-span', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(pointOnSegment({ x: 5, y: 0 }, a, b)).toBe(true)
    expect(pointOnSegment({ x: 10, y: 0 }, a, b)).toBe(true)
    expect(pointOnSegment({ x: 5, y: 0.5 }, a, b)).toBe(false)
    expect(pointOnSegment({ x: 11, y: 0 }, a, b)).toBe(false)
  })

  it('extracts the voltage divider netlist with names', () => {
    const doc = parseKicadSch(FIXTURE)
    const nets = extractNets(doc)
    const multi = nets.filter((n) => n.pins.length >= 2)
    const netOf = (ref, pin) => multi.find((n) => n.pins.some((p) => p.reference === ref && p.pin === pin))

    // R1.2 — R2.1 joined by w1; the label rides w3 which meets w1 at the junction
    const mid = netOf('R1', '2')
    expect(mid).toBeTruthy()
    expect(mid.pins.map((p) => p.reference + '.' + p.pin).sort()).toEqual(['R1.2', 'R2.1'])
    expect(mid.name).toBe('MID')

    // R2.2 — GND pin via w2, named by the power symbol
    const gnd = netOf('R2', '2')
    expect(gnd.pins).toHaveLength(2)
    expect(gnd.name).toBe('GND')

    // R1.1 floats — single-pin net only
    expect(netOf('R1', '1')).toBeUndefined()
  })

  it('unions same-name power pins without any wire between them', () => {
    const doc = parseKicadSch(FIXTURE)
    // Second GND far away, wired to nothing
    doc.instances.push({
      uuid: 'uuid-gnd2', libId: 'power:GND', x: 200, y: 200, angle: 0, mirror: null, unit: 1, reference: '#PWR02', value: 'GND'
    })
    const nets = extractNets(doc)
    const gnd = nets.find((n) => n.name === 'GND')
    expect(gnd.pins).toHaveLength(3)
  })

  it('does not join plain crossings without a junction', () => {
    const doc = {
      templates: {},
      instances: [],
      wires: [
        { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } },
        { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }
      ],
      junctions: [],
      labels: []
    }
    // Probe connectivity through two fake single-pin instances on each wire
    doc.templates.T = { libId: 'T', isPower: false, pins: [{ number: '1', name: '', type: 'passive', x: 0, y: 0, unit: 1 }] }
    doc.instances = [
      { uuid: 'a', libId: 'T', x: 0, y: 5, angle: 0, mirror: null, unit: 1, reference: 'A', value: '' },
      { uuid: 'b', libId: 'T', x: 5, y: 0, angle: 0, mirror: null, unit: 1, reference: 'B', value: '' }
    ]
    const nets = extractNets(doc)
    expect(nets.filter((n) => n.pins.length >= 2)).toHaveLength(0)
    // Now declare the junction — one net
    doc.junctions = [{ x: 5, y: 5 }]
    const nets2 = extractNets(doc)
    expect(nets2.filter((n) => n.pins.length >= 2)).toHaveLength(1)
  })
})

describe('autoWire', () => {
  beforeEach(() => {
    schematicStore.clearAll()
    schematicStore.clearHistory()
  })

  it('mstEdges chains all points with n-1 edges', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 60 }, { x: 100, y: 60 }]
    const edges = mstEdges(pts)
    expect(edges).toHaveLength(3)
    const seen = new Set([0])
    for (const [i, j] of edges) {
      expect(seen.has(i)).toBe(true)
      seen.add(j)
    }
    expect(seen.size).toBe(4)
  })

  it('routes wires that land exactly on the pins of both components', () => {
    const mkComp = (x, y) => ({
      name: 'R',
      symbol: 'R',
      x,
      y,
      width: 40,
      height: 80,
      rotation: 0,
      svgPath: '',
      compObject: {},
      properties: {},
      pins: [
        { number: '1', name: '~', type: 'passive', dx: 20, dy: 0 },
        { number: '2', name: '~', type: 'passive', dx: 20, dy: 80 }
      ]
    })
    const idA = schematicStore.addComponent(mkComp(100, 100))
    const idB = schematicStore.addComponent(mkComp(300, 300))
    const compA = schematicStore.getComponent(idA)
    const compB = schematicStore.getComponent(idB)
    const placed = new Map([['uuid-a', compA], ['uuid-b', compB]])

    const nets = [{
      name: null,
      pins: [
        { instanceUuid: 'uuid-a', reference: 'R1', pin: '2' },
        { instanceUuid: 'uuid-b', reference: 'R2', pin: '1' }
      ]
    }]
    const { wired, openNets } = autoWireNets(nets, placed)
    expect(wired).toBe(1)
    expect(openNets).toBe(0)

    const wires = schematicStore.getState().wires
    expect(wires).toHaveLength(1)
    const pts = wires[0].points
    const pinA = pinAbsolutePosition(compA, compA.pins[1])
    const pinB = pinAbsolutePosition(compB, compB.pins[0])
    const ends = [pts[0], pts[pts.length - 1]]
    expect(ends).toContainEqual({ x: pinA.x, y: pinA.y })
    expect(ends).toContainEqual({ x: pinB.x, y: pinB.y })
    // Strictly Manhattan
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i - 1].x === pts[i].x || pts[i - 1].y === pts[i].y).toBe(true)
    }
  })

  it('falls back to index order when pin numbers differ, counts open nets', () => {
    const id = schematicStore.addComponent({
      name: 'Q',
      symbol: 'Q',
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      svgPath: '',
      compObject: {},
      properties: {},
      pins: [
        { number: 'B', name: 'base', type: 'passive', dx: 0, dy: 20 },
        { number: 'C', name: 'coll', type: 'passive', dx: 40, dy: 0 }
      ]
    })
    const comp = schematicStore.getComponent(id)
    const placed = new Map([['uuid-q', comp]])
    const nets = [{
      name: null,
      pins: [
        { instanceUuid: 'uuid-q', reference: 'Q1', pin: '1' }, // → 'B' by sorted index
        { instanceUuid: 'uuid-missing', reference: 'U9', pin: '3' }
      ]
    }]
    const { wired, openNets } = autoWireNets(nets, placed)
    expect(wired).toBe(0)
    expect(openNets).toBe(1)
  })
})
