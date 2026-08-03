/* eslint-disable camelcase */
/**
 * SvgParser.js — KiCad symbol SVG metadata parser.
 *
 * Fetches a component's symbol SVG, reads the embedded <metadata> block and
 * returns pin configurations, offsets and orientation as a plain JSON schema
 * ready to be pushed into the React canvas state. No mxGraph, no DOM writes.
 *
 * @typedef {Object} SymbolPin
 * @property {string} number       pin number ('1', '2', ...)
 * @property {string} name         pin name from the library
 * @property {string} type         'Input' | 'Output'
 * @property {string} orientation  'L' | 'R' | 'U' | 'D'
 * @property {number} length       pin length in library units
 * @property {string} shape        pin shape identifier
 * @property {number} dx           x offset from the component's top-left (canvas px)
 * @property {number} dy           y offset from the component's top-left (canvas px)
 *
 * @typedef {Object} SymbolSchema
 * @property {number} width        display width  (library width / 5)
 * @property {number} height       display height (library height / 5)
 * @property {string} symbolName
 * @property {string} svgPath      repo-relative symbol path
 * @property {SymbolPin[]} pins    connectable pins (NC pins excluded)
 */

// Divide raw svg dimensions to keep the legacy on-canvas size
const DEFAULT_SCALE = 5

// Parsed-schema cache keyed by svg path: first drag fetches, rest are instant
const svgCache = {}

/**
 * Pre-fetch and cache the symbol schema for a component.
 * Call on hover/mount so data is ready before the user drags.
 */
export function prefetchSvg (component) {
  if (!component || !component.svg_path) return
  const path = '../' + component.svg_path
  if (svgCache[path]) return
  fetch(path)
    .then((response) => response.text())
    .then((text) => {
      svgCache[path] = extractSchema(text, component.svg_path)
    })
    .catch(() => { /* ignore prefetch failures */ })
}

/** Parse the raw SVG text into a SymbolSchema */
function extractSchema (svgText, svgPath) {
  const xml = new DOMParser().parseFromString(svgText, 'text/xml')
  const metadata = xml.getElementsByTagName('metadata')[0]
  const rawWidth = parseFloat(metadata.attributes[0].nodeValue)
  const rawHeight = parseFloat(metadata.attributes[1].nodeValue)
  const symbolName = metadata.attributes[4].nodeValue

  const width = rawWidth / DEFAULT_SCALE
  const height = rawHeight / DEFAULT_SCALE

  const pins = []
  const pinList = metadata.childNodes
  pinList.forEach((pin) => {
    if (!pin.tagName) return
    const number = pin.tagName.split('-').pop()
    const read = (tag) => {
      const el = pin.getElementsByTagName(tag)[0]
      return el ? el.innerHTML.trim() : ''
    }
    const name = read('name')
    if (name === 'NC') return // not connectable
    const pinX = parseFloat(read('x')) || 0
    const pinY = parseFloat(read('y')) || 0
    pins.push({
      number,
      name,
      type: read('type') === 'I' ? 'Input' : 'Output',
      orientation: read('orientation'),
      length: parseFloat(read('length')) || 0,
      shape: read('pinShape'),
      // Same offset maths as the legacy mxGraph pin placement
      dx: width / 2 + pinX / DEFAULT_SCALE,
      dy: height / 2 - pinY / DEFAULT_SCALE - 1
    })
  })

  return { width, height, symbolName, svgPath, pins }
}

/**
 * Resolve the symbol schema for a library component (cached).
 * @param {Object} component library descriptor with `svg_path`
 * @returns {Promise<SymbolSchema>}
 */
export function fetchSymbolSchema (component) {
  const path = '../' + component.svg_path
  if (svgCache[path]) return Promise.resolve(svgCache[path])
  return fetch(path)
    .then((response) => response.text())
    .then((text) => {
      const schema = extractSchema(text, component.svg_path)
      svgCache[path] = schema
      return schema
    })
}

/**
 * The default BJT MODEL card is PNP; flip its polarity when the symbol's
 * name states it (QNPN, eSim_NPN, ...). Mutates and returns props.
 */
export function adjustModelPolarity (props, name) {
  if (!props.MODEL) return props
  if (/NPN/i.test(name)) props.MODEL = props.MODEL.replace(/\bPNP\b/i, 'NPN')
  else if (/PNP/i.test(name)) props.MODEL = props.MODEL.replace(/\bNPN\b/i, 'PNP')
  return props
}

/**
 * Build the initial simulation properties for a component, mirroring the
 * legacy ComponentParameters lookup (special-cased V and I sources).
 */
export function initialProperties (component, ComponentParameters) {
  const symbol = (component.symbol_prefix || '').toUpperCase()
  const name = (component.name || '').toUpperCase()
  let props = {}
  if (symbol === 'V') {
    props = Object.assign({}, ComponentParameters.V[name] || ComponentParameters.V.VSOURCE)
  } else if (symbol === 'I') {
    props = Object.assign({}, ComponentParameters.I[name] || ComponentParameters.I.ISOURCE)
  } else {
    props = Object.assign({}, ComponentParameters[symbol])
  }
  props.NAME = name
  return adjustModelPolarity(props, name)
}
