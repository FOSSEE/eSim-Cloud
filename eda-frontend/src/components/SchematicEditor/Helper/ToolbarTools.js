/* eslint-disable camelcase */
/* eslint-disable new-cap */
/**
 * ToolbarTools.js — toolbar actions re-architected as plain state updates
 * against the schematic store (no mxGraph in the editor path).
 *
 * parseXmlToGraph at the bottom is the one legacy mxGraph routine kept
 * verbatim: the read-only Viewer (components/Viewer/ReadOnlyGraph.js) still
 * renders saved schematics with its own mxGraph instance.
 */

import store from '../../../redux/store'
import * as actions from '../../../redux/actions/actions'
import ComponentParameters from './ComponentParametersData'
import { findNearestWire } from './SideBar'
import { checkNetlistErc, buildNetlistFromGraph, annotate } from './NetlistExporter'
import { schematicStore } from '../Canvas/schematicStore'
import { toLegacyXml, fromLegacyXml } from '../Canvas/LegacyMxGraphSerializer'
import { zoomAtPoint } from '../Canvas/geometry'
import { compileNetlist } from '../Canvas/dsuNetlist'
import { wirePointGroups } from '../TranslationLayer/autoWire'

/** Legacy bootstrap hook — history now lives inside the schematic store. */
export default function ToolbarTools () {}

// Display current canvas state (development only)
export function dispGraph () {
  console.log('Schematic state', schematicStore.getState())
}

// SAVE — serialize to the legacy mxGraph XML schema for the backend
export function Save () {
  return toLegacyXml(schematicStore.getState())
}

export function clearHistory () {
  schematicStore.clearHistory()
}

// UNDO / REDO — snapshot stacks; no change-grouping heuristics needed
export function Undo () {
  schematicStore.undo()
}

export function Redo () {
  schematicStore.redo()
}

function zoomCentre (factor) {
  const el = document.getElementById('schematic-canvas')
  const rect = el ? el.getBoundingClientRect() : { width: 800, height: 600 }
  const view = schematicStore.getState().view
  schematicStore.setView(zoomAtPoint(view, rect.width / 2, rect.height / 2, factor))
}

export function ZoomIn () {
  zoomCentre(1.2)
}

export function ZoomOut () {
  zoomCentre(1 / 1.2)
}

export function ZoomAct () {
  schematicStore.setView({ s: 1, dx: 0, dy: 0 })
}

export function DeleteComp () {
  schematicStore.deleteSelection()
}

export function ClearGrid () {
  schematicStore.clearAll()
}

export function SelectAll () {
  schematicStore.selectAll()
}

export function CopyComponents () {
  schematicStore.copySelection()
}

export function PasteComponents () {
  schematicStore.paste()
}

/** Rotate a component by id (kept for API compatibility) */
export function rotateCell (cellOrId, rot_ang) {
  const id = typeof cellOrId === 'object' && cellOrId !== null ? cellOrId.id : cellOrId
  if (id != null) schematicStore.rotateComponent(String(id), parseInt(rot_ang, 10) || 90)
}

function rotateSelection (delta) {
  const state = schematicStore.getState()
  for (const id of state.selection) {
    if (state.components.some((c) => c.id === id)) {
      schematicStore.rotateComponent(id, delta)
    }
  }
}

export function Rotate () {
  rotateSelection(90)
}

export function RotateACW () {
  rotateSelection(-90)
}

// PRINT PREVIEW — clone the canvas svg into a print window
export function PrintPreview () {
  const svg = document.querySelector('#divGrid > svg')
  if (!svg) return
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const title = store.getState().saveSchematicReducer.title
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(
    '<html><head><title>' + title + ' - eSim on Cloud</title>' +
    '<style>body{font-family:Arial,Helvetica;margin:0}header,footer{text-align:center;font-size:12px;padding:8px}' +
    'header{border-bottom:1px solid blue}footer{border-top:1px solid blue}</style></head><body>' +
    '<header>' + title + ' - eSim on Cloud</header>' +
    clone.outerHTML +
    '<footer>Made with Schematic Editor - eSim on Cloud</footer>' +
    '</body></html>'
  )
  win.document.close()
  win.focus()
  win.print()
}

// ERC CHECK (interactive)
export function ErcCheck () {
  const result = checkNetlistErc()
  if (result.errorMsg) {
    alert(result.errorMsg)
  } else {
    alert('ERC Check completed')
  }
}

// ERC check used by the netlist generator; returns boolean
export function ErcCheckNets () {
  const result = checkNetlistErc()
  if (result.vertexCount === 0) {
    alert('No Component added')
    return false
  } else if (result.pinNC !== 0) {
    alert('Pins not connected')
    return false
  } else if (result.ground === 0) {
    alert('Ground not connected')
    return false
  }
  return result.errorCount === 0
}

/**
 * Probe nodes for the simulation plotter.
 * @returns {{voltageProbes: Array, currentProbes: Array}}
 */
export function GetProbeNodes () {
  const doc = schematicStore.getState()
  const voltageProbes = []
  const currentProbes = []
  if (doc.probes.length > 0) {
    const compiled = compileNetlist(doc)
    for (const probe of doc.probes) {
      if (probe.probeType !== 'V') continue
      // Probe tip sits at (x+10, y+40) of the glyph
      const near = findNearestWire(probe.x + 10, probe.y + 40, 30)
      let nodeLabel = null
      if (near) {
        const name = compiled.wireNode.get(near.wire.id)
        if (name !== undefined) nodeLabel = String(name)
      }
      voltageProbes.push({
        nodeLabel,
        color: probe.color || '#00e676',
        cellId: probe.id,
        probeLabel: probe.label
      })
    }
  }
  return { voltageProbes, currentProbes }
}

// Generate netlist text and publish it to redux
export function GenerateNetList () {
  const erc = ErcCheckNets()
  if (erc === false) {
    alert('ERC check failed')
    return
  }
  const netobj = buildNetlistFromGraph()
  store.dispatch({ type: actions.SET_MODEL, payload: { model: netobj.models } })
  store.dispatch({ type: actions.SET_NETLIST, payload: { netlist: netobj.main } })
  return { models: netobj.models, main: netobj.main }
}

export function GenerateNodeList () {
  return annotate().network.nodeList
}

export function GenerateCompList () {
  return annotate().componentlist
}

export function GenerateDetailedCompList () {
  const compiled = annotate()
  const netlist = []
  for (const comp of compiled.annotated) {
    if (comp.symbol === 'PWR' || comp.symbol === 'GND' || comp.symbol === 'FLG') continue
    netlist.push({
      name: comp.properties.PREFIX,
      value: comp.properties.VALUE,
      unit: comp.properties.VALUE_UNIT
    })
  }
  return netlist
}

/** Load a saved schematic (legacy mxGraph XML) into the canvas state */
export function renderGalleryXML (xml) {
  try {
    const doc = fromLegacyXml(xml)
    schematicStore.loadDocument(doc, { undoable: false })
    // Old-editor saves carry no trustworthy wire geometry — the serializer
    // returns bare components plus per-net pin groups; redraw the wires with
    // the editor's own router, exactly like the KiCad importer does.
    if (doc.legacyNetGroups) wirePointGroups(doc.legacyNetGroups)
    schematicStore.clearHistory()
  } catch (e) {
    console.error('Failed to load schematic XML', e)
  }
}

/** Legacy debug entry point — no longer applicable to the React canvas */
export function renderXML () {
  console.warn('renderXML is deprecated; use renderGalleryXML(xml) instead')
}

// ---------------------------------------------------------------------------
// LEGACY: mxGraph XML renderer used ONLY by the read-only Viewer
// (components/Viewer/ReadOnlyGraph.js supplies its own mxGraph instance).
// ---------------------------------------------------------------------------

export function parseXmlToGraph (xmlDoc, graph) {
  // Loaded lazily so the editor bundle path never touches mxGraph.
  const mxGraphFactory = require('mxgraph')
  const { mxConstants, mxPoint } = new mxGraphFactory()

  const cells = xmlDoc.documentElement.children[0].children
  const parent = graph.getDefaultParent()
  let v1
  let yPos
  let xPos
  let props
  const style = graph.getStylesheet().getDefaultVertexStyle()

  style[mxConstants.STYLE_SHAPE] = 'label'
  style[mxConstants.STYLE_VERTICAL_ALIGN] = 'bottom'
  style[mxConstants.STYLE_IMAGE_VERTICAL_ALIGN] = 'bottom'
  style[mxConstants.STYLE_IMAGE_ALIGN] = 'bottom'
  style[mxConstants.STYLE_INDICATOR_COLOR] = 'green'
  style[mxConstants.STYLE_FONTCOLOR] = 'red'
  style[mxConstants.STYLE_FONTSIZE] = '10'
  delete style[mxConstants.STYLE_STROKECOLOR]

  for (let i = 0; i < cells.length; i++) {
    const cellAttrs = cells[i].attributes
    if (!cellAttrs || !cellAttrs.Component) continue
    if (cellAttrs.Component.value === '1') { // is component
      const vertexName = cellAttrs.value.value
      const cellStyle = cellAttrs.style.value
      const vertexId = Number(cellAttrs.id.value)
      const geom = cells[i].children[0].attributes
      const compXPos = Number(geom.x.value)
      if (geom.y === undefined) {
        yPos = 0
      } else {
        yPos = Number(geom.y.value)
      }
      const height = Number(geom.height.value)
      const width = Number(geom.width.value)
      v1 = graph.insertVertex(parent, vertexId, vertexName, compXPos, yPos, width, height, cellStyle)
      v1.symbol = cellAttrs.symbol ? cellAttrs.symbol.value : ''
      if (v1.symbol === 'V') {
        try {
          props = Object.assign({}, ComponentParameters[v1.symbol][cells[i].children[2].attributes.NAME.value])
        } catch (e) {
          props = Object.assign({}, ComponentParameters[v1.symbol][cells[i].children[1].attributes.NAME.value])
        }
      } else {
        props = Object.assign({}, ComponentParameters[v1.symbol])
      }
      try {
        props.NAME = cells[i].children[2].attributes.NAME.value
      } catch (e) {
        try { props.NAME = cells[i].children[1].attributes.NAME.value } catch (e2) { }
      }
      v1.properties = props
      v1.Component = true
      v1.CellType = 'Component'
      for (const check in props) {
        try {
          v1.properties[check] = cells[i].children[2].attributes[check].value
        } catch (e) {
          try { v1.properties[check] = cells[i].children[1].attributes[check].value } catch (e2) { }
        }
      }
    } else if (cellAttrs.Pin && cellAttrs.Pin.value === '1') {
      const vertexName = cellAttrs.value.value
      const cellStyle = cellAttrs.style.value
      const vertexId = Number(cellAttrs.id.value)
      const geom = cells[i].children[0].attributes
      try { xPos = Number(geom.x.value) } catch (e) { xPos = 0 }
      if (geom.y === undefined) {
        yPos = 0
      } else {
        yPos = Number(geom.y.value)
      }
      const vp = graph.insertVertex(v1, vertexId, vertexName, xPos, yPos, 0.5, 0.5, cellStyle)
      vp.ParentComponent = v1
      vp.Pin = 1
    } else if (cellAttrs.edge) { // is edge
      const edgeId = Number(cellAttrs.id.value)
      const source = Number(cellAttrs.sourceVertex.value)
      const target = Number(cellAttrs.targetVertex.value)
      const plist = cells[i].children[1] ? cells[i].children[1].children : []
      try {
        let e
        if (source && target) {
          e = graph.insertEdge(parent, edgeId, null,
            graph.getModel().getCell(source),
            graph.getModel().getCell(target)
          )
        } else {
          const edge = graph.createEdge(parent, edgeId, null)
          if (!source && !target) e = graph.addEdge(edge, parent)
          if (!target) e = graph.addEdge(edge, parent, graph.getModel().getCell(source))
          if (!source) e = graph.addEdge(edge, parent, graph.getModel().getCell(target))
          e.geometry.targetPoint = new mxPoint(Number(cellAttrs.tarx.value), Number(cellAttrs.tary.value))
        }

        e.geometry.points = []
        for (const a in plist) {
          try {
            e.geometry.points.push(new mxPoint(Number(plist[a].attributes.x.value), Number(plist[a].attributes.y.value)))
          } catch (err) { }
        }
        const targetCell = graph.getModel().getCell(target)
        if (targetCell && targetCell.edge === true) {
          e.geometry.setTerminalPoint(new mxPoint(Number(cellAttrs.tarx.value), Number(cellAttrs.tary.value)), false)
        }
        graph.view.refresh()
      } catch (e) {
      }
    }
  }
}
