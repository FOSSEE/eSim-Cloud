/**
 * standardLibs.test.js — bundled standard symbol library loading and its use
 * as the built-in fallback cache lib for single-file .sch imports.
 *
 * Fixture standard-slice.lib = eSim_Sources.lib + the R/C/GND/PWR_FLAG DEF
 * blocks from Device.lib and power.lib — the exact symbols the RC example
 * needs, so a bare RC.sch (no -cache.lib) resolves every def.
 */

import fs from 'fs'
import path from 'path'
import { getStandardDefs, resetStandardDefs } from '../standardLibs'
import { parseLegacyLib } from '../legacyLib'
import { readKicadSchematic, defForComponent, buildDefsIndex, defMatchesWires } from '../../Helper/KiCadFileUtils'

const SLICE = fs.readFileSync(path.join(__dirname, 'fixtures', 'standard-slice.lib'), 'utf8')

describe('getStandardDefs', () => {
  afterEach(() => {
    resetStandardDefs()
    delete global.fetch
  })

  it('fetches and parses the bundled lib once (memoised)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SLICE) })
    const defs = await getStandardDefs()
    expect(defs.get('R')).toBeTruthy()
    expect(defs.get('sine').pins).toHaveLength(2)
    const again = await getStandardDefs()
    expect(again).toBe(defs)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('degrades to an empty map when the asset is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    const defs = await getStandardDefs()
    expect(defs.size).toBe(0)
  })
})

describe('single-file RC.sch against the standard defs', () => {
  const RC_SCH = fs.readFileSync(path.join(__dirname, 'fixtures', 'RC.sch'), 'utf8')

  it('every RC component (incl. rescue names) finds a bundled def', () => {
    const defs = buildDefsIndex(parseLegacyLib(SLICE))
    const instr = readKicadSchematic(RC_SCH)
    // plot_v1 is an eSim-desktop symbol, not part of the standard libraries
    const expectMissing = new Set(['plot_v1'])
    for (const comp of instr.components) {
      const def = defForComponent(defs, comp)
      if (expectMissing.has(comp.rawName)) {
        expect(def).toBeNull()
      } else {
        expect(def).toBeTruthy()
      }
    }
  })
})

describe('buildDefsIndex / defForComponent', () => {
  const standard = parseLegacyLib(SLICE)

  it('is case-insensitive: lower-cased schematic names find their DEFs', () => {
    const defs = buildDefsIndex(standard)
    expect(defForComponent(defs, { rawName: 'SINE', componentName: 'sine' })).toBeTruthy()
    expect(defForComponent(defs, { rawName: 'Pwl', componentName: 'pwl' })).toBeTruthy()
    expect(defForComponent(defs, { rawName: 'nope', componentName: 'nope' })).toBeNull()
  })

  it('rescue names resolve against the bundled originals', () => {
    const defs = buildDefsIndex(standard)
    const comp = { rawName: 'R-RESCUE-MyProject', componentName: 'r' }
    const def = defForComponent(defs, comp)
    expect(def).toBeTruthy()
    expect(def.pins).toHaveLength(2)
  })

  it('a project cache lib overlays the standard defs', () => {
    const cache = parseLegacyLib(
      'DEF R R 0 0 N Y 1 F N\nDRAW\nX ~ 1 0 500 100 D 50 50 1 1 P\nX ~ 2 0 -500 100 U 50 50 1 1 P\nENDDRAW\nENDDEF\n')
    const defs = buildDefsIndex(standard, cache)
    const def = defForComponent(defs, { rawName: 'R', componentName: 'r' })
    expect(def.pins[0].y).toBe(500) // cache version, not Device.lib's 100 mil pin
  })
})

describe('defMatchesWires — generation-mismatch guard', () => {
  // RC.sch's R1 was drawn with the old horizontal R (pins -100/+200, y 50);
  // the bundled modern Device.lib R is vertical (pins 0,±150). Trusting the
  // wrong def would put "exact" pins off the wires and mangle the netlist.
  const RC_SCH = fs.readFileSync(path.join(__dirname, 'fixtures', 'RC.sch'), 'utf8')
  const instr = readKicadSchematic(RC_SCH)
  const segments = instr.wires.map((w) => ({
    a: { x: w.startx, y: w.starty },
    b: { x: w.endx, y: w.endy }
  }))
  const r1 = instr.components.find((c) => c.reference === 'R1')

  const oldR = parseLegacyLib(
    'DEF R R 0 0 N Y 1 F N\nDRAW\nX ~ 1 -100 50 50 R 60 60 1 1 P\nX ~ 2 200 50 50 L 60 60 1 1 P\nENDDRAW\nENDDEF\n').get('R')
  const modernR = parseLegacyLib(SLICE).get('R') // Device.lib: 0,±150 vertical

  it('accepts the def the schematic was drawn with', () => {
    expect(defMatchesWires(r1, oldR, segments)).toBe(true)
  })

  it('rejects a same-named def from a different library generation', () => {
    expect(modernR.pins.map((p) => [p.x, p.y])).toEqual([[0, 150], [0, -150]])
    expect(defMatchesWires(r1, modernR, segments)).toBe(false)
  })

  it('rejects defs when the component is fully unwired', () => {
    expect(defMatchesWires(r1, oldR, [])).toBe(false)
  })
})
