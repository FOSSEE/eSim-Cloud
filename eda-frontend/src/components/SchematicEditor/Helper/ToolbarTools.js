

/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable new-cap */
/* eslint-disable */
import mxGraphFactory from 'mxgraph'
import store from '../../../redux/store'
import * as actions from '../../../redux/actions/actions'
import ComponentParameters from './ComponentParametersData'
import { findNearestWire, findNearestVSourcePin } from './SideBar'
import { checkNetlistErc, buildNetlistFromGraph, annotate } from './NetlistExporter'
var graph
var undoManager

const {
  mxPrintPreview,
  mxConstants,
  mxRectangle,
  mxUtils,
  mxUndoManager,
  mxEvent,
  mxCodec,
  mxCell,
  mxMorphing,
  mxPoint
} = new mxGraphFactory()

export default function ToolbarTools(grid, unredo) {
  graph = grid

  undoManager = new mxUndoManager()
  var listener = function (sender, evt) {
    undoManager.undoableEditHappened(evt.getProperty('edit'))
  }
  graph.getModel().addListener(mxEvent.UNDO, listener)
  graph.getView().addListener(mxEvent.UNDO, listener)
}

// Display mxGraph root (For development only)
export function dispGraph () {
  if (graph) {
    console.log('Graph Root', graph.getDefaultParent())
    console.log('Current Cell', graph.getSelectionCell())
  }
}

// SAVE
export function Save() {
  XMLWireConnections()
  var enc = new mxCodec(mxUtils.createXmlDocument())
  var node = enc.encode(graph.getModel())
  var value = mxUtils.getXml(node)
  return value
}

// Function to clear undo/redo history
export function clearHistory() {
  undoManager.clear()
}

// Func to check if wire change
const checkWireChange = (changes) => {
  for (const change of changes) {
    if (change.__proto__.constructor.name === 'mxTerminalChange') { return true }
  }
  return false
}

// UNDO
export function Undo() {
  if (undoManager.indexOfNextAdd === 0) {
    // Nothing to undo
    return
  } else if (checkWireChange(undoManager.history[undoManager.indexOfNextAdd - 1].changes)) {
    // Found Wire
    undoManager.undo()
  } else if (undoManager.history[undoManager.indexOfNextAdd - 1].changes.length > 1) {
    // Found Component
    let undos = 1
    for (let i = undoManager.indexOfNextAdd - 1; i >= 0; i--, undos++) {
      if (undoManager.history[i].changes.length === 1
        || checkWireChange(undoManager.history[i].changes)
      ) { break }
    }
    while (undos !== 0) {
      undoManager.undo()
      undos--
    }
  } else if (undoManager.history[undoManager.indexOfNextAdd - 1].changes.length === 1) {
    // Found Rotate/Move
    let undos = 0
    for (let i = undoManager.indexOfNextAdd - 1; i >= 0; i--, undos++) {
      if (undoManager.history[i].changes.length !== 1) { break }
    }
    while (undos !== 0) {
      undoManager.undo()
      undos--
    }
  }
  else {
    // Default case !?
    undoManager.undo()
  }
}

// REDO
export function Redo() {
  if (undoManager.indexOfNextAdd === undoManager.history.length) {
    // Nothing to redo
    return
  } else if (checkWireChange(undoManager.history[undoManager.indexOfNextAdd].changes)) {
    // Found Wire
    undoManager.redo()
  } else if (
    undoManager.history[undoManager.indexOfNextAdd].changes.length === 1
    && undoManager.history[undoManager.indexOfNextAdd].changes[0].__proto__.constructor.name === 'mxChildChange'
  ) {
    // Found Component
    let redos = 1
    for (let i = undoManager.indexOfNextAdd + 1; i < undoManager.history.length; i++, redos++) {
      if (undoManager.history[i].changes.length === 12 ||
        undoManager.history[i].changes.length === 1 ||
        checkWireChange(undoManager.history[i].changes)
      ) { break }
    }
    while (redos !== 0) {
      undoManager.redo()
      redos--
    }
  } else if (undoManager.history[undoManager.indexOfNextAdd].changes.length === 1) {
    //Found component Rotate/Move
    let redos = 1;
    for (let i = undoManager.indexOfNextAdd + 1; i < undoManager.history.length; i++, redos++) {
      if (undoManager.history[i].changes.length !== 1 ||
        undoManager.history[i].changes[0].__proto__.constructor.name === 'mxChildChange'
      ) { break }
    }
    while (redos !== 0) {
      redos--
      undoManager.redo()
    }
  } else {
    // Default Case !?
    undoManager.redo()
  }
}

// Zoom IN
export function ZoomIn() {
  graph.zoomIn()
}

// ZOOM OUT
export function ZoomOut() {
  graph.zoomOut()
}

// ZOOM ACTUAL
export function ZoomAct() {
  graph.zoomActual()
}

// DELETE COMPONENT
export function DeleteComp() {
  graph.removeCells()
}

// CLEAR WHOLE GRID
export function ClearGrid() {
  graph.removeCells(graph.getChildVertices(graph.getDefaultParent()))
}

// SELECT ALL COMPONENTS
export function SelectAll() {
  graph.selectAll()
}

// Module-level clipboard for copy/paste
var clipboardCells = null
var pasteOffset = 0

// COPY SELECTED COMPONENTS
export function CopyComponents() {
  console.log('[CopyComponents] called, graph exists:', !!graph)
  var cells = graph.getSelectionCells()
  console.log('[CopyComponents] selected cells:', cells ? cells.length : 'null')
  if (cells != null && cells.length > 0) {
    // Temporarily break circular references before cloning
    var savedRefs = []
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i]
      var cellRefs = []
      if (cell.children) {
        for (var j = 0; j < cell.children.length; j++) {
          var child = cell.children[j]
          cellRefs.push({
            child: child,
            ParentComponent: child.ParentComponent,
            edges: child.edges
          })
          child.ParentComponent = null
          child.edges = null
        }
      }
      savedRefs.push(cellRefs)
    }

    try {
      clipboardCells = graph.cloneCells(cells)
      pasteOffset = 20
      console.log('[CopyComponents] copied', clipboardCells.length, 'cells')
    } catch (e) {
      console.error('[CopyComponents] clone failed:', e)
      clipboardCells = null
    }

    // Restore circular references on originals
    for (var i = 0; i < cells.length; i++) {
      var cellRefs = savedRefs[i]
      for (var j = 0; j < cellRefs.length; j++) {
        cellRefs[j].child.ParentComponent = cellRefs[j].ParentComponent
        cellRefs[j].child.edges = cellRefs[j].edges
      }
    }
  }
}

// PASTE COPIED COMPONENTS
export function PasteComponents() {
  console.log('[PasteComponents] called, clipboard:', clipboardCells ? clipboardCells.length : 'null')
  if (clipboardCells != null && clipboardCells.length > 0) {
    // Clone again from clipboard (also has no circular refs)
    var clones = graph.cloneCells(clipboardCells)
    graph.getModel().beginUpdate()
    try {
      var parent = graph.getDefaultParent()
      for (var i = 0; i < clones.length; i++) {
        var cell = clones[i]
        if (cell.geometry != null) {
          cell.geometry.x += pasteOffset
          cell.geometry.y += pasteOffset
        }
        graph.addCell(cell, parent)
        // Restore ParentComponent circular ref on pasted children
        if (cell.children) {
          for (var j = 0; j < cell.children.length; j++) {
            cell.children[j].ParentComponent = cell
          }
        }
      }
    } finally {
      graph.getModel().endUpdate()
    }
    graph.setSelectionCells(clones)
    pasteOffset += 20
    console.log('[PasteComponents] pasted', clones.length, 'cells')
  }
}

export function rotateCell (cell, rot_ang) {
  var view = graph.getView()
  var state = view.getState(cell, true)
  var vHandler = graph.createVertexHandler(state)
  console.log(cell)
  if (cell != null) {
    vHandler.rotateCell(cell, parseInt(rot_ang))
    let childCount = cell.getChildCount()
    for (let i = 0; i < childCount; i++) {
      let child = cell.getChildAt(i)
      vHandler.rotateCell(child, parseInt(rot_ang) * (-1))
    }
  }
  vHandler.destroy()
}

function rotate (rot_ang) {
  var cell = graph.getSelectionCell()
  console.log(graph.getDefaultParent())
  if (cell !== undefined) {
    rotateCell(cell, rot_ang)
  }
}

// ROTATE COMPONENT CLOCKWISE
export function Rotate() {
  rotate(90)
}

// ROTATE COMPONENT Anti-CLOCKWISE
export function RotateACW() {
  rotate(-90)
}

// PRINT PREVIEW OF SCHEMATIC
export function PrintPreview() {
  // Matches actual printer paper size and avoids blank pages
  var scale = 0.8
  var headerSize = 50
  var footerSize = 50

  // Applies scale to page
  var pageFormat = { x: 0, y: 0, width: 1169, height: 827 }
  var pf = mxRectangle.fromRectangle(pageFormat || mxConstants.PAGE_FORMAT_A4_LANDSCAPE)
  pf.width = Math.round(pf.width * scale * graph.pageScale)
  pf.height = Math.round(pf.height * scale * graph.pageScale)

  // Finds top left corner of top left page
  var bounds = mxRectangle.fromRectangle(graph.getGraphBounds())
  bounds.x -= graph.view.translate.x * graph.view.scale
  bounds.y -= graph.view.translate.y * graph.view.scale

  var x0 = Math.floor(bounds.x / pf.width) * pf.width
  var y0 = Math.floor(bounds.y / pf.height) * pf.height

  var preview = new mxPrintPreview(graph, scale, pf, 0, -x0, -y0)
  preview.marginTop = headerSize * scale * graph.pageScale
  preview.marginBottom = footerSize * scale * graph.pageScale
  preview.autoOrigin = false

  var oldRenderPage = preview.renderPage
  preview.renderPage = function (w, h, x, y, content, pageNumber) {
    var div = oldRenderPage.apply(this, arguments)

    var header = document.createElement('div')
    header.style.position = 'absolute'
    header.style.boxSizing = 'border-box'
    header.style.fontFamily = 'Arial,Helvetica'
    header.style.height = (this.marginTop - 10) + 'px'
    header.style.textAlign = 'center'
    header.style.verticalAlign = 'middle'
    header.style.marginTop = 'auto'
    header.style.fontSize = '12px'
    header.style.width = '100%'
    header.style.fontWeight = '100'

    // Vertical centering for text in header/footer
    header.style.lineHeight = (this.marginTop - 10) + 'px'

    var footer = header.cloneNode(true)
    var title = store.getState().saveSchematicReducer.title
    mxUtils.write(header, title + ' - eSim on Cloud')
    header.style.borderBottom = '1px solid blue'
    header.style.top = '0px'

    mxUtils.write(footer, 'Made with Schematic Editor - ' + pageNumber + ' - eSim on Cloud')
    footer.style.borderTop = '1px solid blue'
    footer.style.bottom = '0px'

    div.firstChild.appendChild(footer)
    div.firstChild.appendChild(header)

    return div
  }

  preview.open()
}

// ERC CHECK FOR SCHEMATIC
export function ErcCheck() {
  var list = graph.getModel().cells // mapping the grid
  var vertexCount = 0
  var errorCount = 0
  var PinNC = 0
  var stypes = 0
  var ground = 0
  var wirec = 0
  for (var property in list) {
    var cell = list[property]
    if (cell.Component === true) {
      for (var child in cell.children) {
        var childVertex = cell.children[child]
        if (childVertex.Pin === true && childVertex.edges === null) { // Checking if connections exist from a given pin
          ++PinNC
          ++errorCount
        } else {
          for (var w in childVertex.edges) {
            if (childVertex.edges[w].source === null || childVertex.edges[w].target === null) {
              ++PinNC
            } else {
              if (childVertex.edges[w].source.edge === true || childVertex.edges[w].target.edge === true) {
                ++wirec
              }
            }
          }
        }
      }
      ++vertexCount
    }
    if (cell.symbol === 'PWR') { // Checking for ground
      console.log('Ground is present')
      console.log(cell)
      ++ground
    }
  }

  if (vertexCount === 0) {
    alert('No Component added')
    ++errorCount
  } else if (PinNC !== 0) {
    alert('Pins not connected')
  } else if (ground === 0) {
    alert('Ground not connected')
  } else {
    if (errorCount === 0) {
      alert('ERC Check completed')
    }
  }
}
// ERC Check for Netlist, It also returns a boolean value which is called in the Netlist Generator 
export function ErcCheckNets() {
  const result = checkNetlistErc(graph)
  if (result.vertexCount === 0) {
    alert('No Component added')
    return false
  } else if (result.pinNC !== 0) {
    alert('Pins not connected')
    return false
  } else if (result.ground === 0) {
    alert('Ground not connected')
    return false
  } else {
    if (result.errorCount === 0) {
      return true
    }
  }
}

// Function to get all probe nodes and branches from the canvas
// Returns { voltageProbes: [{edgeId, color}], currentProbes: [{branch, color}] }
export function GetProbeNodes () {
  if (!graph) return { voltageProbes: [], currentProbes: [] }
  var model = graph.getModel()
  var voltageProbes = []
  var currentProbes = []

  Object.values(model.cells).forEach(function (cell) {
    if (!cell || cell.CellType !== 'Probe') return

    if (cell.probeType === 'V') {
      var nodeLabel = null
      
      // Dynamically find the nearest wire to the probe's current position
      var geo = model.getGeometry(cell)
      var cx = geo ? geo.x + geo.width / 2 : 0
      var cy = geo ? geo.y + geo.height / 2 : 0
      var nearestWire = findNearestWire(cx, cy)
      
      if (nearestWire) {
        var edge = nearestWire
        if (edge.source && edge.source.ConnectedNode !== undefined && edge.source.ConnectedNode !== null) {
          nodeLabel = String(edge.source.ConnectedNode)
        } else if (edge.target && edge.target.ConnectedNode !== undefined && edge.target.ConnectedNode !== null) {
          nodeLabel = String(edge.target.ConnectedNode)
        } else if (edge.node !== undefined && edge.node !== null) {
          nodeLabel = String(edge.node)
        }
      }
      voltageProbes.push({ nodeLabel: nodeLabel, color: cell.probeColor || '#00e676', cellId: cell.id, probeLabel: cell.value })
    } else if (cell.probeType === 'I') {
      var branchLabel = null
      
      // Dynamically find the nearest V-Source pin
      var geo = model.getGeometry(cell)
      var cx = geo ? geo.x + geo.width / 2 : 0
      var cy = geo ? geo.y + geo.height / 2 : 0
      var nearestPin = findNearestVSourcePin(cx, cy)
      
      if (nearestPin) {
        var pinParent = nearestPin.ParentComponent || nearestPin.parent
        branchLabel = pinParent.properties
          ? (pinParent.properties.PREFIX || pinParent.value || pinParent.symbol)
          : pinParent.symbol
      }
      
      currentProbes.push({ branch: branchLabel, color: cell.probeColor || '#ff9100', cellId: cell.id, probeLabel: cell.value })
    }
  })

  return { voltageProbes, currentProbes }
}

// Function to generate Netlist
export function GenerateNetList() {
  var erc = ErcCheckNets() // Checking for ERC Failures
  if (erc === false) {
    alert('ERC check failed')
  } else {
    const netobj = buildNetlistFromGraph(graph)
    store.dispatch({
      type: actions.SET_MODEL,
      payload: {
        model: netobj.models
      }
    })
    return {
      models: netobj.models,
      main: netobj.main
    })
    store.dispatch({
      type: actions.SET_NETLIST,
      payload: {
        netlist: netobj.main
      }
    })
    // Refresh the GRID to view the Node Values 
    graph.getModel().beginUpdate()
    try {
      graph.view.refresh()
    } finally {
      // Arguments are number of steps, ease and delay
      var morph = new mxMorphing(graph, 20, 1.2, 20)
      morph.addListener(mxEvent.DONE, function () {
        graph.getModel().endUpdate()
      })
      morph.startAnimation()
    }
<<<<<<< HEAD
    return ans
  }
}

function annotate(graph) {
  var r = 1;
  var v = 1;
  var c = 1;
  var l = 1;
  var d = 1;
  var q = 1;
  var w = 1;
  var list = graph.getModel().cells;
  var erc = true;
  var k = '';

  if (erc === false) {
    alert('ERC check failed');
  } else {
    // DFS _________
    var NODE_SETS = []
    var hasProbes = false
    for (var p in list) {
      if (list[p] && list[p].CellType === 'Probe') {
        hasProbes = true
        break
      }
    }
    // console.log('dfs init')
    var ptr = 1
    var mp = Array(5000).fill(0)
    NODE_SETS[0] = new Set() // Defining ground
    for(var property in list){
        if(list[property].Component === true && list[property].symbol !== 'PWR'){
            mxCell.prototype.ConnectedNode = null
            var component = list[property]
            if (component.children !== null) {
              // pins
              for (var child in component.children) {
                  var pin = component.children[child];
                  
                  if (pin != null &&  pin.vertex === true && pin.connectable) {
                    if (pin.edges !== null || pin.edges.length !== 0) {
                      if(mp[(pin.id)] === 1){                                
                          continue                      
                      }
                      var stk = new Stack()
                      var cur_node
                      var cur_set = []
                      var contains_gnd = 0                     
                      
                      stk.push(pin)      
                      // console.log('exploring connected nodes of', pin)                    
                      while(!stk.isEmpty()){
                          cur_node = stk.peek()
                          stk.pop();
                          mp[cur_node.id] = 1
                          cur_set.push(cur_node)
                          stk.print()
                          for (var wire in cur_node.edges) {
                            // console.log(cur_node.edges[wire])
                            if (cur_node.edges[wire].source !== null && cur_node.edges[wire].target !== null) {
                              if (cur_node.edges[wire].target.ParentComponent !== null) {
                                if(cur_node.edges[wire].target.ParentComponent.symbol === 'PWR'){
                                    contains_gnd = 1
                                }
                              }
                              if(cur_node.edges[wire].target.vertex == true){
                                if (!mp[(cur_node.edges[wire].target.id)] && (cur_node.edges[wire].target.id !== cur_node.id)){
                                  stk.push(cur_node.edges[wire].target)
                                }
                              }
                              if(cur_node.edges[wire].source.vertex == true){
                                if(!mp[(cur_node.edges[wire].source.id)] && (cur_node.edges[wire].source.id !== cur_node.id)){
                                    stk.push(cur_node.edges[wire].source)
                                }
                              }
                              // Checking for wires which are connected to another wire(s), Comment out 
                              // the if conditions below if edge connections malfunction
                              var conn_vertices = [];
                              if (cur_node.edges[wire].edges && cur_node.edges[wire].edges.length > 0) {
                                for (const ed in cur_node.edges[wire].edges) {
                                  if (!mp[cur_node.edges[wire].edges[ed].id]) {
                                    conn_vertices = conn_vertices.concat(...traverseWire(cur_node.edges[wire].edges[ed], mp))
                                  }
                                }
                              }
                              if (cur_node.edges[wire].source.edge == true) {
                                if (!mp[(cur_node.edges[wire].source.id)] && (cur_node.edges[wire].source.id !== cur_node.id)) {
                                  conn_vertices = conn_vertices.concat(...traverseWire(cur_node.edges[wire].source, mp))
                                }
                              }
                              if (cur_node.edges[wire].target.edge == true) {
                                if (!mp[(cur_node.edges[wire].target.id)] && (cur_node.edges[wire].target.id !== cur_node.id)) {
                                  conn_vertices = conn_vertices.concat(...traverseWire(cur_node.edges[wire].target, mp))
                                }
                              }
                              // console.log("CONN EDGES", conn_vertices)
                              conn_vertices.forEach((elem) => {
                                stk.push(elem)
                              })
                            }
                          }
                        if(contains_gnd === 1){
                            for(var x in cur_set)
                                NODE_SETS[0].add(cur_set[x])
                        }
                          // console.log("Set of nodes at same pot:", cur_set)   
                      }
                    } 
                    if (!contains_gnd){
                        NODE_SETS.push(new Set(cur_set))
                    }
                  }
              }
            }
        }
    }

    for (var property in list) {
      if (list[property].Component === true && list[property].symbol !== 'PWR') {
        mxCell.prototype.ConnectedNode = null;
        var component = list[property];

        if (component.symbol === 'R') {
          component.value = component.symbol + r.toString();
          component.properties.PREFIX = component.value;
          ++r;
        } else if (component.symbol === 'V') {
          component.value = component.symbol + v.toString();
          component.properties.PREFIX = component.value;
          ++v;
        } else if (component.symbol === 'C') {
          component.value = component.symbol + c.toString();
          component.properties.PREFIX = component.value;
          ++c;
        } else if (component.symbol === 'D') {
          component.value = component.symbol + d.toString();
          component.properties.PREFIX = component.value;
          ++d;
        } else if (component.symbol === 'Q') {
          component.value = component.symbol + q.toString();
          component.properties.PREFIX = component.value;
          ++q;
        } else {
          component.value = component.symbol + w.toString();
          component.properties.PREFIX = component.value;
          ++w;
        }

        if (component.children !== null) {
          for (var child in component.children) {
            var pin = component.children[child];

            if (pin.vertex === true && pin.connectable) {
              if (pin.edges !== null && pin.edges.length !== 0) {
                NODE_SETS.forEach((e, i) => {
                  var done = 0;
                  e.forEach((vertex) => {
                    if (vertex.id == pin.id && done === 0) {
                      if (i === 0) {
                        pin.edges[wire].node = 0
                        pin.ConnectedNode = 0
                        pin.edges[wire].value = hasProbes ? '' : pin.edges[wire].node
                      } else {
                        pin.edges[wire].node = "COM." + i.toString()
                        pin.ConnectedNode = 'COM.' + i.toString() 
                        pin.edges[wire].value = hasProbes ? '' : pin.edges[wire].node
                      }
                      done = 1;
                    }
                  });
                });
                k = k + ' ' + pin.edges[0].node;
              }
            }
            // Additional condition to handle ground connection
            if (pin.edges !== null && pin.edges.length !== 0) {
              pin.edges.forEach((edge) => {
                if (
                  edge.target === null ||
                  edge.target.ParentComponent === null ||
                  (edge.target.ParentComponent.symbol !== 'PWR' && edge.target.ParentComponent.symbol !== 'GND')
                ) {
                  if (pin.ConnectedNode === 0) {
                    edge.node = 0;
                    edge.value = edge.node;
                  } else {
                    edge.node = pin.ConnectedNode;
                    edge.value = edge.node;
                  }
                }
              });
            }

          }
        }
      }
=======
    return {
      models: netobj.models,
      main: netobj.main
>>>>>>> master
    }
  }
}




export function GenerateNodeList() {
  var list = annotate(graph)
  // Using a Set to avoid duplicate Nodes 
  var nodelist = new Set()
  for (var property in list) {
    if (list[property].Component === true && list[property].symbol !== 'PWR') {
      // Fetching all the nodes 
      var component = list[property]
      if (component.children !== null) {
        for(var child in component.children){
            nodelist.add(component.children[child].edges[0].node)
        }        
      }
    }
  }
  return nodelist
}
// Sends a list of components present in the netlist 
export function GenerateCompList() {
  var list = annotate(graph)
  var a = []
  var complist = [] // This will contain the list of Component Prefix
  for (var property in list) {
    if (list[property].Component === true && list[property].symbol !== 'PWR') {
      var compobj = {
        name: '',
        magnitude: ''
      }
      var component = list[property]
      compobj.name = component.symbol
      var nodeNumber = 0
      for(var child in component.children){
          nodeNumber++
          compobj['node' + nodeNumber.toString()] = component.children[child].edges[0].node
      }
      complist.push(component.properties.PREFIX)
    }
  }
  return complist
}
// Sends a detailed list of components present in the netlist 
export function GenerateDetailedCompList() {
  var list = annotate(graph)
  var a = []
  var netlist = [] // This will contain the list of Component Prefix
  var k = 'Unitled netlist \n'
  for (var property in list) {
    if (list[property].Component === true && list[property].symbol !== 'PWR') {
      var component = list[property]
      netlist.push({name:component.properties.PREFIX,value:component.properties.VALUE,unit:component.properties.VALUE_UNIT})
    }
  }
  return netlist
}


// Function to Render Circuit XML
export function renderXML() {
  graph.view.refresh()
  var xml = 'null'
  var xmlDoc = mxUtils.parseXml(xml)
  parseXmlToGraph(xmlDoc, graph)
}
// Function to Parse XML and Redraw on Grid
export function parseXmlToGraph(xmlDoc, graph) {
  console.log("start loading")
  const cells = xmlDoc.documentElement.children[0].children
  const parent = graph.getDefaultParent()
  var v1
  var yPos
  var xPos
  var props
  var style = graph.getStylesheet().getDefaultVertexStyle()

  style[mxConstants.STYLE_SHAPE] = 'label'
  style[mxConstants.STYLE_VERTICAL_ALIGN] = 'bottom'
  style[mxConstants.STYLE_IMAGE_VERTICAL_ALIGN] = 'bottom' // indicator v-alignment
  style[mxConstants.STYLE_IMAGE_ALIGN] = 'bottom'
  style[mxConstants.STYLE_INDICATOR_COLOR] = 'green'
  style[mxConstants.STYLE_FONTCOLOR] = 'red'
  style[mxConstants.STYLE_FONTSIZE] = '10'
  delete style[mxConstants.STYLE_STROKECOLOR] // transparent
  for (let i = 0; i < cells.length; i++) {
    const cellAttrs = cells[i].attributes
    if (cellAttrs.Component.value === '1') { // is component
      const vertexName = cellAttrs.value.value
      const style = cellAttrs.style.value
      const vertexId = Number(cellAttrs.id.value)
      const geom = cells[i].children[0].attributes
      const xPos = Number(geom.x.value)
      if (geom.y === undefined) {
        yPos = 0
      } else {
        yPos = Number(geom.y.value)
      }
      const height = Number(geom.height.value)
      const width = Number(geom.width.value)
      v1 = graph.insertVertex(parent, vertexId, vertexName, xPos, yPos, width, height, style)
      v1.symbol = cellAttrs.symbol.value
      if (v1.symbol === 'V') {
        try { props = Object.assign({}, ComponentParameters[v1.symbol][cells[i].children[2].attributes.NAME.value]) } catch (e) { props = Object.assign({}, ComponentParameters[v1.symbol][cells[i].children[1].attributes.NAME.value]) }
      } else {
        props = Object.assign({}, ComponentParameters[v1.symbol])
      }
      try { props.NAME = cells[i].children[2].attributes.NAME.value } catch (e) { props.NAME = cells[i].children[1].attributes.NAME.value }
      v1.properties = props
      v1.Component = true
      v1.CellType = 'Component'
      if (v1.properties.name === 'VSOURCE') {
      }
      for (var check in props) {
        try { v1.properties[check] = cells[i].children[2].attributes[check].value } catch (e) { try { v1.properties[check] = cells[i].children[1].attributes[check].value } catch (e) { } }
      }
    } else if (cellAttrs.Pin.value === '1') {
      const vertexName = cellAttrs.value.value
      const style = cellAttrs.style.value
      const vertexId = Number(cellAttrs.id.value)
      const geom = cells[i].children[0].attributes
      try { xPos = Number(geom.x.value) } catch (e) { xPos = 0 }
      if (geom.y === undefined) {
        yPos = 0
      } else {
        yPos = Number(geom.y.value)
      }
      const height = Number(geom.height.value)
      const width = Number(geom.width.value)
      var vp = graph.insertVertex(v1, vertexId, vertexName, xPos, yPos, 0.5, 0.5, style)
      vp.ParentComponent = v1
      vp.Pin = 1
    } else if (cellAttrs.edge) { // is edge
      const edgeId = Number(cellAttrs.id.value)
      const source = Number(cellAttrs.sourceVertex.value)
      const target = Number(cellAttrs.targetVertex.value)
      var plist = cells[i].children[1].children
      try {
        if (source && target) {
          var e = graph.insertEdge(parent, edgeId, null,
            graph.getModel().getCell(source),
            graph.getModel().getCell(target)
          )
        }
        else {
          var edge = graph.createEdge(parent, edgeId, null)
          if (!source && !target)
            var e = graph.addEdge(edge, parent)
          if (!target)
            var e = graph.addEdge(edge, parent, graph.getModel().getCell(source))
          if(!source)
            var e = graph.addEdge(edge, parent, graph.getModel().getCell(target))
          e.geometry.targetPoint = new mxPoint(Number(cellAttrs.tarx.value), Number(cellAttrs.tary.value))
        }
        console.log("VERTEX", e)

        e.geometry.points = []
        for (var a in cells[i].children[1].children) {
          try {
            e.geometry.points.push(new mxPoint(Number(plist[a].attributes.x.value), Number(plist[a].attributes.y.value)))
          } catch (e) { }
            graph.getModel().beginUpdate()
          try {
            graph.view.refresh()
          } finally {
            var morph = new mxMorphing(graph, 20, 1.2, 20)
            morph.addListener(mxEvent.DONE, function () {
              graph.getModel().endUpdate()
            })
            morph.startAnimation()
          }
        }
        if (graph.getModel().getCell(target).edge === true) {
          e.geometry.setTerminalPoint(new mxPoint(Number(cellAttrs.tarx.value), Number(cellAttrs.tary.value)), false)
          graph.getModel().beginUpdate()
          try {
            graph.view.refresh()
          } finally {
            // Arguments are number of steps, ease and delay
            morph = new mxMorphing(graph, 20, 1.2, 20)
            morph.addListener(mxEvent.DONE, function () {
              graph.getModel().endUpdate()
            })
            morph.startAnimation()
          }
        }
      } catch (e) {
      }
    }
  }
  console.log("finish loading")
}

export function renderGalleryXML(xml) {
  graph.removeCells(graph.getChildVertices(graph.getDefaultParent()))
  graph.view.refresh()
  var xmlDoc = mxUtils.parseXml(xml)
  parseXmlToGraph(xmlDoc, graph)
}
// Certain Variables need to be Defined before Saving the Circuit, XML Wire Connections does that 
function XMLWireConnections() {
  var erc = true
  if (erc === false) {
    alert('ERC check failed')
  } else {
    var list = graph.getModel().cells
    for (var property in list) {
      // if (list[property].Component === true && list[property].symbol !== 'PWR') {
        if (list[property].Component === true) {
        mxCell.prototype.ConnectedNode = null
        var component = list[property]

        if (component.children !== null) {
          for (var child in component.children) {
            var pin = component.children[child]
            if (pin.vertex === true) {
              try {
                if (pin.edges !== null || pin.edges.length !== 0) {
                  for (var wire in pin.edges) {
                    if (pin.edges[wire].source == null || pin.edges[wire].target == null) {
                      console.log("Here")
                      if (pin.edges[wire].geometry.targetPoint) {
                        pin.edges[wire].tarx = pin.edges[wire].geometry.targetPoint.x
                        pin.edges[wire].tary = pin.edges[wire].geometry.targetPoint.y
                        pin.edges[wire].PointsArray = pin.edges[wire].geometry.points
                      }
                      if (pin.edges[wire].source.edge === true) {
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        // pin.edges[wire].targetVertex = pin.edges[wire].target.id
                      } else {
                        pin.edges[wire].node = pin.edges[wire].source.ParentComponent.properties.PREFIX + '.' + pin.edges[wire].source.value
                        pin.ConnectedNode = pin.edges[wire].source.ParentComponent.properties.PREFIX + '.' + pin.edges[wire].source.value
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        // pin.edges[wire].targetVertex = pin.edges[wire].target.id
                      }
                    }
                   
                    if (pin.edges[wire].source !== null && pin.edges[wire].target !== null) {
                      if (pin.edges[wire].source.edge == true) {
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        pin.edges[wire].targetVertex = pin.edges[wire].target.id
                        pin.edges[wire].PointsArray = pin.edges[wire].geometry.points
                      } else if (pin.edges[wire].target.edge == true) {
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        pin.edges[wire].targetVertex = pin.edges[wire].target.id
                        pin.edges[wire].tarx = pin.edges[wire].geometry.targetPoint.x
                        pin.edges[wire].tary = pin.edges[wire].geometry.targetPoint.y
                        pin.edges[wire].PointsArray = pin.edges[wire].geometry.points
                      } else if (pin.edges[wire].source.ParentComponent.symbol === 'PWR' || pin.edges[wire].target.ParentComponent.symbol === 'PWR') {
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        pin.edges[wire].targetVertex = pin.edges[wire].target.id
                        pin.edges[wire].PointsArray = pin.edges[wire].geometry.points
                      } else {
                        pin.edges[wire].node = pin.edges[wire].source.ParentComponent.properties.PREFIX + '.' + pin.edges[wire].source.value
                        pin.ConnectedNode = pin.edges[wire].source.ParentComponent.properties.PREFIX + '.' + pin.edges[wire].source.value
                        pin.edges[wire].sourceVertex = pin.edges[wire].source.id
                        pin.edges[wire].targetVertex = pin.edges[wire].target.id
                        pin.edges[wire].PointsArray = pin.edges[wire].geometry.points
                      }
                    }
                  }

                }
              } catch (e) { console.log('error') }
            }
          }

        }

      }
    }
  }

}
