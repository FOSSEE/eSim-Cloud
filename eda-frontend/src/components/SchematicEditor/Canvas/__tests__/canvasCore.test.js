/**
 * Core-logic tests for the React SVG canvas migration:
 * geometry transforms, DSU netlist compilation, junction dots and the
 * legacy mxGraph XML round-trip.
 */

import {
  screenToCanvas, zoomAtPoint, snap, orthogonalRoute, pinAbsolutePosition, buildSpatialIndex,
  wiresAttachedToComponents, applyWireStretch, segmentAxis, simplifyPolyline,
  segIntersectsRect, pathClear, routeManhattan, componentBBox
} from '../geometry'
import { buildNetwork, compileNetlist, checkErc, DSU } from '../dsuNetlist'
import { computeJunctions, snapProbeToWire } from '../junctions'
import { toLegacyXml, fromLegacyXml } from '../LegacyMxGraphSerializer'
import { wirePointGroups } from '../../TranslationLayer/autoWire'
import { schematicStore } from '../schematicStore'

const resistor = (id, x, y) => ({
  id,
  name: 'R',
  symbol: 'R',
  x,
  y,
  width: 60,
  height: 20,
  rotation: 0,
  svgPath: 'kicad-symbols/symbol_svgs/device/R.svg',
  compObject: { name: 'R', svg_path: 'kicad-symbols/symbol_svgs/device/R.svg', symbol_prefix: 'R' },
  properties: { NAME: 'R', VALUE: '1k' },
  pins: [
    { number: '1', name: '~', type: 'Input', dx: 0, dy: 10 },
    { number: '2', name: '~', type: 'Output', dx: 60, dy: 10 }
  ]
})

const ground = (id, x, y) => ({
  id,
  name: 'GND',
  symbol: 'PWR',
  x,
  y,
  width: 20,
  height: 20,
  rotation: 0,
  svgPath: 'kicad-symbols/symbol_svgs/power/GND.svg',
  compObject: null,
  properties: { NAME: 'GND' },
  pins: [{ number: '1', name: 'GND', type: 'Input', dx: 10, dy: 0 }]
})

describe('geometry', () => {
  it('converts screen to canvas honouring pan/zoom', () => {
    const view = { s: 2, dx: 100, dy: 50 }
    expect(screenToCanvas(140, 90, view)).toEqual({ x: 20, y: 20 })
  })

  it('keeps the cursor point fixed during pointer-centred zoom', () => {
    const view = { s: 1, dx: 0, dy: 0 }
    const zoomed = zoomAtPoint(view, 200, 150, 2)
    const before = screenToCanvas(200, 150, view)
    const after = screenToCanvas(200, 150, zoomed)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(zoomed.s).toBe(2)
  })

  it('snaps to the 20px grid', () => {
    expect(snap(28)).toBe(20)
    expect(snap(31)).toBe(40)
  })

  it('routes L-shapes in both directions', () => {
    expect(orthogonalRoute({ x: 0, y: 0 }, { x: 40, y: 60 }, 'HV')).toEqual([{ x: 40, y: 0 }])
    expect(orthogonalRoute({ x: 0, y: 0 }, { x: 40, y: 60 }, 'VH')).toEqual([{ x: 0, y: 60 }])
    expect(orthogonalRoute({ x: 0, y: 0 }, { x: 40, y: 0 }, 'HV')).toEqual([])
  })

  it('rotates pin positions around the component centre', () => {
    const comp = resistor('2', 0, 0)
    comp.rotation = 90
    // centre (30,10); pin1 local (-30, 0) -> rotated (0, -30) -> abs (30, -20)
    expect(pinAbsolutePosition(comp, comp.pins[0])).toEqual({ x: 30, y: -20 })
  })

  it('finds pins in O(1) neighbourhoods via the spatial hash', () => {
    const comps = [resistor('2', 0, 0), resistor('3', 500, 500)]
    const index = buildSpatialIndex(comps, [])
    const hit = index.nearestPoint(2, 12, 20)
    expect(hit.payload.componentId).toBe('2')
    expect(index.nearestPoint(300, 300, 20)).toBeNull()
  })
})

describe('DSU netlist compiler', () => {
  it('unions with path compression', () => {
    const dsu = new DSU()
    dsu.union('a', 'b')
    dsu.union('b', 'c')
    expect(dsu.find('a')).toBe(dsu.find('c'))
    expect(dsu.find('a')).not.toBe(dsu.add('d'))
  })

  it('nets two resistors joined by a wire', () => {
    const r1 = resistor('2', 0, 0) // pins at (0,10) and (60,10)
    const r2 = resistor('3', 200, 0) // pins at (200,10) and (260,10)
    const wire = { id: '4', points: [{ x: 60, y: 10 }, { x: 200, y: 10 }] }
    const net = buildNetwork({ components: [r1, r2], wires: [wire] })
    expect(net.pinNode.get('2:2')).toBe(net.pinNode.get('3:1'))
    expect(net.pinNode.get('2:1')).not.toBe(net.pinNode.get('2:2'))
  })

  it('grounds nets touching a PWR pin as node 0', () => {
    const r1 = resistor('2', 0, 0)
    const gnd = ground('3', 50, 100) // pin at (60, 100)
    const wire = { id: '4', points: [{ x: 60, y: 10 }, { x: 60, y: 100 }] }
    const compiled = compileNetlist({ components: [r1, gnd], wires: [wire] })
    expect(compiled.main).toContain('R1')
    const line = compiled.main.trim().split('\n')[0]
    expect(line.split(/\s+/)[2]).toBe('0') // pin 2 grounded
    expect(line).toContain('1k')
  })

  it('unions T-junctions between wires', () => {
    // wireB ends on the interior of wireA
    const wireA = { id: '4', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const wireB = { id: '5', points: [{ x: 50, y: 0 }, { x: 50, y: 80 }] }
    const net = buildNetwork({ components: [], wires: [wireA, wireB] })
    expect(net.dsu.find('0,0')).toBe(net.dsu.find('50,80'))
  })

  it('runs ERC: detects unconnected pins and missing ground', () => {
    const r1 = resistor('2', 0, 0)
    const erc = checkErc({ components: [r1], wires: [] })
    expect(erc.isValid).toBe(false)
    expect(erc.pinNC).toBe(2)
    expect(erc.errorMsg).toBe('Pins not connected')
  })
})

describe('junction dots', () => {
  it('marks T junctions but not plain crossings', () => {
    const wireA = { id: '4', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const tee = { id: '5', points: [{ x: 50, y: 0 }, { x: 50, y: 80 }] }
    const crossing = { id: '6', points: [{ x: 80, y: -40 }, { x: 80, y: 40 }] }
    const junctions = computeJunctions([wireA, tee, crossing], [])
    expect(junctions).toEqual([{ x: 50, y: 0 }])
  })

  it('snaps probes onto segments within 8px only', () => {
    const wire = { id: '4', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const hit = snapProbeToWire({ x: 40, y: 6 }, [wire])
    expect(hit).toMatchObject({ x: 40, y: 0, wireId: '4' })
    expect(snapProbeToWire({ x: 40, y: 12 }, [wire])).toBeNull()
  })
})

describe('LegacyMxGraphSerializer', () => {
  it('round-trips components, wires and probes through mxGraph XML', () => {
    const doc = {
      components: [resistor('2', 20, 40)],
      wires: [{ id: '10', points: [{ x: 80, y: 50 }, { x: 140, y: 50 }, { x: 140, y: 100 }] }],
      probes: [{ id: '11', label: 'PR1', probeType: 'V', color: '#e41a1c', x: 130, y: 60 }]
    }
    const xml = toLegacyXml(doc)
    expect(xml).toContain('<mxGraphModel><root>')
    expect(xml).toContain('id="0"')
    expect(xml).toContain('id="1"')
    expect(xml).toContain('Component="1"')
    expect(xml).toContain('edge="1"')

    const back = fromLegacyXml(xml)
    expect(back.components).toHaveLength(1)
    expect(back.components[0]).toMatchObject({ id: '2', symbol: 'R', x: 20, y: 40, width: 60, height: 20 })
    expect(back.components[0].pins).toHaveLength(2)
    expect(back.components[0].properties.VALUE).toBe('1k')
    expect(back.wires).toHaveLength(1)
    // wire starts on R pin 2 (80, 50), keeps its corner and end
    expect(back.wires[0].points[0]).toEqual({ x: 80, y: 50 })
    expect(back.wires[0].points[back.wires[0].points.length - 1]).toEqual({ x: 140, y: 100 })
    expect(back.probes).toHaveLength(1)
    expect(back.probes[0]).toMatchObject({ label: 'PR1', probeType: 'V', x: 130, y: 60 })
  })

  it('keeps electrical connectivity across the round-trip', () => {
    const doc = {
      components: [resistor('2', 0, 0), ground('3', 50, 100)],
      wires: [{ id: '4', points: [{ x: 60, y: 10 }, { x: 60, y: 100 }] }],
      probes: []
    }
    const back = fromLegacyXml(toLegacyXml(doc))
    const net = buildNetwork(back)
    expect(net.pinNode.get('2:2')).toBe('0')
  })

  it('round-trips rotated components without moving their pins', () => {
    const comp = resistor('2', 20, 40)
    comp.rotation = 90
    const before = comp.pins.map((p) => pinAbsolutePosition(comp, p))
    const back = fromLegacyXml(toLegacyXml({ components: [comp], wires: [], probes: [] }))
    const after = back.components[0].pins.map((p) => pinAbsolutePosition(back.components[0], p))
    expect(after).toEqual(before)
  })
})

describe('legacy old-editor import', () => {
  // Old-editor saves: pin cells carry NO parent attribute and their offsets
  // already include the component rotation; edges usually have no waypoints.
  const base = '<mxCell id="0" Component="0" Pin="0"><Object as="properties"/></mxCell>' +
    '<mxCell id="1" Component="0" Pin="0"><Object as="properties"/></mxCell>'

  const oldComp = (id, x, y, w, h, rot) =>
    `<mxCell id="${id}" value="R${id}" style="shape=image;image=../r.svg;rotation=${rot}" vertex="1" symbol="R" Component="1" CellType="Component" Pin="0">` +
    `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>` +
    '<Object PREFIX="R1" NAME="R" as="properties"/></mxCell>'

  const oldPin = (id, dx, dy) =>
    `<mxCell id="${id}" value="1" style="align=right;rotation=0" vertex="1" Pin="1" Component="0">` +
    `<mxGeometry x="${dx}" y="${dy}" width="0.5" height="0.5" as="geometry"/></mxCell>`

  const oldEdge = (id, sv, tv, targetPoint) =>
    `<mxCell id="${id}" edge="1" sourceVertex="${sv}" targetVertex="${tv}" Component="0" Pin="0">` +
    '<mxGeometry relative="1" as="geometry">' +
    (targetPoint ? `<mxPoint x="${targetPoint.x}" y="${targetPoint.y}" as="targetPoint"/>` : '') +
    '<Array as="points"/></mxGeometry><Array as="PointsArray"/></mxCell>'

  const wrap = (inner) => `<mxGraphModel><root>${base}${inner}</root></mxGraphModel>`

  const expectManhattan = (points) => {
    for (let i = 1; i < points.length; i++) {
      expect(segmentAxis(points[i - 1], points[i])).not.toBeNull()
    }
  }

  it('un-rotates baked pin offsets so pins land where the old editor drew them', () => {
    // 100x100 comp rotated 90; old editor stored the on-screen offsets
    // (100,50) and (1,50) — the style rotation only turned the image.
    const xml = wrap(
      oldComp('2', 300, 200, 100, 100, 90) +
      oldPin('3', 100, 50) + oldPin('4', 1, 50)
    )
    const doc = fromLegacyXml(xml)
    const comp = doc.components[0]
    expect(comp.rotation).toBe(90)
    expect(pinAbsolutePosition(comp, comp.pins[0])).toEqual({ x: 400, y: 250 })
    expect(pinAbsolutePosition(comp, comp.pins[1])).toEqual({ x: 301, y: 250 })
  })

  it('rescales rotated non-square pins onto the lead tips of the rotated artwork', () => {
    // Real Wheatstone Bridge numbers: 58.5x100 vertical resistor rotated 90,
    // old editor re-seated pins on the unrotated border at (58,50)/(0,50) —
    // 20.75px short of the rotated symbol's lead tips at centre +-50.
    const xml = wrap(
      oldComp('2', 440, 180, 58.5, 100, 90) +
      oldPin('3', 58, 50) + oldPin('4', 0, 50)
    )
    const doc = fromLegacyXml(xml)
    const comp = doc.components[0]
    const p0 = pinAbsolutePosition(comp, comp.pins[0])
    const p1 = pinAbsolutePosition(comp, comp.pins[1])
    // centre (469.25, 230); lead tips at x = centre +- h/2
    expect(p1.x).toBeCloseTo(419.25, 5)
    expect(p1.y).toBeCloseTo(230, 5)
    expect(p0.x).toBeCloseTo(469.25 + 28.75 * (100 / 58.5), 5) // ~518.4, stored dx=58 of 58.5
    expect(p0.y).toBeCloseTo(230, 5)
  })

  it('keeps truly-rotated baked offsets that already sit on the lead tips', () => {
    // Real "Resistive Divider, AC input" numbers: 16x100 resistor rotated 90
    // whose baked offsets (58,50)/(-41,50) are a genuine centre rotation —
    // they land outside the unrotated box, on the rotated lead tips. No
    // rescale: absolute positions must equal the stored screen positions.
    const xml = wrap(
      oldComp('2', 260, 140, 16, 100, 90) +
      oldPin('3', 58, 50) + oldPin('4', -41, 50)
    )
    const doc = fromLegacyXml(xml)
    const comp = doc.components[0]
    expect(pinAbsolutePosition(comp, comp.pins[0])).toEqual({ x: 318, y: 190 })
    expect(pinAbsolutePosition(comp, comp.pins[1])).toEqual({ x: 219, y: 190 })
  })

  it('discards old wire geometry and extracts per-net pin groups instead', () => {
    const xml = wrap(
      oldComp('2', 0, 80, 60, 40, 0) + oldPin('3', 60, 20) +
      oldComp('4', 300, 80, 60, 40, 0) + oldPin('5', 0, 20) +
      oldComp('6', 150, 60, 60, 80, 0) + oldPin('7', 30, 0) +
      oldEdge('8', '3', '5')
    )
    const doc = fromLegacyXml(xml)
    expect(doc.wires).toHaveLength(0)
    // pins 3 and 5 form the only net; the blocker's pin 7 is unconnected
    expect(doc.legacyNetGroups).toEqual([[{ x: 60, y: 100 }, { x: 300, y: 100 }]])
  })

  it('redraws nets with the editor router, avoiding component bodies', () => {
    const xml = wrap(
      oldComp('2', 0, 80, 60, 40, 0) + oldPin('3', 60, 20) +
      oldComp('4', 300, 80, 60, 40, 0) + oldPin('5', 0, 20) +
      oldComp('6', 150, 60, 60, 80, 0) + oldPin('7', 30, 0) +
      oldEdge('8', '3', '5')
    )
    const doc = fromLegacyXml(xml)
    schematicStore.loadDocument(doc, { undoable: false })
    wirePointGroups(doc.legacyNetGroups)
    const state = schematicStore.getState()
    expect(state.wires).toHaveLength(1)
    const wire = state.wires[0]
    const ends = [wire.points[0], wire.points[wire.points.length - 1]]
    expect(ends).toContainEqual({ x: 60, y: 100 })
    expect(ends).toContainEqual({ x: 300, y: 100 })
    expectManhattan(wire.points)
    expect(pathClear(wire.points, state.components.map(componentBBox))).toBe(true)
  })

  it('keeps wire-on-wire junction connectivity via edge-to-edge references', () => {
    const xml = wrap(
      oldComp('2', 480, 0, 40, 20, 0) + oldPin('3', 20, 20) +
      oldComp('4', 480, 200, 40, 20, 0) + oldPin('5', 20, 0) +
      oldComp('6', 380, 90, 40, 20, 0) + oldPin('7', 40, 10) +
      oldEdge('8', '3', '5') +
      // terminates on wire 8; stored coordinate drifted 10px off its path
      oldEdge('9', '7', '8', { x: 510, y: 105 })
    )
    const doc = fromLegacyXml(xml)
    // one net spanning all three pins, geometry of edge 9's stale point ignored
    expect(doc.legacyNetGroups).toHaveLength(1)
    expect(doc.legacyNetGroups[0]).toHaveLength(3)
    schematicStore.loadDocument(doc, { undoable: false })
    wirePointGroups(doc.legacyNetGroups)
    const state = schematicStore.getState()
    for (const wire of state.wires) expectManhattan(wire.points)
    const net = buildNetwork(state)
    expect(net.pinNode.get('2:1')).toBe(net.pinNode.get('6:1'))
    expect(net.pinNode.get('2:1')).toBe(net.pinNode.get('4:1'))
  })

  it('snaps reference-less terminals to the nearest pin by coordinate', () => {
    // edge with no resolvable targetVertex, stored point 6px off pin 5
    const xml = wrap(
      oldComp('2', 0, 80, 60, 40, 0) + oldPin('3', 60, 20) +
      oldComp('4', 300, 80, 60, 40, 0) + oldPin('5', 0, 20) +
      `<mxCell id="8" edge="1" sourceVertex="3" targetVertex="0" Component="0" Pin="0">` +
      '<mxGeometry relative="1" as="geometry">' +
      '<mxPoint x="306" y="104" as="targetPoint"/>' +
      '</mxGeometry></mxCell>'
    )
    const doc = fromLegacyXml(xml)
    expect(doc.legacyNetGroups).toEqual([[{ x: 60, y: 100 }, { x: 300, y: 100 }]])
  })
})

describe('wire rubber-banding on component drag', () => {
  // r1 pins (0,10) (60,10); r2 pins (200,10) (260,10); wire joins the inner pins
  const r1 = () => resistor('2', 0, 0)
  const r2 = () => resistor('3', 200, 0)
  const link = () => ({ id: '4', points: [{ x: 60, y: 10 }, { x: 200, y: 10 }] })

  const load = () => schematicStore.loadDocument({ components: [r1(), r2()], wires: [link()] })
  const wire = () => schematicStore.getState().wires[0]

  /** Every segment must be axis-aligned: no diagonals, ever. */
  const expectManhattan = (points) => {
    for (let i = 1; i < points.length; i++) {
      expect(segmentAxis(points[i - 1], points[i])).not.toBeNull()
    }
  }

  it('classifies one moving component as a stretch of the attached end only', () => {
    const attached = wiresAttachedToComponents([r1(), r2()], [link()], new Set(['2']))
    expect(attached).toHaveLength(1)
    expect(attached[0].mode).toBe('stretch')
    expect([...attached[0].indices]).toEqual([0]) // only the pin-2 end of r1
  })

  it('classifies both moving components as a whole-wire translate', () => {
    const attached = wiresAttachedToComponents([r1(), r2()], [link()], new Set(['2', '3']))
    expect(attached[0].mode).toBe('translate')
  })

  it('ignores wires that touch no moving pin', () => {
    const stray = { id: '5', points: [{ x: 500, y: 500 }, { x: 600, y: 500 }] }
    expect(wiresAttachedToComponents([r1()], [stray], new Set(['2']))).toEqual([])
  })

  it('skips wires that are themselves being dragged', () => {
    expect(wiresAttachedToComponents([r1()], [link()], new Set(['2', '4']))).toEqual([])
  })

  it('simplifies duplicate and colinear vertices without moving coordinates', () => {
    expect(simplifyPolyline([
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 30 }
    ])).toEqual([{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 30 }])
  })

  it('reports segment axes and rejects diagonals', () => {
    expect(segmentAxis({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe('H')
    expect(segmentAxis({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe('V')
    expect(segmentAxis({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeNull()
  })

  it('leaves the source wire untouched (pure)', () => {
    const w = link()
    const attached = wiresAttachedToComponents([r1()], [w], new Set(['2']))
    applyWireStretch(attached, 0, 40)
    expect(w.points[0]).toEqual({ x: 60, y: 10 })
  })

  it('bends the wire at 90 degrees when one component moves off-axis', () => {
    load()
    schematicStore.moveCells(['2'], 0, 40)
    // Vertical stub at the dragged pin, then the original horizontal run.
    expect(wire().points).toEqual([{ x: 60, y: 50 }, { x: 60, y: 10 }, { x: 200, y: 10 }])
    expectManhattan(wire().points)
    const net = buildNetwork(schematicStore.getState())
    expect(net.pinNode.get('2:2')).toBe(net.pinNode.get('3:1'))
  })

  it('just shortens the wire when the move stays on the segment axis', () => {
    load()
    schematicStore.moveCells(['2'], 40, 0) // slide r1 right along the wire
    expect(wire().points).toEqual([{ x: 100, y: 10 }, { x: 200, y: 10 }])
    expectManhattan(wire().points)
  })

  it('bends a vertical wire without cutting through the moved body', () => {
    const gnd = ground('3', 50, 100) // pin at (60, 100)
    schematicStore.loadDocument({
      components: [r1(), gnd],
      wires: [{ id: '4', points: [{ x: 60, y: 10 }, { x: 60, y: 100 }] }]
    })
    schematicStore.moveCells(['2'], 40, 0)
    // The horizontal stub back to x=60 would run through r1's own body
    // (now at 40..100 x 0..20), so the elbow flips to drop down first.
    expect(wire().points).toEqual([{ x: 100, y: 10 }, { x: 100, y: 100 }, { x: 60, y: 100 }])
    expectManhattan(wire().points)
    expect(pathClear(wire().points, [componentBBox(schematicStore.getComponent('2'))])).toBe(true)
  })

  it('translates the wire when both components move, keeping its shape', () => {
    load()
    schematicStore.moveCells(['2', '3'], 0, 40)
    expect(wire().points).toEqual([{ x: 60, y: 50 }, { x: 200, y: 50 }])
    expectManhattan(wire().points)
    const net = buildNetwork(schematicStore.getState())
    expect(net.pinNode.get('2:2')).toBe(net.pinNode.get('3:1'))
  })

  it('keeps interior bends put while a single end follows its pin', () => {
    schematicStore.loadDocument({
      components: [r1(), r2()],
      wires: [{ id: '4', points: [{ x: 60, y: 10 }, { x: 130, y: 10 }, { x: 130, y: 80 }, { x: 200, y: 80 }] }]
    })
    schematicStore.moveCells(['2'], 0, 40)
    expect(wire().points).toEqual([
      { x: 60, y: 50 }, { x: 60, y: 10 }, { x: 130, y: 10 }, { x: 130, y: 80 }, { x: 200, y: 80 }
    ])
    expectManhattan(wire().points)
  })

  it('stays Manhattan for every diagonal drag delta', () => {
    for (const [dx, dy] of [[20, 40], [-60, 20], [40, -80], [-20, -20], [0, 60], [80, 0]]) {
      schematicStore.loadDocument({
        components: [r1(), r2()],
        wires: [{ id: '4', points: [{ x: 60, y: 10 }, { x: 130, y: 10 }, { x: 130, y: 80 }, { x: 200, y: 80 }] }]
      })
      schematicStore.moveCells(['2'], dx, dy)
      expectManhattan(wire().points)
      // The dragged pin still owns the wire end.
      expect(wire().points[0]).toEqual({ x: 60 + dx, y: 10 + dy })
    }
  })

  it('does not leave a zero-length stub when the elbow lands on the moved end', () => {
    load()
    schematicStore.moveCells(['2'], 0, 40)
    const pts = wire().points
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]).not.toEqual(pts[i - 1])
    }
  })

  it('stays connected across a move when the drag is undone', () => {
    load()
    schematicStore.moveCells(['2'], 0, 40)
    schematicStore.undo()
    expect(wire().points).toEqual([{ x: 60, y: 10 }, { x: 200, y: 10 }])
  })
})

describe('endpoint welding onto off-grid pins', () => {
  // Component parked off-grid: pins land at (3, 17) and (63, 17)
  const oddR = () => ({ ...resistor('2', 3, 7), pins: resistor('2', 3, 7).pins })

  it('welds wire ends dropped near off-grid pins onto their exact coordinates', () => {
    // Second component also off-grid: pin 1 at (203, 17)
    const oddR2 = { ...resistor('3', 203, 7) }
    schematicStore.loadDocument({ components: [oddR(), oddR2], wires: [] })
    // Raw clicks a few px off each pin; grid snap alone would give (60,20)/(200,20)
    schematicStore.addWire([{ x: 65, y: 15 }, { x: 201, y: 15 }])
    const w = schematicStore.getState().wires[0]
    expect(w.points[0]).toEqual({ x: 63, y: 17 })
    expect(w.points[w.points.length - 1]).toEqual({ x: 203, y: 17 })
    const net = buildNetwork(schematicStore.getState())
    expect(net.pinNode.get('2:2')).toBe(net.pinNode.get('3:1'))
  })

  it('keeps the welded wire strictly Manhattan via an inserted elbow', () => {
    schematicStore.loadDocument({ components: [oddR()], wires: [] })
    schematicStore.addWire([{ x: 65, y: 15 }, { x: 200, y: 15 }])
    const pts = schematicStore.getState().wires[0].points
    for (let i = 1; i < pts.length; i++) {
      expect(segmentAxis(pts[i - 1], pts[i])).not.toBeNull()
    }
  })

  it('leaves far-away endpoints grid-snapped', () => {
    schematicStore.loadDocument({ components: [oddR()], wires: [] })
    schematicStore.addWire([{ x: 158, y: 101 }, { x: 300, y: 101 }])
    expect(schematicStore.getState().wires[0].points).toEqual([
      { x: 160, y: 100 }, { x: 300, y: 100 }
    ])
  })

  it('keeps a stretched wire glued to an off-grid pin across a move', () => {
    schematicStore.loadDocument({ components: [oddR()], wires: [] })
    schematicStore.addWire([{ x: 65, y: 15 }, { x: 200, y: 20 }])
    schematicStore.moveCells(['2'], 0, 40)
    const comp = schematicStore.getComponent('2')
    const pin2 = pinAbsolutePosition(comp, comp.pins[1])
    expect(schematicStore.getState().wires[0].points[0]).toEqual({ x: pin2.x, y: pin2.y })
  })
})

describe('component obstacle avoidance', () => {
  const box = { x: 100, y: 0, width: 60, height: 40 }

  it('detects segments crossing a rect body but not edge touches', () => {
    expect(segIntersectsRect({ x: 80, y: 20 }, { x: 200, y: 20 }, box)).toBe(true)
    expect(segIntersectsRect({ x: 80, y: 80 }, { x: 200, y: 80 }, box)).toBe(false)
    // Riding the outline exactly is allowed (pins sit on it)
    expect(segIntersectsRect({ x: 80, y: 0 }, { x: 200, y: 0 }, box)).toBe(false)
  })

  it('flips the L direction to route around a component', () => {
    // HV from (80,20) to (200,60) would cross the box at y=20
    const corners = routeManhattan({ x: 80, y: 20 }, { x: 200, y: 60 }, 'HV', [box])
    expect(corners).toEqual([{ x: 80, y: 60 }]) // VH instead
    expect(pathClear([{ x: 80, y: 20 }, ...corners, { x: 200, y: 60 }], [box])).toBe(true)
  })

  it('takes a Z detour when both L orientations collide', () => {
    const wall = { x: 100, y: -100, width: 60, height: 300 }
    const from = { x: 80, y: 20 }
    const to = { x: 200, y: 60 }
    const corners = routeManhattan(from, to, 'HV', [wall])
    const path = [from, ...corners, to]
    expect(pathClear(path, [wall])).toBe(true)
    for (let i = 1; i < path.length; i++) {
      expect(segmentAxis(path[i - 1], path[i])).not.toBeNull()
    }
  })

  it('still returns a route when no clear path exists', () => {
    const cage = { x: -1000, y: -1000, width: 2000, height: 2000 }
    expect(routeManhattan({ x: 0, y: 0 }, { x: 40, y: 60 }, 'HV', [cage]))
      .toEqual([{ x: 40, y: 0 }])
  })

  it('drag stretch elbow dodges a component in its way', () => {
    // r3 sits right where the default vertical stub (x=60, y 10..90) would run
    const r3 = { ...resistor('5', 30, 30), id: '5' } // bbox (30,30,60,20)
    schematicStore.loadDocument({
      components: [resistor('2', 0, 0), resistor('3', 200, 0), r3],
      wires: [{ id: '4', points: [{ x: 60, y: 10 }, { x: 200, y: 10 }] }]
    })
    schematicStore.moveCells(['2'], 0, 80)
    const pts = schematicStore.getState().wires[0].points
    expect(pts[0]).toEqual({ x: 60, y: 90 }) // still on the dragged pin
    expect(pathClear(pts, [componentBBox(r3)])).toBe(true)
    for (let i = 1; i < pts.length; i++) {
      expect(segmentAxis(pts[i - 1], pts[i])).not.toBeNull()
    }
  })
})
