/**
 * importKicadSch.js — entry point for importing KiCad v6+ (.kicad_sch) files.
 *
 * Pipeline:
 *   1. parse the S-expression file into a flat document (kicadDocument)
 *   2. extract the pin-to-pin netlist in KiCad space (connectivity) — the
 *      only thing the original wire geometry is used for
 *   3. resolve every symbol against the component library API and place it
 *      at its (scaled) KiCad position
 *   4. re-draw every net with the editor's own Manhattan router (autoWire)
 *
 * Because wires are regenerated from the netlist, imported schematics never
 * suffer from the classic misaligned-wire problem: connections always land
 * exactly on the pins of the library symbols actually placed.
 */

import store from '../../../redux/store'
import api from '../../../utils/Api'
import { fetchSymbolSchema, initialProperties } from '../Helper/SvgParser'
import ComponentParameters from '../Helper/ComponentParametersData'
import { schematicStore } from '../Canvas/schematicStore'
import { snapPoint } from '../Canvas/geometry'
import { parseKicadSch } from './kicadDocument'
import { extractNets } from './connectivity'
import { autoWireNets } from './autoWire'

/**
 * mm → canvas units. The legacy v4 importer divides mil coordinates by 5,
 * so one 50 mil pin-grid step is 10 canvas units; 20/2.54 keeps the same
 * density for the millimetre coordinates of v6 files.
 */
export const MM_TO_CANVAS = 20 / 2.54

function authConfig () {
  const token = store.getState().authReducer.token
  const config = { headers: { 'Content-Type': 'application/json' } }
  if (token) config.headers.Authorization = `Token ${token}`
  return config
}

/** Library + name search terms for a KiCad lib_id, e.g. "Device:R" */
function searchTerms (instance, template) {
  if (template && template.isPower) {
    // Power symbols resolve by their net name (GND, VCC, ...)
    const name = (instance.value || instance.libId.split(':').pop() || '').trim()
    return { name: name.toLowerCase(), library: null }
  }
  const [library, name] = instance.libId.includes(':')
    ? instance.libId.split(':')
    : [null, instance.libId]
  return { name: (name || '').toLowerCase(), library: (library || '').toLowerCase() || null }
}

function pickBestMatch (results, name) {
  for (const r of results) {
    if ((r.name || '').toLowerCase() === name) return r
  }
  return results[0]
}

/** Resolve a lib_id against the component library API (memoised per import) */
async function resolveComponent (instance, template, cache) {
  const { name, library } = searchTerms(instance, template)
  if (!name) return null
  const cacheKey = library + ':' + name
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  let result = null
  try {
    const url = library
      ? `components/?component_library__library_name__icontains=${library}&name__icontains=${name}`
      : `components/?name__icontains=${name}`
    let res = await api.get(url, authConfig())
    if ((!res.data || res.data.length === 0) && library) {
      // Library name mismatch — retry across all libraries
      res = await api.get(`components/?name__icontains=${name}`, authConfig())
    }
    if (res.data && res.data.length > 0) {
      const compData = pickBestMatch(res.data, name)
      const schema = await fetchSymbolSchema(compData)
      result = { compData, schema }
    }
  } catch (e) {
    console.error('KiCad import: failed to resolve', instance.libId, e)
  }
  cache.set(cacheKey, result)
  return result
}

/** KiCad CCW angle → canvas rotation (SVG rotate() is clockwise on screen) */
function canvasRotation (angle) {
  return ((360 - Math.round(angle / 90) * 90) % 360 + 360) % 360
}

/**
 * Import a KiCad v6+ schematic file into the canvas.
 *
 * @param {string} fileContents raw .kicad_sch text
 * @returns {Promise<{placed: number, skipped: string[], nets: number, wired: number}>}
 */
export async function importKicadSchFile (fileContents) {
  const doc = parseKicadSch(fileContents)
  const nets = extractNets(doc)

  // An import IS the document. Importing onto a populated canvas merges the
  // two circuits wherever coordinates happen to coincide — nets short across
  // unrelated components ("shorted VSRC") with no visible cause. Undo brings
  // the previous circuit back.
  schematicStore.clearAll()

  const cache = new Map()
  const placedByUuid = new Map()
  const skipped = []

  for (const inst of doc.instances) {
    const template = doc.templates[inst.libId]
    const resolved = await resolveComponent(inst, template, cache)
    if (!resolved) {
      skipped.push(inst.reference + ' (' + inst.libId + ')')
      continue
    }
    const { compData, schema } = resolved
    const cx = inst.x * MM_TO_CANVAS
    const cy = inst.y * MM_TO_CANVAS
    const topLeft = snapPoint({ x: cx - schema.width / 2, y: cy - schema.height / 2 })
    const props = initialProperties(compData, ComponentParameters)
    if (inst.value && props.VALUE !== undefined) props.VALUE = inst.value
    const id = schematicStore.addComponent({
      name: (compData.name || '').toUpperCase(),
      symbol: (compData.symbol_prefix || '').toUpperCase(),
      x: topLeft.x,
      y: topLeft.y,
      width: schema.width,
      height: schema.height,
      rotation: canvasRotation(inst.angle),
      svgPath: compData.svg_path,
      compObject: compData,
      properties: props,
      pins: schema.pins.map((pin) => ({
        number: pin.number,
        name: pin.name,
        type: pin.type,
        dx: pin.dx,
        dy: pin.dy
      }))
    })
    placedByUuid.set(inst.uuid, schematicStore.getComponent(id))
  }

  const { wired, openNets } = autoWireNets(nets, placedByUuid)

  return {
    placed: placedByUuid.size,
    skipped,
    nets: nets.filter((n) => n.pins.length >= 2).length,
    wired,
    openNets
  }
}
