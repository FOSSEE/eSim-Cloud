/**
 * roundTrip.test.js — save/reload fidelity for imported schematics.
 *
 * Reproduces the field failure: a KiCad import simulates fine, the tab is
 * closed, the saved schematic is reopened, and suddenly pins are detached
 * and sources short ("instance v1 is a shorted VSRC"). The import itself is
 * correct, so the fault has to be in the toLegacyXml -> fromLegacyXml
 * round-trip.
 *
 * Run: CI=true NODE_OPTIONS=--openssl-legacy-provider npx react-scripts test \
 *        --watchAll=false --testPathPattern=roundTrip
 */

import fs from 'fs'
import path from 'path'
import api from '../../../../utils/Api'
import { importSCHFile } from '../../Helper/KiCadFileUtils'
import { schematicStore } from '../../Canvas/schematicStore'
import { compileNetlist, checkErc } from '../../Canvas/dsuNetlist'
import { toLegacyXml, fromLegacyXml } from '../../Canvas/LegacyMxGraphSerializer'
import { pinAbsolutePosition, coordKey } from '../../Canvas/geometry'
import { resetStandardDefs } from '../standardLibs'

const read = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')

// Library API stub: resolve RC's parts to real backend symbols (SVG fixtures
// copied from esim-cloud-backend/kicad-symbols) so the import takes the
// library-resolved path a browser session takes, not the placeholder path.
const LIBRARY = {
  r: { name: 'R', svg_path: 'test-svgs/R.svg', symbol_prefix: 'R' },
  c: { name: 'C', svg_path: 'test-svgs/C.svg', symbol_prefix: 'C' },
  pwl: { name: 'pwl', svg_path: 'test-svgs/pwl.svg', symbol_prefix: 'v' },
  gnd: { name: 'GND', svg_path: 'test-svgs/GND.svg', symbol_prefix: 'PWR' },
  dc: { name: 'DC', svg_path: 'test-svgs/DC.svg', symbol_prefix: 'v' },
  sine: { name: 'SINE', svg_path: 'test-svgs/sine.svg', symbol_prefix: 'v' },
  pwr_flag: { name: 'PWR_FLAG', svg_path: 'test-svgs/PWR_FLAG.svg', symbol_prefix: 'FLG' },
  npn: { name: 'QNPN', svg_path: 'test-svgs/QNPN.svg', symbol_prefix: 'Q' }
}

const SVG_BY_PATH = {
  'test-svgs/R.svg': 'svg-R.svg',
  'test-svgs/C.svg': 'svg-C.svg',
  'test-svgs/pwl.svg': 'svg-pwl.svg',
  'test-svgs/GND.svg': 'svg-GND.svg',
  'test-svgs/DC.svg': 'svg-DC.svg',
  'test-svgs/sine.svg': 'svg-sine.svg',
  'test-svgs/PWR_FLAG.svg': 'svg-PWR_FLAG.svg',
  'test-svgs/QNPN.svg': 'svg-QNPN.svg'
}

function mockLibraryApi () {
  jest.spyOn(api, 'get').mockImplementation((url) => {
    const m = url.match(/name__icontains=([^&]*)\s*$/)
    const hit = m && LIBRARY[decodeURIComponent(m[1]).toLowerCase()]
    return Promise.resolve({ data: hit ? [{ id: 1, component_library: 1, description: '', data_link: '', full_name: hit.name, keyword: '', thumbnail_path: '', ...hit }] : [] })
  })
  global.fetch = jest.fn().mockImplementation((url) => {
    const svg = Object.keys(SVG_BY_PATH).find((p) => String(url).indexOf(p) !== -1)
    const body = svg ? read(SVG_BY_PATH[svg]) : read('standard-slice.lib')
    return Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
  })
}

// Netlist lines keyed by component name with net numbers normalised away —
// two docs are electrically identical when, for every component, the
// *partition* of pins into nets matches. compileNetlist numbers nets by
// discovery order, so compare the pin-to-pin coincidence structure instead.
function connectivitySignature (doc) {
  const byCoord = new Map() // coordKey -> [compName.pin]
  for (const comp of doc.components) {
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      const k = coordKey(p.x, p.y)
      if (!byCoord.has(k)) byCoord.set(k, [])
      byCoord.get(k).push((comp.properties.NAME || comp.name) + '.' + pin.number)
    }
  }
  return byCoord
}

function wireEndpointsOnPins (doc) {
  const pinKeys = new Set()
  for (const comp of doc.components) {
    for (const pin of comp.pins) {
      const p = pinAbsolutePosition(comp, pin)
      pinKeys.add(coordKey(p.x, p.y))
    }
  }
  let onPin = 0
  let total = 0
  for (const wire of doc.wires) {
    const ends = [wire.points[0], wire.points[wire.points.length - 1]]
    for (const e of ends) {
      total++
      if (pinKeys.has(coordKey(e.x, e.y))) onPin++
    }
  }
  return { onPin, total }
}

describe('imported schematic survives save -> reload', () => {
  beforeEach(() => {
    schematicStore.clearAll()
    resetStandardDefs()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(read('standard-slice.lib'))
    })
  })

  it('RC.sch: netlist identical after toLegacyXml/fromLegacyXml round-trip', async () => {
    await importSCHFile(read('RC.sch'))
    const before = schematicStore.getState()
    const beforeNetlist = compileNetlist(before)
    const beforeEnds = wireEndpointsOnPins(before)

    const xml = toLegacyXml(before)
    const after = fromLegacyXml(xml)
    const afterNetlist = compileNetlist(after)
    const afterEnds = wireEndpointsOnPins(after)

    // Every wire endpoint welded to a pin before must still be on a pin
    expect(afterEnds).toEqual(beforeEnds)
    // Same electrical structure: identical netlist text modulo nothing —
    // ids and net numbering are deterministic from document order.
    expect(afterNetlist.main).toBeTruthy()
    expect(afterNetlist.main).toEqual(beforeNetlist.main)
    expect(afterNetlist.models).toEqual(beforeNetlist.models)
  })

  it('Half_Adder.sch + cache.lib: netlist survives the round-trip', async () => {
    await importSCHFile(read('Half_Adder.sch'), read('Half_Adder-cache.lib'))
    const before = schematicStore.getState()
    const beforeNetlist = compileNetlist(before)
    const beforeSig = connectivitySignature(before)

    const xml = toLegacyXml(before)
    const after = fromLegacyXml(xml)
    const afterNetlist = compileNetlist(after)
    const afterSig = connectivitySignature(after)

    expect([...afterSig.keys()].sort()).toEqual([...beforeSig.keys()].sort())
    expect(afterNetlist.main).toBeTruthy()
    expect(afterNetlist.main).toEqual(beforeNetlist.main)
    expect(afterNetlist.models).toEqual(beforeNetlist.models)
  })

  it('RC.sch with library-resolved symbols: netlist survives the round-trip', async () => {
    mockLibraryApi()
    await importSCHFile(read('RC.sch'))
    const before = schematicStore.getState()
    // Sanity: the source really resolved from the library, not a placeholder
    const v1 = before.components.find((c) => c.svgPath === 'test-svgs/pwl.svg')
    expect(v1).toBeTruthy()

    const beforeNetlist = compileNetlist(before)
    const beforeEnds = wireEndpointsOnPins(before)
    // The import itself must weld every wire end onto a pin
    expect(beforeEnds.onPin).toBe(beforeEnds.total)

    const after = fromLegacyXml(toLegacyXml(before))
    expect(wireEndpointsOnPins(after)).toEqual(beforeEnds)
    const afterNetlist = compileNetlist(after)
    expect(afterNetlist.main).toBeTruthy()
    expect(afterNetlist.main).toEqual(beforeNetlist.main)
    expect(afterNetlist.models).toEqual(beforeNetlist.models)
    // A shorted source = both nodes of the v-line identical; assert not so.
    const vLine = beforeNetlist.main.split('\n').find((l) => /^v/i.test(l))
    expect(vLine).toBeTruthy()
    const nodes = vLine.trim().split(/\s+/).slice(1, 3)
    expect(nodes[0]).not.toEqual(nodes[1])
  })

  it('BJT_amplifier.sch single-file import leaves no dry pins (ERC clean)', async () => {
    mockLibraryApi()
    // Serve the real bundled standard.lib, exactly what the browser fetches
    const stdLib = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', '..', 'public', 'kicad-libs', 'standard.lib'), 'utf8')
    global.fetch = jest.fn().mockImplementation((url) => {
      const svg = Object.keys(SVG_BY_PATH).find((p) => String(url).indexOf(p) !== -1)
      const body = svg ? read(SVG_BY_PATH[svg]) : stdLib
      return Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
    })

    const summary = await importSCHFile(read('BJT_amplifier.sch'), read('BJT_amplifier-cache.lib'))
    expect(summary.skipped).toEqual([])

    const doc = schematicStore.getState()
    const erc = checkErc(doc)
    if (erc.errorMsg) {
      // Name the dry pins so a failure pinpoints the culprit component
      const onSeg = (p, a, b, eps = 0.5) => {
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
        if (Math.abs(cross) / len > eps) return false
        const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
        return dot >= -eps * len && dot <= len * len + eps * len
      }
      const dry = []
      for (const comp of doc.components) {
        for (const pin of comp.pins) {
          const p = pinAbsolutePosition(comp, pin)
          const touches = doc.wires.some((w) => w.points.some(
            (pt, i) => i < w.points.length - 1 && onSeg(p, pt, w.points[i + 1])))
          if (!touches) {
            dry.push((comp.properties.NAME || comp.name) + '.' + pin.number +
              '@' + p.x.toFixed(1) + ',' + p.y.toFixed(1))
          }
        }
      }
      throw new Error('ERC: ' + erc.errorMsg + ' pinNC=' + erc.pinNC + ' candidates: ' + dry.join(', '))
    }
    expect(erc.errorMsg).toBeNull()

    // Q1 must be the exact 3-pin transistor (not a 4-pin substrate variant)
    // and still carry a usable NPN model card.
    const compiled = compileNetlist(doc)
    const qLine = compiled.main.split('\n').find((l) => /^q/i.test(l))
    expect(qLine).toBeTruthy()
    expect(qLine.trim().split(/\s+/)).toHaveLength(5) // q1 c b e <model>
    expect(compiled.models).toMatch(/NPN/i)

    // No source may be shorted: plot probes must not ground their nets
    // (a 'PWR' probe symbol once collapsed in/out to node 0) and every
    // V-source's two nodes must differ.
    for (const line of compiled.main.split('\n')) {
      if (!/^v/i.test(line)) continue
      const nodes = line.trim().split(/\s+/).slice(1, 3)
      expect(nodes[0]).not.toEqual(nodes[1])
    }
    // F1 values from the schematic reach the netlist
    expect(compiled.main).toMatch(/ 200k/)
    expect(compiled.main).toMatch(/ 40u/)
    expect(compiled.main).toMatch(/ 1\.5k/)
  })

  it('importing a second file replaces the document instead of stacking circuits', async () => {
    await importSCHFile(read('RC.sch'))
    const first = schematicStore.getState()
    await importSCHFile(read('Half_Adder.sch'), read('Half_Adder-cache.lib'))
    const second = schematicStore.getState()
    // No RC leftovers in the second document
    for (const comp of first.components) {
      expect(second.components.some((c) => c.id === comp.id)).toBe(false)
    }
    // And the previous circuit is one undo away
    schematicStore.undo() // wiring commit of second import collapses…
    let guard = 0
    while (schematicStore.getState().components.length !== first.components.length && guard++ < 50) {
      schematicStore.undo()
    }
    expect(schematicStore.getState().components.length).toBe(first.components.length)
  })

  it('placeholder svgPath (data URI) survives the round-trip', async () => {
    await importSCHFile(read('Half_Adder.sch'), read('Half_Adder-cache.lib'))
    const before = schematicStore.getState()
    const placeholdersBefore = before.components.filter(
      (c) => c.svgPath && c.svgPath.startsWith('data:'))
    expect(placeholdersBefore.length).toBeGreaterThan(0)

    const after = fromLegacyXml(toLegacyXml(before))
    for (const pb of placeholdersBefore) {
      const pa = after.components.find((c) => c.id === pb.id)
      expect(pa).toBeTruthy()
      expect(pa.svgPath).toEqual(pb.svgPath)
    }
  })
})
