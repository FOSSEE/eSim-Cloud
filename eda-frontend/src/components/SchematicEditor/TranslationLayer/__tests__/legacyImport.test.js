/**
 * legacyImport.test.js — legacy KiCad v4/v5 (.sch) import pipeline.
 *
 * Fixture is the RC example from Examples/RC/RC.sch (trimmed header), the
 * exact file that used to import with a missing R (rescue-suffix name),
 * missing plot components (underscore split) and stub wires off the pins.
 *
 * Run: CI=true NODE_OPTIONS=--openssl-legacy-provider npx react-scripts test \
 *        --watchAll=false --testPathPattern=legacyImport
 */

import { readKicadSchematic, normalizeLegacyName } from '../../Helper/KiCadFileUtils'
import { extractLegacyNets } from '../legacyNets'
import { wirePointGroups } from '../autoWire'
import { schematicStore } from '../../Canvas/schematicStore'
import { compileNetlist } from '../../Canvas/dsuNetlist'

const RC_SCH = `EESchema Schematic File Version 2
LIBS:RC-rescue
LIBS:eSim_Sources
EELAYER 25 0
EELAYER END
$Descr A4 11693 8268
encoding utf-8
Sheet 1 1
Title ""
$EndDescr
$Comp
L R-RESCUE-RC R1
U 1 1 56B86791
P 5750 3050
F 0 "R1" H 5800 3180 50  0000 C CNN
F 1 "1k" H 5800 3100 50  0000 C CNN
\t1    5750 3050
\t1    0    0    -1
$EndComp
$Comp
L C C1
U 1 1 56B8686C
P 6350 3250
F 0 "C1" H 6375 3350 50  0000 L CNN
F 1 "10u" H 6375 3150 50  0000 L CNN
\t1    6350 3250
\t1    0    0    -1
$EndComp
$Comp
L pwl v1
U 1 1 56B868AD
P 5250 3450
F 0 "v1" H 5050 3550 60  0000 C CNN
F 1 "pwl" H 5000 3400 60  0000 C CNN
\t1    5250 3450
\t1    0    0    -1
$EndComp
Wire Wire Line
\t5250 3000 5650 3000
Wire Wire Line
\t5950 3000 6350 3000
Wire Wire Line
\t6350 2800 6350 3100
Wire Wire Line
\t5250 3900 6350 3900
Wire Wire Line
\t6350 3900 6350 3400
$Comp
L GND #PWR01
U 1 1 56B8692D
P 5800 4000
F 0 "#PWR01" H 5800 3750 50  0001 C CNN
F 1 "GND" H 5800 3850 50  0000 C CNN
\t1    5800 4000
\t1    0    0    -1
$EndComp
Wire Wire Line
\t5800 4000 5800 3900
Connection ~ 5800 3900
Text GLabel 5200 2800 0    60   Input ~ 0
in
Text GLabel 6400 2850 2    60   Input ~ 0
out
Wire Wire Line
\t5350 2750 5350 3000
Connection ~ 5350 3000
Wire Wire Line
\t6400 2850 6350 2850
Connection ~ 6350 3000
Wire Wire Line
\t5200 2800 5350 2800
$Comp
L plot_v1 U1
U 1 1 56D46C33
P 5350 2950
F 0 "U1" H 5350 3450 60  0000 C CNN
F 1 "plot_v1" H 5550 3300 60  0000 C CNN
\t1    5350 2950
\t1    0    0    -1
$EndComp
$Comp
L plot_v1 U2
U 1 1 56D46CCE
P 6350 3000
F 0 "U2" H 6350 3500 60  0000 C CNN
F 1 "plot_v1" H 6550 3350 60  0000 C CNN
\t1    6350 3000
\t1    0    0    -1
$EndComp
Connection ~ 5350 2800
Connection ~ 6350 2850
$EndSCHEMATC
`

describe('normalizeLegacyName', () => {
  it('strips KiCad rescue suffixes', () => {
    expect(normalizeLegacyName('R-RESCUE-RC')).toBe('r')
    expect(normalizeLegacyName('C-rescue-MySheet')).toBe('c')
  })

  it('keeps underscores intact (plot_v1 is one library name)', () => {
    expect(normalizeLegacyName('plot_v1')).toBe('plot_v1')
  })
})

describe('readKicadSchematic (RC.sch)', () => {
  const instr = readKicadSchematic(RC_SCH)

  it('parses all six components with normalised names and references', () => {
    expect(instr.components).toHaveLength(6)
    expect(instr.components.map((c) => c.componentName)).toEqual(
      ['r', 'c', 'pwl', 'gnd', 'plot_v1', 'plot_v1'])
    expect(instr.components.map((c) => c.reference)).toEqual(
      ['R1', 'C1', 'v1', '#PWR01', 'U1', 'U2'])
    // centre position scaled by 1/5
    expect(instr.components[0]).toMatchObject({ x: 1150, y: 610, rotation: 0 })
  })

  it('parses wires, junctions and global labels at 1/5 scale', () => {
    expect(instr.wires).toHaveLength(9)
    expect(instr.wires[0]).toEqual({ startx: 1050, starty: 600, endx: 1130, endy: 600 })
    expect(instr.connections).toHaveLength(5)
    expect(instr.connections[0]).toEqual({ x: 1160, y: 780 })
    expect(instr.labels).toEqual([
      { kind: 'GLabel', x: 1040, y: 560, text: 'in' },
      { kind: 'GLabel', x: 1280, y: 570, text: 'out' }
    ])
  })
})

describe('extractLegacyNets (RC.sch topology)', () => {
  const instr = readKicadSchematic(RC_SCH)
  const segments = instr.wires.map((w) => ({
    a: { x: w.startx, y: w.starty },
    b: { x: w.endx, y: w.endy }
  }))

  // Placed library pins — deliberately offset from the original wire ends,
  // the way real library symbols land. R is the hard case seen in practice:
  // the KiCad symbol is horizontal (wires end left/right of centre) but the
  // library symbol is vertical, so BOTH pins are nearest to the 'in' wire —
  // naive nearest-wire matching would short them onto the same net.
  const pins = [
    { x: 1050, y: 612, componentId: 'v1', pin: '+' }, // 12 below wire end
    { x: 1050, y: 768, componentId: 'v1', pin: '-' }, // 12 above bottom rail
    { x: 1150, y: 570, componentId: 'r1', pin: '1' }, // in: d=36, out: d=50
    { x: 1150, y: 650, componentId: 'r1', pin: '2' }, // in: d=54, out: d=64
    { x: 1270, y: 628, componentId: 'c1', pin: '1' },
    { x: 1270, y: 692, componentId: 'c1', pin: '2' },
    { x: 1160, y: 812, componentId: 'gnd', pin: '1' },
    { x: 1070, y: 562, componentId: 'u1', pin: '1' },
    { x: 1262, y: 596, componentId: 'u2', pin: '1' }
  ]

  const nets = extractLegacyNets({
    segments,
    junctions: instr.connections,
    labels: instr.labels,
    pins
  })

  const byName = (name) => nets.find((n) => n.name === name)
  const ids = (net) => net.points.map((p) => p.componentId + '.' + p.pin).sort()

  it('reconstructs the three RC nets with label names', () => {
    expect(nets).toHaveLength(3)
    expect(ids(byName('in'))).toEqual(['r1.1', 'u1.1', 'v1.+'])
    expect(ids(byName('out'))).toEqual(['c1.1', 'r1.2', 'u2.1'])
    const gnd = nets.find((n) => n.name === null)
    expect(ids(gnd)).toEqual(['c1.2', 'gnd.1', 'v1.-'])
  })

  it('drops pins beyond the tolerance instead of guessing', () => {
    const far = extractLegacyNets({
      segments,
      junctions: instr.connections,
      labels: [],
      pins: [{ x: 500, y: 100, componentId: 'x', pin: '1' }]
    })
    expect(far).toHaveLength(0)
  })

  it('lets leftover pins share a net when nothing else is in range (shorts)', () => {
    // One wire only; both pins of the component can only reach that net.
    const shorted = extractLegacyNets({
      segments: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }],
      pins: [
        { x: 20, y: 10, componentId: 'r1', pin: '1' },
        { x: 80, y: 10, componentId: 'r1', pin: '2' }
      ]
    })
    expect(shorted).toHaveLength(1)
    expect(shorted[0].points).toHaveLength(2)
  })
})

describe('wirePointGroups', () => {
  beforeEach(() => {
    schematicStore.clearAll()
    schematicStore.clearHistory()
  })

  it('wires a 3-point net with 2 Manhattan wires ending on the points', () => {
    const group = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 260 }
    ]
    const wired = wirePointGroups([group])
    expect(wired).toBe(2)
    const wires = schematicStore.getState().wires
    expect(wires).toHaveLength(2)
    const endpoints = wires.flatMap((w) => [w.points[0], w.points[w.points.length - 1]])
    for (const p of group) {
      expect(endpoints).toContainEqual(p)
    }
    for (const w of wires) {
      for (let i = 1; i < w.points.length; i++) {
        expect(w.points[i - 1].x === w.points[i].x || w.points[i - 1].y === w.points[i].y).toBe(true)
      }
    }
  })

  it('skips single-point and empty groups', () => {
    expect(wirePointGroups([[], [{ x: 0, y: 0 }]])).toBe(0)
    expect(schematicStore.getState().wires).toHaveLength(0)
  })
})

describe('netlist compilation of virtual symbols', () => {
  it('never emits PWR_FLAG (FLG) — a bare FLG line segfaults ngspice', () => {
    const doc = {
      components: [
        {
          id: '10',
          name: 'R',
          symbol: 'R',
          x: 0,
          y: 0,
          width: 40,
          height: 40,
          rotation: 0,
          properties: { VALUE: '1k' },
          pins: [
            { number: '1', name: '~', type: 'passive', dx: 0, dy: 20 },
            { number: '2', name: '~', type: 'passive', dx: 40, dy: 20 }
          ]
        },
        {
          id: '11',
          name: 'PWR_FLAG',
          symbol: 'FLG',
          x: 100,
          y: 0,
          width: 20,
          height: 20,
          rotation: 0,
          properties: {},
          pins: [{ number: '1', name: 'pwr', type: 'power_in', dx: 0, dy: 20 }]
        }
      ],
      wires: [{ id: '20', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }] }]
    }
    const compiled = compileNetlist(doc)
    expect(compiled.main).toContain('R1')
    expect(compiled.main).not.toContain('FLG')
    expect(compiled.componentlist).not.toContain('FLG1')
  })
})
