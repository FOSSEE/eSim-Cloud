/* eslint-disable camelcase */
/**
 * KiCadFileUtils.js — imports legacy KiCad v4/v5 .sch files.
 *
 * Placement resolves each component against the library API; wiring is
 * netlist-driven: the original wire geometry is only used to reconstruct
 * pin-to-pin connectivity (TranslationLayer/legacyNets), then every net is
 * re-routed between the pins of the placed library symbols
 * (TranslationLayer/autoWire). Copying the file's wires verbatim is what
 * used to produce stubs that miss the pins — the legacy symbols' pin
 * positions never match the local library's.
 *
 * KiCad v6+ (.kicad_sch) files are handled by TranslationLayer/importKicadSch.
 */

import store from '../../../redux/store'
import api from '../../../utils/Api'
import { fetchSymbolSchema, initialProperties, adjustModelPolarity } from './SvgParser'
import ComponentParameters from './ComponentParametersData'
import { schematicStore } from '../Canvas/schematicStore'
import { snapPoint, pinAbsolutePosition, projectOntoSegment } from '../Canvas/geometry'
import { extractLegacyNets } from '../TranslationLayer/legacyNets'
import { wirePointGroups } from '../TranslationLayer/autoWire'
import { parseLegacyLib, legacyPinPosition, buildPlaceholder } from '../TranslationLayer/legacyLib'
import { getStandardDefs } from '../TranslationLayer/standardLibs'

// orientation matrix [x1, y1, x2, y2] (KiCad defined)
// used for defining rotation and x mirrored states
const orientations = [
  [1, 0, 0, -1], [0, 1, 1, 0], [-1, 0, 0, 1], [0, -1, -1, 0],
  [1, 0, 0, 1], [0, -1, 1, 0], [1, 0, 0, -1], [0, 1, -1, 0],
  [-1, 0, 0, -1], [0, 1, -1, 0], [1, 0, 0, 1], [0, -1, 1, 0]
]

// KiCad-units to canvas-units divisor (matches the symbol svg scale)
const defScale = 5

/** Legacy bootstrap hook — the declarative canvas needs no graph handle. */
export default function KiCadFileUtils () {}

/**
 * Normalise a legacy symbol name for library lookup.
 * KiCad's rescue pass renames symbols to "<name>-RESCUE-<sheet>"; the suffix
 * never exists in the component library.
 */
export function normalizeLegacyName (raw) {
  return String(raw || '').replace(/-RESCUE-.*$/i, '').trim().toLowerCase()
}

// Reads KiCad .sch files and returns the schematic as instructions
export const readKicadSchematic = (text) => {
  const textSplit = text.split('\n')
  let i = 0
  const instructions = {}

  // Metadata and description of the schematic
  for (i = 0; i < textSplit.length; i++) {
    let brk = false
    const splt = textSplit[i].split(' ')
    switch (splt[0]) {
      case '$Descr':
        instructions.pageSize = splt[1]
        instructions.oreientation = parseInt(splt[1]) > parseInt(splt[2]) ? 'L' : 'P'
        break
      case 'Title':
        instructions.title = splt[1].substr(1, splt[1].length - 2)
        break
      case '$EndDescr':
        brk = true
        break
      default:
        break
    }
    if (brk) break
  }

  instructions.components = []
  instructions.wires = []
  instructions.connections = []
  instructions.labels = []
  let component = {}
  let wire = {}
  let connection = {}
  for (; i < textSplit.length; i++) {
    let splt = textSplit[i].split(' ')
    switch (splt[0]) {
      case '$Comp':
        i += 1
        component = {}
        splt = textSplit[i].split(' ')
        component.rawName = splt[1]
        component.reference = (splt[2] || '').trim()
        if (splt[1].indexOf(':') !== -1) {
          component.library = splt[1].split(':')[0].trim().toLowerCase()
          component.componentName = normalizeLegacyName(splt[1].split(':')[1])
        } else {
          component.componentName = normalizeLegacyName(splt[1])
          component.library = null
        }
        i += 2 // skips identifier line
        splt = textSplit[i].split(' ')
        component.x = parseInt(splt[1]) / defScale
        component.y = parseInt(splt[2]) / defScale
        i++
        // F field lines; F1 carries the user-visible value ("1k", "40u").
        // For sources/probes F1 just repeats the symbol name — not a value.
        while (textSplit[i] && textSplit[i].split(' ')[0] === 'F') {
          const fm = textSplit[i].match(/^F\s+1\s+"([^"]*)"/)
          if (fm && fm[1] &&
              fm[1].toLowerCase() !== (component.componentName || '').toLowerCase()) {
            component.value = fm[1]
          }
          i++
        }
        i += 1 // skips redundant x y position line
        {
          let compOrient = textSplit[i].split(' ')
          compOrient[0] = compOrient[0].split('\t')[1]
          compOrient = compOrient.filter((e) => e !== '').map((e) => parseInt(e))
          let rotation = 0
          let mirrorX = false
          let mirrorY = false
          for (let index = 0; index < orientations.length; index++) {
            if (compOrient[0] === orientations[index][0] && compOrient[1] === orientations[index][1] &&
              compOrient[2] === orientations[index][2] && compOrient[3] === orientations[index][3]) {
              rotation = (index % 4) * 90
              if (index > 7) { mirrorY = true } else if (index > 3) { mirrorX = true }
              break
            }
          }
          component.rotation = rotation
          component.mirrorX = mirrorX
          component.mirrorY = mirrorY
          component.matrix = compOrient.slice(0, 4) // raw legacy transform
        }
        while (textSplit[i].split(' ')[0] !== '$EndComp') {
          i++
        }
        instructions.components.push(component)
        break
      case 'Wire':
        if (splt[1] === 'Wire') {
          i += 1
          wire = {}
          let posWire = textSplit[i].split(' ')
          posWire = posWire.filter((e) => e.length !== 0)
          wire.startx = parseInt(posWire[0].split('\t')[1]) / defScale
          wire.starty = parseInt(posWire[1]) / defScale
          wire.endx = parseInt(posWire[2]) / defScale
          wire.endy = parseInt(posWire[3]) / defScale
          instructions.wires.push(wire)
        }
        break
      case 'Connection':
        connection = {}
        {
          const posConn = splt.filter((e) => e.length !== 0)
          connection.x = parseInt(posConn[2]) / defScale
          connection.y = parseInt(posConn[3]) / defScale
        }
        instructions.connections.push(connection)
        break
      case 'Text':
        // "Text GLabel X Y ..." / "Text Label X Y ..." — the text sits on
        // the following line. Labels only name nets; no geometry imported.
        if (splt[1] === 'GLabel' || splt[1] === 'Label' || splt[1] === 'HLabel') {
          const parts = splt.filter((e) => e.length !== 0)
          instructions.labels.push({
            kind: parts[1],
            x: parseInt(parts[2]) / defScale,
            y: parseInt(parts[3]) / defScale,
            text: (textSplit[i + 1] || '').trim()
          })
          i += 1
        }
        break
      default:
        break
    }
  }
  return instructions
}

const findApprComp = (compDataList, key) => {
  for (let i = 0; i < compDataList.length; i++) {
    if (compDataList[i].name.toLowerCase() === key.toLowerCase()) {
      return compDataList[i]
    }
  }
  return compDataList[0]
}

/**
 * Library lookup with fallbacks. The old importer split names containing an
 * underscore into name + library ("plot_v1" → "plot" in library "v1"), which
 * broke every component whose real name contains an underscore — so the full
 * name is tried first, then the scoped and split variants.
 */
async function resolveLegacyComponent (comp, cache, config) {
  const cacheKey = (comp.library || '') + ':' + comp.componentName
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const attempts = []
  if (comp.library) {
    attempts.push(`components/?component_library__library_name__icontains=${comp.library}&name__icontains=${comp.componentName}`)
  }
  attempts.push(`components/?name__icontains=${comp.componentName}`)
  // eSim device symbols are named eSim_<device> but the library carries the
  // KiCad-derived names (eSim_NPN → QNPN), so retry on the bare device name.
  const esimStripped = comp.componentName.replace(/^esim_/, '')
  if (esimStripped !== comp.componentName && esimStripped.length > 1) {
    attempts.push(`components/?name__icontains=${esimStripped}`)
  }
  if (comp.componentName.indexOf('_') !== -1) {
    const [name, library] = comp.componentName.split('_')
    attempts.push(`components/?component_library__library_name__icontains=${library}&name__icontains=${name}`)
  }

  let result = null
  for (const url of attempts) {
    try {
      const res = await api.get(url, config)
      if (res.data && res.data.length > 0) {
        const compData = findApprComp(res.data, comp.componentName)
        const schema = await fetchSymbolSchema(compData)
        result = { compData, schema }
        break
      }
    } catch (e) {
      console.error('Legacy import: lookup failed for', comp.rawName, e)
    }
  }
  cache.set(cacheKey, result)
  return result
}

/**
 * Simulation properties for a placeholder: the ComponentParameters defaults
 * of the def's reference prefix (so a placeholder BJT still carries a usable
 * .model card instead of producing a modelless Q line), with the model
 * polarity taken from the symbol name.
 */
export function placeholderProperties (def, reference) {
  const sym = (def.reference || 'U').replace(/^#/, '')
  const props = adjustModelPolarity(
    Object.assign({}, ComponentParameters[sym] || {}), def.name)
  props.NAME = (reference || def.name).toUpperCase()
  return props
}

/**
 * Symbol def for a component, trying the raw and rescue-stripped names, then
 * case-insensitively (the .sch parser lower-cases names: 'sine' must find
 * 'DEF SINE'). `defs.lcIndex` is built once per import by buildDefsIndex.
 */
export function defForComponent (defs, comp) {
  if (!defs) return null
  const stripped = comp.rawName.replace(/-RESCUE-.*$/i, '')
  const direct = defs.get(comp.rawName) || defs.get(comp.componentName) || defs.get(stripped)
  if (direct) return direct
  const lc = defs.lcIndex
  if (!lc) return null
  return lc.get(comp.rawName.toLowerCase()) || lc.get(stripped.toLowerCase()) || null
}

/** Merge def maps (later maps win) and attach a lowercase lookup index */
export function buildDefsIndex (...maps) {
  const defs = new Map()
  for (const m of maps) {
    if (!m) continue
    for (const [name, def] of m) defs.set(name, def)
  }
  const lcIndex = new Map()
  for (const [name, def] of defs) lcIndex.set(name.toLowerCase(), def)
  defs.lcIndex = lcIndex
  return defs
}

/**
 * Net points carry (componentId, pin number, pin index); wiring happens at
 * the pins of the *placed* symbol, looked up by number with an index
 * fallback for symbols the library numbers differently.
 */
function placedPinPoint (netPoint, placedById) {
  const comp = placedById.get(netPoint.componentId)
  if (!comp || !comp.pins || comp.pins.length === 0) return null
  let pin = comp.pins.find((p) => String(p.number) === String(netPoint.pin))
  if (!pin && netPoint.idx != null) pin = comp.pins[netPoint.idx]
  if (!pin) return null
  return pinAbsolutePosition(comp, pin)
}

/**
 * A lib def can only be trusted for exact netlisting when it is the same
 * symbol the schematic was drawn with. A project -cache.lib always is; the
 * bundled standard libraries may carry a *different generation* of a symbol
 * under the same name (modern Device.lib's R is vertical with pins at
 * 0,±150 mil — old eSim schematics used a horizontal R at -100/+200), and
 * wrong "exact" pins are worse than proximity matching. Sanity check: at
 * least half the def's pins (min 1) must land on the schematic's own wires.
 */
export function defMatchesWires (comp, def, segments, eps = 1.5) {
  if (!def.pins.length) return false
  let matched = 0
  for (const pin of def.pins) {
    const p = legacyPinPosition(comp, pin)
    for (const s of segments) {
      if (projectOntoSegment(p, s.a, s.b).d <= eps) {
        matched++
        break
      }
    }
  }
  return matched >= Math.max(1, Math.ceil(def.pins.length / 2))
}

/**
 * Resolve and place the components, then reconstruct connectivity from the
 * original wires/junctions and re-route every net between the placed pins.
 *
 * With a matching lib def the original pin positions are exact
 * (legacyPinPosition), so netlist extraction has zero ambiguity and
 * unresolved components get a placeholder symbol with the exact pin layout
 * instead of being dropped. Otherwise connectivity falls back to proximity
 * matching of the placed pins against the original wires.
 */
const loadComponents = async (instructions, defs) => {
  const token = store.getState().authReducer.token
  const config = { headers: { 'Content-Type': 'application/json' } }
  if (token) { config.headers.Authorization = `Token ${token}` }

  const segments = instructions.wires.map((w) => ({
    a: { x: w.startx, y: w.starty },
    b: { x: w.endx, y: w.endy }
  }))

  const cache = new Map()
  const netPins = [] // fed to extractLegacyNets
  const placedById = new Map()
  const skipped = []
  const placeholders = []

  for (const comp of instructions.components) {
    const def = defForComponent(defs, comp)
    const defValid = def && defMatchesWires(comp, def, segments)
    let resolved = await resolveLegacyComponent(comp, cache, config)

    // The schematic's own lib def is ground truth for the pin set. A library
    // symbol with a different pin count is a *different device* — fuzzy name
    // lookup resolved eSim_NPN to a 4-pin QNPN (substrate pin) whose extra
    // pin can never touch a wire, failing ERC on an otherwise clean import.
    // The exact-pin placeholder is electrically right; use it instead.
    if (resolved && defValid && resolved.schema.pins.length !== def.pins.length) {
      resolved = null
    }

    let placed = null
    if (resolved) {
      const { compData, schema } = resolved
      const rotated = (comp.rotation / 90) % 2 !== 0
      const w = rotated ? schema.height : schema.width
      const h = rotated ? schema.width : schema.height
      // KiCad stores the component centre; the canvas stores the top-left
      const topLeft = snapPoint({ x: comp.x - w / 2, y: comp.y - h / 2 })
      const props = initialProperties(compData, ComponentParameters)
      // F1 field value from the schematic (1k, 40u, ...) beats the default
      if (comp.value && props.VALUE !== undefined) props.VALUE = comp.value
      const id = schematicStore.addComponent({
        name: (compData.name || '').toUpperCase(),
        symbol: (compData.symbol_prefix || '').toUpperCase(),
        x: topLeft.x,
        y: topLeft.y,
        width: schema.width,
        height: schema.height,
        rotation: comp.rotation || 0,
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
      placed = schematicStore.getComponent(id)
    } else if (def) {
      // Not in the library — place an exact-pin placeholder from the cache lib.
      // KiCad references starting with '#' (power symbols, PWR_FLAG) are
      // virtual and must never reach the SPICE netlist — a bare "FLG1 0"
      // line segfaults ngspice. eSim's plot_* symbols are display-only
      // probes, equally not simulatable. Virtual symbols get 'FLG': the
      // netlist compiler skips it WITHOUT marking the net as ground —
      // 'PWR' pins turn their whole net into node 0, which grounded every
      // plotted net and shorted the sources feeding them. Only genuine
      // ground symbols (GND*) may anchor node 0 via 'PWR'.
      const virtual = def.reference.startsWith('#') || /^plot/i.test(def.name)
      const grounding = /^gnd/i.test(def.name)
      const ph = buildPlaceholder(comp, def)
      const props = placeholderProperties(def, comp.reference)
      if (comp.value && props.VALUE !== undefined) props.VALUE = comp.value
      const id = schematicStore.addComponent({
        ...ph,
        symbol: virtual ? (grounding ? 'PWR' : 'FLG') : (def.reference || 'U'),
        rotation: 0, // transform baked into the pin offsets
        compObject: { name: def.name, placeholder: true },
        properties: props
      })
      placed = schematicStore.getComponent(id)
      placeholders.push((comp.reference || '?') + ' (' + comp.rawName + ')')
    } else {
      skipped.push((comp.reference || '?') + ' (' + comp.rawName + ')')
      continue
    }
    placedById.set(placed.id, placed)

    if (defValid) {
      // Exact: the original sheet position of every pin, straight from the lib
      def.pins.forEach((pin, idx) => {
        const p = legacyPinPosition(comp, pin)
        netPins.push({ x: p.x, y: p.y, componentId: placed.id, pin: pin.number, idx })
      })
    } else {
      // Fuzzy: fall back to the placed symbol's pins (proximity matching)
      placed.pins.forEach((pin, idx) => {
        const p = pinAbsolutePosition(placed, pin)
        netPins.push({ x: p.x, y: p.y, componentId: placed.id, pin: pin.number, idx })
      })
    }
  }

  const nets = extractLegacyNets({
    segments,
    junctions: instructions.connections,
    labels: instructions.labels,
    pins: netPins
  })

  const groups = nets.map((n) =>
    n.points.map((pt) => placedPinPoint(pt, placedById)).filter(Boolean))
  const wired = wirePointGroups(groups)

  return {
    placed: placedById.size,
    placeholders,
    skipped,
    nets: nets.filter((n) => n.points.length >= 2).length,
    wired
  }
}

/**
 * @param {string} fileContents .sch text
 * @param {string} [cacheLibContents] optional -cache.lib text; overlays the
 *        bundled standard libraries for project-specific symbols
 */
export async function importSCHFile (fileContents, cacheLibContents) {
  const instructions = readKicadSchematic(fileContents)
  const standardDefs = await getStandardDefs()
  const cacheDefs = cacheLibContents ? parseLegacyLib(cacheLibContents) : null
  const defs = buildDefsIndex(standardDefs, cacheDefs)
  // An import IS the document. Importing onto a populated canvas merges the
  // two circuits wherever coordinates happen to coincide — nets short across
  // unrelated components ("shorted VSRC") with no visible cause. Undo brings
  // the previous circuit back.
  schematicStore.clearAll()
  return loadComponents(instructions, defs.size > 0 ? defs : null)
}
