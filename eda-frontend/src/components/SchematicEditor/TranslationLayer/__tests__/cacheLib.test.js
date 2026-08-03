/**
 * cacheLib.test.js — exact-pin legacy import via the -cache.lib.
 *
 * Fixtures are the real Half_Adder example (Examples/Half_Adder), the
 * schematic that exposed every weakness of proximity-only import: a custom
 * subcircuit (half_adder) and plot probes missing from the library, DC
 * sources under rescue names, rotated/mirrored instances, and two resistors
 * close enough to overlap when placed.
 *
 * Run: CI=true NODE_OPTIONS=--openssl-legacy-provider npx react-scripts test \
 *        --watchAll=false --testPathPattern=cacheLib
 */

import fs from 'fs'
import path from 'path'
import { readKicadSchematic, placeholderProperties } from '../../Helper/KiCadFileUtils'
import { adjustModelPolarity } from '../../Helper/SvgParser'
import { parseLegacyLib, legacyPinPosition, buildPlaceholder } from '../legacyLib'
import { extractLegacyNets } from '../legacyNets'

const read = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')
const SCH = read('Half_Adder.sch')
const LIB = read('Half_Adder-cache.lib')

describe('parseLegacyLib', () => {
  const defs = parseLegacyLib(LIB)

  it('parses every DEF, stripping the hidden-reference ~ prefix', () => {
    expect(defs.get('GND-RESCUE-Half_Adder')).toBeTruthy() // was DEF ~GND-...
    expect(defs.get('half_adder')).toBeTruthy()
    expect(defs.get('adc_bridge_2')).toBeTruthy()
    expect(defs.get('plot_v1')).toBeTruthy()
    expect(defs.get('DC-RESCUE-Half_Adder')).toBeTruthy()
  })

  it('reads pins with names, numbers (~ allowed) and Y-up mil coordinates', () => {
    const ha = defs.get('half_adder')
    expect(ha.pins.map((p) => p.number)).toEqual(['1', '2', '3', '4'])
    expect(ha.pins[0]).toMatchObject({ name: 'IN1', x: 300, y: 700 })
    const plot = defs.get('plot_v1')
    expect(plot.pins).toEqual([
      { name: '~', number: '~', x: 0, y: 200, length: 200, dir: 'U' }
    ])
    expect(defs.get('DC-RESCUE-Half_Adder').pins.map((p) => p.number)).toEqual(['1', '2'])
  })

  it('computes the drawing bbox from S/C/P items and pins', () => {
    const ha = defs.get('half_adder')
    expect(ha.bbox).toEqual({ minX: 300, minY: 0, maxX: 1450, maxY: 800 })
    expect(defs.get('half_adder').reference).toBe('X')
  })
})

describe('legacyPinPosition (exact original pin coordinates)', () => {
  const defs = parseLegacyLib(LIB)
  const instr = readKicadSchematic(SCH)
  const byRef = (ref) => instr.components.find((c) => c.reference === ref)

  it('identity placement: half_adder X1 pins land on the wire ends', () => {
    const x1 = byRef('X1')
    expect(x1.matrix).toEqual([1, 0, 0, -1])
    const pins = defs.get('half_adder').pins
    expect(legacyPinPosition(x1, pins[0])).toEqual({ x: 1060, y: 640 }) // IN1 = (5300,3200)/5
    expect(legacyPinPosition(x1, pins[3])).toEqual({ x: 1290, y: 760 }) // COUT = (6450,3800)/5
  })

  it('rotated placement: DC source v1 (matrix 0 1 1 0)', () => {
    const v1 = byRef('v1')
    expect(v1.matrix).toEqual([0, 1, 1, 0])
    const pins = defs.get('DC-RESCUE-Half_Adder').pins
    expect(legacyPinPosition(v1, pins[0])).toEqual({ x: 780, y: 630 }) // + = (3900,3150)/5
    expect(legacyPinPosition(v1, pins[1])).toEqual({ x: 600, y: 630 }) // − = (3000,3150)/5
  })

  it('mirrored placement: plot U4 (matrix -1 0 0 1)', () => {
    const u4 = byRef('U4')
    expect(u4.matrix).toEqual([-1, 0, 0, 1])
    const pin = defs.get('plot_v1').pins[0]
    expect(legacyPinPosition(u4, pin)).toEqual({ x: 780, y: 790 }) // (3900,3950)/5
  })
})

describe('buildPlaceholder', () => {
  const defs = parseLegacyLib(LIB)
  const instr = readKicadSchematic(SCH)
  const x1 = instr.components.find((c) => c.reference === 'X1')
  const ph = buildPlaceholder(x1, defs.get('half_adder'))

  it('bakes the transform into exact pin offsets', () => {
    expect(ph.width).toBe(230)
    expect(ph.height).toBe(160)
    // absolute pin = top-left + (dx, dy) must equal the original sheet position
    const in1 = ph.pins.find((p) => p.name === 'IN1')
    expect({ x: ph.x + in1.dx, y: ph.y + in1.dy }).toEqual({ x: 1060, y: 640 })
    const cout = ph.pins.find((p) => p.name === 'COUT')
    expect({ x: ph.x + cout.dx, y: ph.y + cout.dy }).toEqual({ x: 1290, y: 760 })
  })

  it('renders as a self-contained data URI (no library svg needed)', () => {
    expect(ph.svgPath.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodeURIComponent(ph.svgPath)).toContain('half_adder')
  })
})

describe('placeholder simulation properties', () => {
  it('a placeholder BJT carries a model card with the right polarity', () => {
    // eSim_NPN def (reference Q) — a modelless "Q1 c b e" line stops ngspice
    const def = { name: 'eSim_NPN', reference: 'Q', pins: [], bbox: {} }
    const props = placeholderProperties(def, 'Q1')
    expect(props.MODEL).toBe('.model mybjt NPN')
    expect(props.NAME).toBe('Q1')
    expect(props.MULTIPLICITY_PARAMETER).toBeDefined()
  })

  it('defs without ComponentParameters defaults still get a NAME', () => {
    const def = { name: 'half_adder', reference: 'X', pins: [], bbox: {} }
    expect(placeholderProperties(def, 'X1')).toMatchObject({ NAME: 'X1' })
  })

  it('adjustModelPolarity flips only when the name states a polarity', () => {
    expect(adjustModelPolarity({ MODEL: '.model mybjt PNP' }, 'QNPN').MODEL)
      .toBe('.model mybjt NPN')
    expect(adjustModelPolarity({ MODEL: '.model mybjt PNP' }, 'Q2SA1015').MODEL)
      .toBe('.model mybjt PNP')
    expect(adjustModelPolarity({}, 'QNPN').MODEL).toBeUndefined()
  })
})

describe('exact netlist for the full Half_Adder schematic', () => {
  const defs = parseLegacyLib(LIB)
  const instr = readKicadSchematic(SCH)

  // Mirror of loadComponents' exact-pin assembly, keyed by reference.
  const netPins = []
  for (const comp of instr.components) {
    const def = defs.get(comp.rawName)
    expect(def).toBeTruthy() // the cache lib covers every instance
    def.pins.forEach((pin, idx) => {
      const p = legacyPinPosition(comp, pin)
      netPins.push({ x: p.x, y: p.y, componentId: comp.reference, pin: pin.number, idx })
    })
  }

  const nets = extractLegacyNets({
    segments: instr.wires.map((w) => ({
      a: { x: w.startx, y: w.starty },
      b: { x: w.endx, y: w.endy }
    })),
    junctions: instr.connections,
    labels: instr.labels,
    pins: netPins
  })
  const ids = (net) => net.points.map((p) => p.componentId + '.' + p.pin).sort()
  const withPin = (ref, pin) => nets.find((n) => n.points.some((p) => p.componentId === ref && p.pin === pin))

  it('reconstructs all 11 nets of the half adder', () => {
    expect(nets.filter((n) => n.points.length >= 2)).toHaveLength(11)
  })

  it('input nets: DC source + ADC input + plot probe, named by their labels', () => {
    const in1 = withPin('U1', '1')
    expect(ids(in1)).toEqual(['U1.1', 'U3.~', 'v1.1'])
    expect(in1.name).toBe('IN1')
    const in2 = withPin('U1', '2')
    expect(ids(in2)).toEqual(['U1.2', 'U4.~', 'v2.1'])
    expect(in2.name).toBe('IN2')
  })

  it('digital path: ADC → half_adder → DAC pin-to-pin', () => {
    expect(ids(withPin('X1', '1'))).toEqual(['U1.3', 'X1.1'])
    expect(ids(withPin('X1', '2'))).toEqual(['U1.4', 'X1.2'])
    expect(ids(withPin('X1', '3'))).toEqual(['U2.1', 'X1.3'])
    expect(ids(withPin('X1', '4'))).toEqual(['U2.2', 'X1.4'])
  })

  it('outputs: DAC → R + plot, named sum/cout; shared ground rail', () => {
    const sum = withPin('R1', '1')
    expect(ids(sum)).toEqual(['R1.1', 'U2.3', 'U5.~'])
    expect(sum.name).toBe('sum')
    const cout = withPin('R2', '1')
    expect(ids(cout)).toEqual(['R2.1', 'U2.4', 'U6.~'])
    expect(cout.name).toBe('cout')
    expect(ids(withPin('#PWR03', '1'))).toEqual(['#PWR03.1', 'R1.2', 'R2.2'])
  })

  it('power flag rides the v2 ground net', () => {
    expect(ids(withPin('#FLG04', '1'))).toEqual(['#FLG04.1', '#PWR01.1', 'v2.2'])
    expect(ids(withPin('#PWR02', '1'))).toEqual(['#PWR02.1', 'v1.2'])
  })
})
