/* eslint-disable new-cap */
import MxGraphFactory from 'mxgraph'
import { Undo, Redo, ZoomIn, ZoomOut, ZoomAct, DeleteComp, ClearGrid, Rotate, RotateACW, CopyComponents, PasteComponents } from './ToolbarTools'
import { PlaceProbeAt } from './SideBar'

const {
  mxKeyHandler,
  mxEvent,
  mxClient
} = new MxGraphFactory()

export default function KeyboardShortcuts (graph) {
  var globalMouseX = 0
  var globalMouseY = 0
  document.addEventListener('mousemove', function (evt) {
    globalMouseX = evt.clientX
    globalMouseY = evt.clientY
  })

  // Global intercept for document-level shortcuts
  document.addEventListener('keydown', function (evt) {
    // 1. Block browser refresh on Ctrl+R / Cmd+R
    if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'r' || evt.key === 'R')) {
      evt.preventDefault()
    }

    // 2. Ignore global single-key shortcuts if the user is typing in an input field
    var activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : ''
    var isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)
    
    if (!isTyping && graph.isEnabled() && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
      
      // V key — instant spawn Voltage Probe
      if (evt.key === 'v' || evt.key === 'V') {
        PlaceProbeAt('V', globalMouseX, globalMouseY)
      }
    }
  })

  var keyHandler = new mxKeyHandler(graph)

  keyHandler.getFunction = function (evt) {
    if (evt != null) {
      return (mxEvent.isControlDown(evt) || (mxClient.IS_MAC && evt.metaKey)) ? this.controlKeys[evt.keyCode] : this.normalKeys[evt.keyCode]
    }

    return null
  }

  // Rotate Alt + (right arrow)
  keyHandler.bindKey(39, function (evt) {
    if (graph.isEnabled) {
      if (evt.altKey) {
        Rotate()
      }
    }
  })

  // Rotate Alt + (left Arrow)
  keyHandler.bindKey(37, function (evt) {
    if (graph.isEnabled) {
      if (evt.altKey) {
        RotateACW()
      }
    }
  })

  // Delete - Del / Clear All - Shift + Del
  keyHandler.bindKey(46, function (evt) {
    if (graph.isEnabled()) {
      if (evt.shiftKey) {
        ClearGrid()
      } else {
        DeleteComp()
      }
    }
  })

  // Undo - Ctrl + Z / Redo - Ctrl + Shift + Z
  keyHandler.bindControlKey(90, function (evt) {
    if (graph.isEnabled()) {
      if (evt.ctrlKey && !evt.shiftKey) {
        Undo()
      } else if (evt.ctrlKey && evt.shiftKey) {
        Redo()
      }
    }
  })

  // Zoom In - Ctrl + +
  keyHandler.bindControlKey(187, function (evt) {
    evt.preventDefault()
    if (graph.isEnabled()) {
      ZoomIn()
    }
  })
  keyHandler.bindControlKey(107, function (evt) {
    evt.preventDefault()
    if (graph.isEnabled()) {
      ZoomIn()
    }
  })

  // Zoom Out - Ctrl + -
  keyHandler.bindControlKey(189, function (evt) {
    evt.preventDefault()
    if (graph.isEnabled()) {
      ZoomOut()
    }
  })
  keyHandler.bindControlKey(109, function (evt) {
    evt.preventDefault()
    if (graph.isEnabled()) {
      ZoomOut()
    }
  })

  // Zoom Act - Ctrl + Y
  keyHandler.bindControlKey(89, function (evt) {
    if (graph.isEnabled()) {
      ZoomAct()
    }
  })

  // Rotate Clockwise - Ctrl + R (preventDefault stops browser page refresh)
  keyHandler.bindControlKey(82, function (evt) {
    evt.preventDefault()
    if (graph.isEnabled()) {
      Rotate()
    }
  })

  // Copy - Ctrl + C
  keyHandler.bindControlKey(67, function (evt) {
    if (graph.isEnabled()) {
      CopyComponents()
    }
  })

  // Paste - Ctrl + V
  keyHandler.bindControlKey(86, function (evt) {
    if (graph.isEnabled()) {
      PasteComponents()
    }
  })
  // (V key is handled by the global document listener above to avoid focus issues)
}
