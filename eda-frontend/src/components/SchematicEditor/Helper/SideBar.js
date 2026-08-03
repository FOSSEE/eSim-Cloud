/**
 * SideBar.js — component/probe placement onto the React SVG canvas.
 *
 * The sidebar thumbnails push standard component descriptors straight into
 * the canvas state on drop; while dragging, a ghost preview is drawn in the
 * canvas interaction overlay (snapped to grid) or as an HTML element when
 * the pointer is outside the canvas.
 */

import { fetchSymbolSchema, initialProperties } from './SvgParser.js'
import ComponentParameters from './ComponentParametersData'
import { schematicStore } from '../Canvas/schematicStore'
import { interactionStore } from '../Canvas/interactionStore'
import { screenToCanvas, snapPoint, projectOntoSegment, wireSegments } from '../Canvas/geometry'
import { snapProbeToWire } from '../Canvas/junctions'

/** Legacy bootstrap hook — the declarative canvas needs no graph handle. */
export function SideBar () {}

function canvasEl () {
  return document.getElementById('schematic-canvas')
}

function clientToCanvas (clientX, clientY) {
  const el = canvasEl()
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null
  }
  return screenToCanvas(clientX - rect.left, clientY - rect.top, schematicStore.getState().view)
}

// ----- Magnetic Snap -----

/**
 * After a component is placed or moved, if one of its pins is within
 * tolerance of another component's pin, shift the component so the pins
 * coincide exactly. Connectivity then follows from coordinate identity
 * in the DSU netlist compiler — no explicit edge required.
 *
 * Accepts a component id (new canvas) for compatibility with old call sites.
 */
export function magneticSnap (componentIdOrCell) {
  const id = typeof componentIdOrCell === 'object' && componentIdOrCell !== null
    ? componentIdOrCell.id
    : componentIdOrCell
  const delta = schematicStore.magneticSnapDelta(String(id))
  if (delta && (delta.dx || delta.dy)) {
    schematicStore.moveCells([String(id)], delta.dx, delta.dy, { undoable: false })
  }
}

/**
 * Find the nearest wire to a canvas point.
 * @returns {{wire, x, y, d} | null} wire plus the projected point
 */
export function findNearestWire (gx, gy, tolerance = 30) {
  let best = null
  for (const wire of schematicStore.getState().wires) {
    for (const [a, b] of wireSegments(wire)) {
      const pr = projectOntoSegment({ x: gx, y: gy }, a, b)
      if (pr.d < tolerance && (!best || pr.d < best.d)) {
        best = { wire, x: pr.x, y: pr.y, d: pr.d }
      }
    }
  }
  return best
}

/** Find the nearest voltage-source pin to a canvas point. */
export function findNearestVSourcePin (gx, gy, tolerance = 30) {
  let best = null
  let bestD = tolerance
  for (const p of schematicStore.getAllPinPositions()) {
    const sym = (p.component.symbol || '').toUpperCase()
    if (sym !== 'V') continue
    const d = Math.hypot(p.x - gx, p.y - gy)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

// ----- Probe placement -----

const PROBE_COLORS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf']

function getNextProbeColor () {
  return PROBE_COLORS[schematicStore.getState().probes.length % PROBE_COLORS.length]
}

/**
 * Instantly place a probe at the given screen coordinates; the probe tip
 * magnetically snaps onto a nearby wire and inherits its electrical node.
 */
export function PlaceProbeAt (probeType, clientX, clientY) {
  const p = clientToCanvas(clientX, clientY)
  if (!p) return
  const hit = snapProbeToWire(p, schematicStore.getState().wires, 20)
  const tipX = hit ? hit.x : p.x
  const tipY = hit ? hit.y : p.y
  // Probe glyph is 60x50 with the tip at (x+10, y+40)
  schematicStore.addProbe({
    probeType,
    color: getNextProbeColor(),
    x: tipX - 10,
    y: tipY - 40
  })
}

// ----- Shared drag-from-sidebar machinery -----

function startSidebarDrag (evt, { ghostEl, onOverCanvas, onDrop }) {
  evt.preventDefault()
  document.body.appendChild(ghostEl)

  const positionGhost = (e) => {
    ghostEl.style.left = (e.clientX - 14) + 'px'
    ghostEl.style.top = (e.clientY - 14) + 'px'
  }
  positionGhost(evt)

  const onMove = (e) => {
    positionGhost(e)
    const p = clientToCanvas(e.clientX, e.clientY)
    if (p) {
      ghostEl.style.visibility = 'hidden'
      onOverCanvas(snapPoint(p))
    } else {
      ghostEl.style.visibility = 'visible'
      interactionStore.set({ placingGhost: null })
    }
  }

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    if (ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl)
    interactionStore.set({ placingGhost: null })
    const p = clientToCanvas(e.clientX, e.clientY)
    if (p) onDrop(snapPoint(p))
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function makeHtmlGhost (styleExtra) {
  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed',
    'z-index:9999',
    'opacity:0.85',
    'pointer-events:none',
    'display:flex',
    'align-items:center',
    'justify-content:center'
  ].join(';') + ';' + styleExtra
  return el
}

/**
 * Register a sidebar thumbnail as a drag source that places the component
 * descriptor into the canvas state on drop.
 */
export function AddComponent (component, imgref) {
  if (!imgref) return
  imgref.addEventListener('mousedown', (evt) => {
    if (evt.button !== 0) return

    // HTML ghost shown while outside the canvas
    const ghost = document.createElement('img')
    ghost.src = imgref.src
    ghost.style.cssText = 'position:fixed;z-index:9999;opacity:0.7;pointer-events:none;width:80px;'

    // Resolve pins/dimensions (cached after the first drag of this symbol)
    let schema = null
    fetchSymbolSchema(component)
      .then((s) => { schema = s })
      .catch((err) => console.error('Error loading symbol:', err))

    startSidebarDrag(evt, {
      ghostEl: ghost,
      onOverCanvas: (p) => {
        if (schema) {
          interactionStore.set({ placingGhost: { kind: 'component', schema, x: p.x, y: p.y } })
        }
      },
      onDrop: (p) => {
        const place = (s) => {
          const name = (component.name || '').toUpperCase()
          const id = schematicStore.addComponent({
            name,
            symbol: (component.symbol_prefix || '').toUpperCase(),
            x: p.x - s.width / 2,
            y: p.y - s.height / 2,
            width: s.width,
            height: s.height,
            rotation: 0,
            svgPath: component.svg_path,
            compObject: component,
            properties: initialProperties(component, ComponentParameters),
            pins: s.pins.map((pin) => ({
              number: pin.number,
              name: pin.name,
              type: pin.type,
              dx: pin.dx,
              dy: pin.dy
            }))
          })
          magneticSnap(id)
        }
        if (schema) place(schema)
        else fetchSymbolSchema(component).then(place).catch((err) => console.error(err))
      }
    })
  })
}

/**
 * Register a probe tile as a drag source. Voltage probes snap to wires.
 */
export function AddProbe (probeType, imgref) {
  if (!imgref) return
  imgref.addEventListener('mousedown', (evt) => {
    if (evt.button !== 0) return
    const color = getNextProbeColor()
    const ghost = makeHtmlGhost([
      'width:28px',
      'height:28px',
      'border-radius:4px',
      'background:#1a1a2e',
      'border:2.5px solid ' + color,
      'color:' + color,
      'font-size:14px',
      'font-weight:bold',
      'font-family:monospace,sans-serif',
      'box-shadow:0 0 8px ' + color
    ].join(';'))
    ghost.textContent = probeType === 'I' ? 'A' : 'V'

    startSidebarDrag(evt, {
      ghostEl: ghost,
      onOverCanvas: (p) => {
        interactionStore.set({ placingGhost: { kind: 'probe', probeType, color, x: p.x, y: p.y } })
      },
      onDrop: (p) => {
        const hit = snapProbeToWire(p, schematicStore.getState().wires, 20)
        const tipX = hit ? hit.x : p.x
        const tipY = hit ? hit.y : p.y
        schematicStore.addProbe({ probeType, color, x: tipX - 10, y: tipY - 40 })
      }
    })
  })
}
