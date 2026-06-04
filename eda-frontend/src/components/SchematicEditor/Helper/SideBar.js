/* eslint-disable new-cap */
import MxGraphFactory from 'mxgraph'
import { getSvgMetadata } from './SvgParser.js'
// import NetlistInfoFunct from './NetlistInfo.js'
const {
  mxClient,
  mxUtils,
  mxEvent,
  mxDragSource,
  mxMouseEvent
} = new MxGraphFactory()

var graph

export function SideBar (getGraph) {
  graph = getGraph
}

// ----- Magnetic Snap -----
// Tolerance in graph units (before scale). Two pins within this distance snap.
const SNAP_TOLERANCE = 20

/**
 * Gets the absolute graph-coordinate position of a pin cell.
 * Pins are stored with coordinates relative to their parent component.
 */
function getAbsolutePinPos (pin) {
  var parent = pin.ParentComponent || pin.parent
  if (!parent) return null
  var compGeo = graph.getCellGeometry(parent)
  var pinGeo = graph.getCellGeometry(pin)
  if (!compGeo || !pinGeo) return null
  return {
    x: compGeo.x + pinGeo.x,
    y: compGeo.y + pinGeo.y,
    pin: pin
  }
}

/**
 * Check if two pins are already connected by an edge.
 */
function pinsAlreadyConnected (pinA, pinB) {
  var model = graph.getModel()
  var edges = graph.getEdges(pinA)
  if (!edges) return false
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i]
    var src = model.getTerminal(edge, true)
    var tgt = model.getTerminal(edge, false)
    if ((src === pinA && tgt === pinB) || (src === pinB && tgt === pinA)) {
      return true
    }
  }
  return false
}

/**
 * After a component is placed or moved, scan all other pins on the canvas.
 * If any pin of the moved component is within SNAP_TOLERANCE of another pin,
 * physically MOVE the component so that pair of pins sit at the exact same
 * coordinate (true magnetic snap — no gap). Then connect them with a wire.
 */
export function magneticSnap (movedCell) {
  if (!graph || !movedCell) return
  var model = graph.getModel()

  // Collect pins belonging to the moved component
  var movedPins = []
  var movedChildren = model.getChildCount(movedCell)
  for (var mi = 0; mi < movedChildren; mi++) {
    var ch = model.getChildAt(movedCell, mi)
    if (ch && ch.Pin) movedPins.push(ch)
  }
  if (movedPins.length === 0) return

  // Collect all OTHER pins on the canvas
  var allCells = model.cells
  var staticPins = []
  Object.values(allCells).forEach(function (cell) {
    if (cell && cell.Pin && cell.ParentComponent !== movedCell && cell.parent !== movedCell) {
      staticPins.push(cell)
    }
  })

  // Find the single closest (pin, staticPin) pair within tolerance
  var bestDist = SNAP_TOLERANCE
  var bestMovedPin = null
  var bestStaticPin = null

  movedPins.forEach(function (mp) {
    var mpos = getAbsolutePinPos(mp)
    if (!mpos) return

    staticPins.forEach(function (sp) {
      var spos = getAbsolutePinPos(sp)
      if (!spos) return

      var dx = mpos.x - spos.x
      var dy = mpos.y - spos.y
      var dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < bestDist) {
        bestDist = dist
        bestMovedPin = mp
        bestStaticPin = sp
      }
    })
  })

  if (!bestMovedPin || !bestStaticPin) return  // Nothing in range

  // ---- PHYSICAL SNAP ----
  // Compute how far the component needs to shift so bestMovedPin lands exactly on bestStaticPin
  var mpos = getAbsolutePinPos(bestMovedPin)
  var spos = getAbsolutePinPos(bestStaticPin)
  var shiftX = spos.x - mpos.x
  var shiftY = spos.y - mpos.y

  model.beginUpdate()
  try {
    // Move the entire component by the delta
    var geo = model.getGeometry(movedCell)
    if (geo) {
      geo = geo.clone()
      geo.x += shiftX
      geo.y += shiftY
      model.setGeometry(movedCell, geo)
    }

    // Now connect the two now-coincident pins with an edge (for netlist/ERC)
    if (!pinsAlreadyConnected(bestMovedPin, bestStaticPin)) {
      var parent = graph.getDefaultParent()
      var edge = graph.insertEdge(parent, null, '', bestMovedPin, bestStaticPin)
      edge.CellType = 'Wire'
    }
  } finally {
    model.endUpdate()
    graph.refresh()
  }
}


// ----- Probe Placement -----
const PROBE_COLORS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf']

function getNextProbeColor () {
  if (!graph) return PROBE_COLORS[0]
  var model = graph.getModel()
  var count = 0
  Object.values(model.cells).forEach(function (cell) {
    if (cell && cell.CellType === 'Probe') count++
  })
  return PROBE_COLORS[count % PROBE_COLORS.length]
}

/**
 * Find the nearest wire (edge cell) to the given graph-coordinate point.
 * Returns the edge cell, or null if none within tolerance.
 */
export function findNearestWire (gx, gy) {
  var model = graph.getModel()
  var bestDist = 30  // search radius in graph units
  var bestEdge = null

  Object.values(model.cells).forEach(function (cell) {
    if (!cell || !cell.edge) return
    // Use mxGraph to get the absolute points of this edge
    var state = graph.view.getState(cell)
    if (!state || !state.absolutePoints || state.absolutePoints.length < 2) return

    // Check every segment of the edge
    var pts = state.absolutePoints
    var scale = graph.view.scale
    var tr = graph.view.translate
    for (var i = 0; i < pts.length - 1; i++) {
      var p1 = pts[i]
      var p2 = pts[i + 1]
      
      if (!p1 && i === 0) {
        var srcState = state.getVisibleTerminalState(true)
        if (srcState) p1 = { x: srcState.x + srcState.width / 2, y: srcState.y + srcState.height / 2 }
      }
      if (!p2 && i + 1 === pts.length - 1) {
        var trgState = state.getVisibleTerminalState(false)
        if (trgState) p2 = { x: trgState.x + trgState.width / 2, y: trgState.y + trgState.height / 2 }
      }
      
      if (!p1 || !p2) continue

      // Convert absolute pixel points back to graph coords
      var ax = p1.x / scale - tr.x
      var ay = p1.y / scale - tr.y
      var bx = p2.x / scale - tr.x
      var by = p2.y / scale - tr.y

      // Point-to-segment distance
      var dx = bx - ax; var dy = by - ay
      var lenSq = dx * dx + dy * dy
      var t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / lenSq))
      var cx = ax + t * dx
      var cy = ay + t * dy
      var dist = Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy))
      if (dist < bestDist) {
        bestDist = dist
        bestEdge = cell
      }
    }
  })
  return bestEdge
}

/**
 * Find the nearest Voltage Source pin to the given point.
 * Returns the pin cell, or null if none within tolerance.
 */
export function findNearestVSourcePin (gx, gy) {
  var model = graph.getModel()
  var bestDist = 30
  var bestPin = null

  Object.values(model.cells).forEach(function (cell) {
    if (!cell || !cell.Pin) return
    var parent = cell.ParentComponent || cell.parent
    if (!parent || (parent.symbol !== 'V' && parent.symbol !== 'v')) return

    var pGeo = model.getGeometry(parent)
    var pinGeo = model.getGeometry(cell)
    if (!pGeo || !pinGeo) return

    var px = pGeo.x + pinGeo.x
    var py = pGeo.y + pinGeo.y
    var dist = Math.sqrt((gx - px) * (gx - px) + (gy - py) * (gy - py))
    if (dist < bestDist) {
      bestDist = dist
      bestPin = cell
    }
  })
  return bestPin
}

/**
 * Instantly place a probe on the canvas at the specified screen coordinates.
 */
export function PlaceProbeAt (probeType, clientX, clientY) {
  if (!graph) return
  var parent = graph.getDefaultParent()
  var model = graph.getModel()
  
  var pt = mxUtils.convertPoint(graph.container, clientX, clientY)
  var scale = graph.view.scale
  var tr = graph.view.translate
  var gx = pt.x / scale - tr.x
  var gy = pt.y / scale - tr.y

  // Only place if within the canvas boundaries
  var rect = graph.container.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right ||
      clientY < rect.top || clientY > rect.bottom) return

  var probeColor = getNextProbeColor()

  function getProbeCount() {
    var count = 0
    Object.values(model.cells).forEach(function (cell) {
      if (cell && cell.CellType === 'Probe') {
        var num = parseInt(cell.value.replace('PR', ''), 10)
        if (!isNaN(num) && num > count) count = num
      }
    })
    return count
  }

  model.beginUpdate()
  try {
    var prCount = getProbeCount() + 1
    var prLabel = 'PR' + prCount

    var svgV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 50" width="60" height="50">' +
      '<polygon points="25,35 10,45 20,30" fill="#888888" />' +
      '<rect x="9" y="4" width="32" height="32" rx="4" fill="' + probeColor + '" stroke="#ffffff" stroke-width="2"/>' +
      '<text x="25" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">V</text>' +
      '<rect x="42" y="10" width="16" height="20" rx="3" fill="#f0f0f0" stroke="#cccccc" stroke-width="1.5"/>' +
      '<text x="50" y="24" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#666666">v -</text>' +
      '</svg>'
      
    var svgI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 50" width="60" height="50">' +
      '<polygon points="25,35 10,45 20,30" fill="#888888" />' +
      '<circle cx="25" cy="20" r="16" fill="' + probeColor + '" stroke="#ffffff" stroke-width="2"/>' +
      '<text x="25" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">A</text>' +
      '<rect x="42" y="10" width="16" height="20" rx="3" fill="#f0f0f0" stroke="#cccccc" stroke-width="1.5"/>' +
      '<text x="50" y="24" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#666666">i -</text>' +
      '</svg>'

    var encodedSVG = encodeURIComponent(svgV)
    var imgSrc = 'data:image/svg+xml,' + encodedSVG

    var probeStyle = [
      'shape=image',
      'image=' + imgSrc,
      'verticalLabelPosition=top',
      'verticalAlign=bottom',
      'align=center',
      'fontColor=#666666',
      'fontSize=16',
      'fontStyle=2',
      'resizable=0',
      'shadow=0'
    ].join(';') + ';'

    var probeCell = graph.insertVertex(
      parent, null, prLabel,
      gx - 30, gy - 25, 60, 50,
      probeStyle
    )
    probeCell.CellType = 'Probe'
    probeCell.probeType = probeType
    probeCell.probeColor = probeColor
    probeCell.setConnectable(false)


    graph.setSelectionCell(probeCell)
  } finally {
    model.endUpdate()
    graph.refresh()
  }
}

/**
 * Place a probe (Voltage or Current) on the canvas via drag-and-drop.
 * probeType: 'V' or 'I'
 * imgref: the DOM img element used to trigger dragging
 */
export function AddProbe (probeType, imgref) {
  var img = imgref
  var probeColor = probeType === 'V' ? '#00c853' : '#ff9100'
  var borderColor = probeType === 'V' ? '#00e676' : '#ff9100'

  function getProbeCount() {
    if (!graph) return 0
    var count = 0
    Object.values(graph.getModel().cells).forEach(function (cell) {
      if (cell && cell.CellType === 'Probe') count++
    })
    return count
  }

  mxEvent.addListener(img, 'mousedown', function (evt) {
    if (mxEvent.isConsumed(evt)) return
    mxEvent.consume(evt)
    if (mxClient.IS_IE) evt.returnValue = false

    probeColor = getNextProbeColor()

    var parent = graph.getDefaultParent()
    var model = graph.getModel()
    var pt = mxUtils.convertPoint(graph.container, evt.clientX, evt.clientY)

    // Create the fake HTML preview for dragging outside the canvas
    var dragElt = document.createElement('div')
    dragElt.textContent = 'V'
    dragElt.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'opacity:0.85',
      'pointer-events:none',
      'width:28px',
      'height:28px',
      'border-radius:4px',
      'background:#1a1a2e',
      'border:2.5px solid ' + probeColor,
      'color:' + probeColor,
      'font-size:14px',
      'font-weight:bold',
      'font-family:monospace,sans-serif',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'box-shadow:0 0 8px ' + probeColor
    ].join(';')
    dragElt.style.left = (evt.clientX - 14) + 'px'
    dragElt.style.top = (evt.clientY - 14) + 'px'
    document.body.appendChild(dragElt)

    var previewMouseMove = function (e) {
      dragElt.style.left = (e.clientX - 14) + 'px'
      dragElt.style.top = (e.clientY - 14) + 'px'
      var rect = graph.container.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        dragElt.style.visibility = 'hidden'
      } else {
        dragElt.style.visibility = 'visible'
      }
    }

    var previewMouseUp = function (e) {
      if (dragElt.parentNode) dragElt.parentNode.removeChild(dragElt)
      document.removeEventListener('mousemove', previewMouseMove)
      document.removeEventListener('mouseup', previewMouseUp)
    }

    document.addEventListener('mousemove', previewMouseMove)
    document.addEventListener('mouseup', previewMouseUp)

    model.beginUpdate()
    try {
      var scale = graph.view.scale
      var tr = graph.view.translate
      var gx = pt.x / scale - tr.x
      var gy = pt.y / scale - tr.y

      var prCount = getProbeCount() + 1
      var prLabel = 'PR' + prCount

      // Custom SVGs matching the standard schematic probe symbol
      var svgV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 50" width="60" height="50">' +
        '<polygon points="25,35 10,45 20,30" fill="#888888" />' +
        '<rect x="9" y="4" width="32" height="32" rx="4" fill="' + probeColor + '" stroke="#ffffff" stroke-width="2"/>' +
        '<text x="25" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">V</text>' +
        '<rect x="42" y="10" width="16" height="20" rx="3" fill="#f0f0f0" stroke="#cccccc" stroke-width="1.5"/>' +
        '<text x="50" y="24" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#666666">v -</text>' +
        '</svg>'
        
      var svgI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 50" width="60" height="50">' +
        '<polygon points="25,35 10,45 20,30" fill="#888888" />' +
        '<circle cx="25" cy="20" r="16" fill="' + probeColor + '" stroke="#ffffff" stroke-width="2"/>' +
        '<text x="25" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">A</text>' +
        '<rect x="42" y="10" width="16" height="20" rx="3" fill="#f0f0f0" stroke="#cccccc" stroke-width="1.5"/>' +
        '<text x="50" y="24" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#666666">i -</text>' +
        '</svg>'

      var encodedSVG = encodeURIComponent(svgV)
      var imgSrc = 'data:image/svg+xml,' + encodedSVG

      var probeStyle = [
        'shape=image',
        'image=' + imgSrc,
        'verticalLabelPosition=top',
        'verticalAlign=bottom',
        'align=center',
        'fontColor=#666666',
        'fontSize=16',
        'fontStyle=2',
        'resizable=0',
        'shadow=0'
      ].join(';') + ';'

      var probeCell = graph.insertVertex(
        parent, null, prLabel,
        gx - 30, gy - 25, 60, 50,
        probeStyle
      )
      probeCell.CellType = 'Probe'
      probeCell.probeType = probeType
      probeCell.probeColor = probeColor
      probeCell.setConnectable(false)
      
      graph.setSelectionCell(probeCell)
      graph.refresh()
      
      // Hand off drag state to mxGraph
      setTimeout(() => {
        var state = graph.view.getState(probeCell)
        if (state) {
          graph.isMouseDown = true
          graph.isMouseTrigger = true
          var me = new mxMouseEvent(evt, state)
          graph.graphHandler.mouseDown(graph, me)
        }
      }, 10)
    } finally {
      model.endUpdate()
    }
  })
}

export function AddComponent (component, imgref) {
  var img = imgref

  // Instead of using mxDragSource (which uses a fake HTML image preview), 
  // we instantly place the real component on the graph and hand off the drag state.
  mxEvent.addListener(img, 'mousedown', function (evt) {
    if (mxEvent.isConsumed(evt)) {
      return;
    }
    
    // Prevent default drag-and-drop of the image element
    mxEvent.consume(evt);
    if (mxClient.IS_IE) evt.returnValue = false;

    var parent = graph.getDefaultParent()
    var model = graph.getModel()

    // Calculate initial drop coordinates mapping to the canvas
    var pt = mxUtils.convertPoint(graph.container, evt.clientX, evt.clientY);

    // Create the fake HTML preview image
    var dragElt = document.createElement('img')
    dragElt.src = img.src
    dragElt.style.position = 'fixed'
    dragElt.style.zIndex = '9999'
    dragElt.style.opacity = '0.7'
    dragElt.style.pointerEvents = 'none' // so it doesn't block mouse events
    
    // Size it based on metadata
    var w = 120, h = 40
    if (component && component.metadata) {
      try {
        const meta = typeof component.metadata === 'string' ? JSON.parse(component.metadata) : component.metadata;
        if (meta && meta.dimensions) {
          w = meta.dimensions.width
          h = meta.dimensions.height
        }
      } catch (e) {}
    }
    dragElt.style.width = w + 'px'
    dragElt.style.height = h + 'px'
    dragElt.style.left = (evt.clientX - w/2) + 'px'
    dragElt.style.top = (evt.clientY - h/2) + 'px'
    document.body.appendChild(dragElt)

    // Move the HTML preview with the mouse, but hide it if it's over the canvas
    var previewMouseMove = function(e) {
      dragElt.style.left = (e.clientX - w/2) + 'px'
      dragElt.style.top = (e.clientY - h/2) + 'px'
      
      var rect = graph.container.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
         dragElt.style.visibility = 'hidden'
      } else {
         dragElt.style.visibility = 'visible'
      }
    }

    var previewMouseUp = function(e) {
      if (dragElt.parentNode) {
         dragElt.parentNode.removeChild(dragElt)
      }
      document.removeEventListener('mousemove', previewMouseMove)
      document.removeEventListener('mouseup', previewMouseUp)
    }

    document.addEventListener('mousemove', previewMouseMove)
    document.addEventListener('mouseup', previewMouseUp)

    model.beginUpdate()
    try {
      getSvgMetadata(graph, parent, evt, null, pt.x, pt.y, component).then(v1 => {
        graph.setSelectionCell(v1)
        graph.refresh()
        
        // Wait 1 tick for the DOM to fully render the new component (pins, labels, etc.)
        setTimeout(() => {
          var state = graph.view.getState(v1)
          if (state) {
            graph.isMouseDown = true
            graph.isMouseTrigger = true
            
            // Construct a synthetic mouse event and force mxGraphHandler to grab it
            var me = new mxMouseEvent(evt, state)
            graph.graphHandler.mouseDown(graph, me)

            // After the user releases the mouse, perform magnetic snap
            var doSnap = function () {
              magneticSnap(v1)
              document.removeEventListener('mouseup', doSnap)
            }
            document.addEventListener('mouseup', doSnap)
          }
        }, 10)
      }).catch(err => console.error('Error inserting component:', err))
    } finally {
      model.endUpdate()
    }
  })
}
