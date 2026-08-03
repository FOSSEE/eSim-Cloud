/**
 * SchematicCanvas.jsx — declarative React SVG schematic canvas.
 *
 * Replaces the legacy mxGraph container. Rendering is split into memoized
 * layers (grid / wires / junctions / components / probes / overlay) so that
 * high-frequency interactions (wire routing, drags, marquee) only re-render
 * the thin overlay, driven by interactionStore refs.
 */

/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useReducer, useMemo, useCallback } from 'react'
import store from '../../../redux/store'
import * as actions from '../../../redux/actions/actions'
import {
  GRID_SIZE, screenToCanvas, zoomAtPoint, snap, snapPoint,
  pinAbsolutePosition, componentBBox,
  wiresAttachedToComponents, applyWireStretch
} from './geometry'
import { schematicStore } from './schematicStore'
import { interactionStore, useInteractionState } from './interactionStore'
import useSchematicWiring from './useSchematicWiring'
import { computeJunctions, snapProbeToWire } from './junctions'

const WIRE_COLOR = '#00695c'
const WIRE_SELECTED = '#1976d2'
const PIN_COLOR = '#d32f2f'
const JUNCTION_COLOR = '#004d40'

/** Library svgs are repo-relative; import placeholders are data URIs */
function svgHref (path) {
  return path && path.startsWith('data:') ? path : '../' + path
}

/** Subscribe to the committed schematic document */
function useSchematicState () {
  const [, force] = useReducer((c) => c + 1, 0)
  useEffect(() => schematicStore.subscribe(force), [])
  return schematicStore.getState()
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

const GridLayer = React.memo(function GridLayer ({ view, size }) {
  // Visible canvas-space rect for the pattern fill
  const x = -view.dx / view.s
  const y = -view.dy / view.s
  const w = size.width / view.s
  const h = size.height / view.s
  return (
    <g id="grid-layer" pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="url(#sch-grid-dots)" />
    </g>
  )
})

function wirePath (points) {
  let d = 'M ' + points[0].x + ' ' + points[0].y
  for (let i = 1; i < points.length; i++) d += ' L ' + points[i].x + ' ' + points[i].y
  return d
}

const WireItem = React.memo(function WireItem ({ wire, selected, nodeName, onMouseDown }) {
  const mid = wire.points[Math.floor((wire.points.length - 1) / 2)]
  return (
    <g data-wire-id={wire.id} onMouseDown={(e) => onMouseDown(e, wire.id)}>
      {/* invisible fat hit area */}
      <path d={wirePath(wire.points)} stroke="transparent" strokeWidth={10} fill="none" />
      <path
        d={wirePath(wire.points)}
        stroke={selected ? WIRE_SELECTED : WIRE_COLOR}
        strokeWidth={selected ? 2.5 : 1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {nodeName !== undefined && (
        <text x={mid.x + 4} y={mid.y - 4} fontSize={9} fill="#7b1fa2" fontFamily="monospace">
          {nodeName}
        </text>
      )}
    </g>
  )
})

const WireLayer = React.memo(function WireLayer ({ wires, selection, nodeNames, onWireMouseDown }) {
  const selected = useMemo(() => new Set(selection), [selection])
  return (
    <g id="wire-layer">
      {wires.map((w) => (
        <WireItem
          key={w.id}
          wire={w}
          selected={selected.has(w.id)}
          nodeName={nodeNames[w.id]}
          onMouseDown={onWireMouseDown}
        />
      ))}
    </g>
  )
})

const JunctionLayer = React.memo(function JunctionLayer ({ wires, components }) {
  const junctions = useMemo(() => computeJunctions(wires, components), [wires, components])
  return (
    <g id="junction-layer" pointerEvents="none">
      {junctions.map((j, i) => (
        <circle key={i} cx={j.x} cy={j.y} r={3.2} fill={JUNCTION_COLOR} />
      ))}
    </g>
  )
})

const ComponentItem = React.memo(function ComponentItem ({ comp, selected, onMouseDown, onDoubleClick }) {
  const w = comp.width
  const h = comp.height
  const cx = comp.x + w / 2
  const cy = comp.y + h / 2
  const bbox = componentBBox(comp)
  const label = (comp.properties && comp.properties.PREFIX) || comp.name
  return (
    <g data-component-id={comp.id}>
      <g
        transform={`translate(${cx} ${cy}) rotate(${comp.rotation || 0}) translate(${-w / 2} ${-h / 2})`}
        onMouseDown={(e) => onMouseDown(e, comp.id)}
        onDoubleClick={(e) => onDoubleClick(e, comp.id)}
        style={{ cursor: 'move' }}
      >
        <rect x={-2} y={-2} width={w + 4} height={h + 4} fill="transparent" />
        <image href={svgHref(comp.svgPath)} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />
        {comp.pins.map((pin) => (
          <circle key={pin.number} cx={pin.dx} cy={pin.dy} r={1.8} fill={PIN_COLOR} />
        ))}
      </g>
      <text
        x={bbox.x + bbox.width / 2}
        y={bbox.y + bbox.height + 12}
        textAnchor="middle"
        fontSize={10}
        fill="#1565c0"
        fontWeight="bold"
        pointerEvents="none"
      >
        {label}
      </text>
      {selected && (
        <rect
          x={bbox.x - 4}
          y={bbox.y - 4}
          width={bbox.width + 8}
          height={bbox.height + 8}
          fill="none"
          stroke={WIRE_SELECTED}
          strokeDasharray="4 3"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </g>
  )
})

const ComponentLayer = React.memo(function ComponentLayer ({ components, selection, onCompMouseDown, onCompDoubleClick }) {
  const selected = useMemo(() => new Set(selection), [selection])
  return (
    <g id="component-layer">
      {components.map((c) => (
        <ComponentItem
          key={c.id}
          comp={c}
          selected={selected.has(c.id)}
          onMouseDown={onCompMouseDown}
          onDoubleClick={onCompDoubleClick}
        />
      ))}
    </g>
  )
})

function ProbeGlyph ({ probe }) {
  return (
    <g>
      <polygon points="25,35 10,45 20,30" fill="#888888" />
      <rect x="9" y="4" width="32" height="32" rx="4" fill={probe.color} stroke="#ffffff" strokeWidth="2" />
      <text x="25" y="26" textAnchor="middle" fontFamily="sans-serif" fontSize="18" fontWeight="bold" fill="#ffffff">
        {probe.probeType === 'I' ? 'A' : 'V'}
      </text>
      <text x="30" y="-4" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fontStyle="italic" fill="#666666">
        {probe.label}
      </text>
    </g>
  )
}

const ProbeLayer = React.memo(function ProbeLayer ({ probes, selection, onProbeMouseDown }) {
  const selected = useMemo(() => new Set(selection), [selection])
  return (
    <g id="probe-layer">
      {probes.map((p) => (
        <g
          key={p.id}
          transform={`translate(${p.x} ${p.y})`}
          onMouseDown={(e) => onProbeMouseDown(e, p.id)}
          style={{ cursor: 'move' }}
        >
          <ProbeGlyph probe={p} />
          {selected.has(p.id) && (
            <rect x={-3} y={-3} width={66} height={56} fill="none" stroke={WIRE_SELECTED} strokeDasharray="4 3" />
          )}
        </g>
      ))}
    </g>
  )
})

const MiniMap = React.memo(function MiniMap ({ components, wires, view, size }) {
  const MM_W = 180
  const MM_H = 130
  const bounds = useMemo(() => {
    if (components.length === 0 && wires.length === 0) return null
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
    for (const c of components) {
      const b = componentBBox(c)
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    }
    for (const w of wires) {
      for (const p of w.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
      }
    }
    return { minX, minY, maxX, maxY }
  }, [components, wires])

  if (!bounds) return null
  const pad = 10
  const bw = Math.max(bounds.maxX - bounds.minX, 1)
  const bh = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min((MM_W - pad * 2) / bw, (MM_H - pad * 2) / bh, 2)
  const ox = (MM_W - bw * scale) / 2 - bounds.minX * scale
  const oy = (MM_H - bh * scale) / 2 - bounds.minY * scale

  return (
    <g id="minimap-layer" transform={`translate(${size.width - MM_W - 15} ${size.height - MM_H - 15})`} pointerEvents="none">
      <rect width={MM_W} height={MM_H} rx={5} fill="#ffffff" stroke="#ccc" opacity={0.92} />
      <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
        {wires.map((w) => (
          <path key={w.id} d={wirePath(w.points)} stroke={WIRE_COLOR} strokeWidth={1.5 / scale} fill="none" />
        ))}
        {components.map((c) => (
          <image
            key={c.id}
            href={svgHref(c.svgPath)}
            x={c.x} y={c.y} width={c.width} height={c.height}
            preserveAspectRatio="none"
            transform={c.rotation
              ? `rotate(${c.rotation} ${c.x + c.width / 2} ${c.y + c.height / 2})`
              : undefined}
          />
        ))}
      </g>
    </g>
  )
})

/**
 * InteractionOverlay — the only layer that re-renders on mousemove.
 * Draws the active wire draft, drag ghosts, placement ghosts, snap dot
 * and the marquee. Also keeps the svg cursor in sync with the tool.
 */
function InteractionOverlay ({ svgRef }) {
  const { wireDraft, dragGhost, placingGhost, marquee, snapIndicator, tool } = useInteractionState()

  useEffect(() => {
    if (svgRef.current) {
      svgRef.current.style.cursor = tool === 'wire' ? 'crosshair' : 'default'
    }
  }, [tool, svgRef])

  return (
    <g id="interaction-overlay" pointerEvents="none">
      {wireDraft && wireDraft.points.length > 0 && (
        <path d={wirePath(wireDraft.points)} stroke={WIRE_COLOR} strokeWidth={1.6} fill="none" />
      )}
      {wireDraft && wireDraft.preview && (
        <path d={wirePath(wireDraft.preview)} stroke={WIRE_SELECTED} strokeWidth={1.6} strokeDasharray="5 3" fill="none" />
      )}
      {snapIndicator && (
        <circle
          cx={snapIndicator.x} cy={snapIndicator.y} r={snapIndicator.magnetic ? 5 : 3}
          fill="none" stroke={snapIndicator.magnetic ? '#e91e63' : '#9e9e9e'} strokeWidth={1.5}
        />
      )}
      {dragGhost && dragGhost.stretched && dragGhost.stretched.map((w) => (
        <path key={w.id} d={wirePath(w.points)} stroke={WIRE_SELECTED} strokeWidth={1.6} fill="none" opacity={0.55} />
      ))}
      {dragGhost && dragGhost.items.map((item) => (
        <g key={item.id} transform={`translate(${dragGhost.dx} ${dragGhost.dy})`} opacity={0.55}>
          {item.kind === 'component' && (
            <image
              href={svgHref(item.comp.svgPath)}
              x={item.comp.x} y={item.comp.y}
              width={item.comp.width} height={item.comp.height}
              preserveAspectRatio="none"
              transform={item.comp.rotation
                ? `rotate(${item.comp.rotation} ${item.comp.x + item.comp.width / 2} ${item.comp.y + item.comp.height / 2})`
                : undefined}
            />
          )}
          {item.kind === 'wire' && (
            <path d={wirePath(item.wire.points)} stroke={WIRE_SELECTED} strokeWidth={1.6} fill="none" />
          )}
          {item.kind === 'probe' && (
            <g transform={`translate(${item.probe.x} ${item.probe.y})`}>
              <ProbeGlyph probe={item.probe} />
            </g>
          )}
        </g>
      ))}
      {placingGhost && placingGhost.kind === 'component' && placingGhost.schema && (
        <image
          href={svgHref(placingGhost.schema.svgPath)}
          x={placingGhost.x - placingGhost.schema.width / 2}
          y={placingGhost.y - placingGhost.schema.height / 2}
          width={placingGhost.schema.width}
          height={placingGhost.schema.height}
          opacity={0.6}
        />
      )}
      {placingGhost && placingGhost.kind === 'probe' && (
        <g transform={`translate(${placingGhost.x - 30} ${placingGhost.y - 25})`} opacity={0.6}>
          <ProbeGlyph probe={{ color: placingGhost.color || '#00e676', probeType: placingGhost.probeType, label: '' }} />
        </g>
      )}
      {marquee && (
        <rect
          x={Math.min(marquee.x0, marquee.x1)}
          y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)}
          height={Math.abs(marquee.y1 - marquee.y0)}
          fill="rgba(25, 118, 210, 0.08)"
          stroke={WIRE_SELECTED}
          strokeDasharray="4 3"
        />
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export default function SchematicCanvas () {
  const svgRef = useRef(null)
  const state = useSchematicState()
  const wiring = useSchematicWiring()
  const [size, setSize] = React.useState({ width: 800, height: 600 })
  const [showMiniMap, setShowMiniMap] = React.useState(true)

  // Refs for gesture state — never trigger renders
  const gesture = useRef(null) // { type: 'pan'|'drag'|'marquee', ... }
  const rafZoom = useRef(null)
  const mouseCanvasPos = useRef({ x: 0, y: 0 })

  const view = state.view

  const toCanvas = useCallback((evt) => {
    const rect = svgRef.current.getBoundingClientRect()
    return screenToCanvas(evt.clientX - rect.left, evt.clientY - rect.top, schematicStore.getState().view)
  }, [])

  // ---- resize tracking ----
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width || 800, height: rect.height || 600 })
    }
    update()
    window.addEventListener('resize', update)
    // The container also resizes without a window resize (e.g. the
    // simulation split view) — observe it directly when supported.
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(el)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (observer) observer.disconnect()
    }
  }, [])

  // ---- redux bridge: properties dialog -> component state ----
  useEffect(() => {
    let lastProps = null
    return store.subscribe(() => {
      const slice = store.getState().componentPropertiesReducer
      if (slice.compProperties !== lastProps && slice.id) {
        lastProps = slice.compProperties
        const comp = schematicStore.getComponent(String(slice.id))
        if (comp && comp.properties !== slice.compProperties) {
          schematicStore.setComponentProperties(String(slice.id), slice.compProperties)
        }
      }
    })
  }, [])

  // ---- wheel: pointer-centred zoom, rAF-throttled ----
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (evt) => {
      evt.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = evt.clientX - rect.left
      const cy = evt.clientY - rect.top
      const factor = evt.deltaY < 0 ? 1.05 : 1 / 1.05
      if (!rafZoom.current) {
        rafZoom.current = { factor, cx, cy }
        requestAnimationFrame(() => {
          const z = rafZoom.current
          rafZoom.current = null
          if (!z) return
          const v = schematicStore.getState().view
          schematicStore.setView(zoomAtPoint(v, z.cx, z.cy, z.factor))
        })
      } else {
        rafZoom.current.factor *= factor
        rafZoom.current.cx = cx
        rafZoom.current.cy = cy
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- drag machinery (components / probes / wires) ----
  const beginCellDrag = useCallback((evt, cellId) => {
    if (wiring.isActive()) return // wire tool owns clicks
    evt.stopPropagation()
    const st = schematicStore.getState()
    const selection = st.selection.includes(cellId) ? st.selection : [cellId]
    schematicStore.setSelection(selection)

    const start = toCanvas(evt)
    const items = []
    for (const id of selection) {
      const comp = st.components.find((c) => c.id === id)
      if (comp) items.push({ id, kind: 'component', comp })
      const wire = st.wires.find((w) => w.id === id)
      if (wire) items.push({ id, kind: 'wire', wire })
      const probe = st.probes.find((p) => p.id === id)
      if (probe) items.push({ id, kind: 'probe', probe })
    }
    // Wires hanging off the dragged pins, classified once against the pre-move
    // positions so each mousemove only re-applies the delta.
    const attached = wiresAttachedToComponents(st.components, st.wires, new Set(selection))
    gesture.current = { type: 'drag', start, items, ids: selection, attached, moved: false }
  }, [toCanvas, wiring])

  const onCompMouseDown = useCallback((evt, id) => beginCellDrag(evt, id), [beginCellDrag])
  const onProbeMouseDown = useCallback((evt, id) => beginCellDrag(evt, id), [beginCellDrag])
  const onWireMouseDown = useCallback((evt, id) => {
    if (wiring.isActive()) return
    evt.stopPropagation()
    schematicStore.setSelection([id])
    // Wires are selectable but not draggable (KiCad-style)
    gesture.current = null
  }, [wiring])

  const onCompDoubleClick = useCallback((evt, id) => {
    evt.stopPropagation()
    const comp = schematicStore.getComponent(id)
    if (!comp) return
    store.dispatch({ type: actions.CLOSE_COMP_PROPERTIES_TEMP })
    store.dispatch({
      type: actions.GET_COMP_PROPERTIES,
      payload: { id: comp.id, compProperties: comp.properties, x: evt.clientX, y: evt.clientY }
    })
  }, [])

  // ---- background mouse handlers ----
  const onSvgMouseDown = useCallback((evt) => {
    if (evt.button !== 0) return
    const p = toCanvas(evt)
    if (wiring.isActive()) {
      wiring.handleClick(p)
      return
    }
    if (evt.shiftKey) {
      gesture.current = { type: 'marquee', start: p }
      interactionStore.set({ marquee: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } })
    } else {
      gesture.current = { type: 'pan', startClient: { x: evt.clientX, y: evt.clientY }, startView: schematicStore.getState().view }
      schematicStore.setSelection([])
      store.dispatch({ type: actions.CLOSE_COMP_PROPERTIES_TEMP })
    }
  }, [toCanvas, wiring])

  useEffect(() => {
    const onMove = (evt) => {
      if (!svgRef.current) return
      const p = toCanvas(evt)
      mouseCanvasPos.current = p
      wiring.handleMove(p)

      const g = gesture.current
      if (!g) return
      if (g.type === 'pan') {
        const dx = evt.clientX - g.startClient.x
        const dy = evt.clientY - g.startClient.y
        schematicStore.setView({ s: g.startView.s, dx: g.startView.dx + dx, dy: g.startView.dy + dy })
      } else if (g.type === 'marquee') {
        interactionStore.set({ marquee: { x0: g.start.x, y0: g.start.y, x1: p.x, y1: p.y } })
      } else if (g.type === 'drag') {
        g.moved = true
        // Grid-quantised delta
        let dx = snap(p.x - g.start.x)
        let dy = snap(p.y - g.start.y)
        // O(1) magnetic pin snap via the spatial index (single component only)
        const compItem = g.items.length === 1 && g.items[0].kind === 'component' ? g.items[0] : null
        if (compItem) {
          const index = schematicStore.getSpatialIndex()
          let best = null
          let bestD = GRID_SIZE
          for (const pin of compItem.comp.pins) {
            const ap = pinAbsolutePosition(compItem.comp, pin)
            const tx = ap.x + dx
            const ty = ap.y + dy
            for (const e of index.neighbourhood(tx, ty)) {
              if (e.isSegment || e.payload.kind !== 'pin' || e.payload.componentId === compItem.id) continue
              const d = Math.hypot(e.x - tx, e.y - ty)
              if (d < bestD) {
                bestD = d
                best = { dx: e.x - ap.x, dy: e.y - ap.y }
              }
            }
          }
          if (best) {
            dx = best.dx
            dy = best.dy
          }
        }
        // Probe: magnet the tip onto nearby wires while dragging
        const probeItem = g.items.length === 1 && g.items[0].kind === 'probe' ? g.items[0] : null
        if (probeItem) {
          const tip = { x: probeItem.probe.x + 10 + (p.x - g.start.x), y: probeItem.probe.y + 40 + (p.y - g.start.y) }
          const hit = snapProbeToWire(tip, schematicStore.getState().wires, 8)
          if (hit) {
            dx = hit.x - (probeItem.probe.x + 10)
            dy = hit.y - (probeItem.probe.y + 40)
          } else {
            dx = p.x - g.start.x
            dy = p.y - g.start.y
          }
        }
        g.dx = dx
        g.dy = dy
        // Rubber-band preview: points are already absolute, so the overlay
        // draws them outside the translate(dx, dy) applied to the ghost items.
        // Obstacles at post-move positions keep the ghost identical to commit.
        let stretched = null
        if (g.attached.length) {
          const idSet = new Set(g.ids)
          const obstacles = schematicStore.getState().components.map((c) =>
            componentBBox(idSet.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c))
          stretched = applyWireStretch(g.attached, dx, dy, obstacles)
        }
        interactionStore.set({ dragGhost: { items: g.items, dx, dy, stretched } })
      }
    }

    const onUp = () => {
      const g = gesture.current
      gesture.current = null
      if (!g) return
      if (g.type === 'marquee') {
        const m = interactionStore.getState().marquee
        interactionStore.set({ marquee: null })
        if (m) {
          const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
          const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
          const st = schematicStore.getState()
          const hit = []
          for (const c of st.components) {
            const b = componentBBox(c)
            if (b.x >= x0 && b.y >= y0 && b.x + b.width <= x1 && b.y + b.height <= y1) hit.push(c.id)
          }
          for (const w of st.wires) {
            if (w.points.every((pt) => pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1)) hit.push(w.id)
          }
          for (const pr of st.probes) {
            if (pr.x >= x0 && pr.y >= y0 && pr.x + 60 <= x1 && pr.y + 50 <= y1) hit.push(pr.id)
          }
          schematicStore.setSelection(hit)
        }
      } else if (g.type === 'drag') {
        interactionStore.set({ dragGhost: null })
        if (g.moved && (g.dx || g.dy)) {
          schematicStore.moveCells(g.ids, g.dx, g.dy)
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [toCanvas, wiring])

  const onSvgDoubleClick = useCallback((evt) => {
    if (wiring.isDrawing()) {
      wiring.finalize()
      return
    }
    if (evt.target === svgRef.current || evt.target.id === 'sch-bg') {
      store.dispatch({ type: actions.CLOSE_COMP_PROPERTIES })
    }
  }, [wiring])

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement
      const tag = el ? el.tagName.toUpperCase() : ''
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)
    }

    const onKeyDown = (evt) => {
      // Block browser refresh on Ctrl+R (legacy behaviour: rotate instead)
      if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'r' || evt.key === 'R')) {
        evt.preventDefault()
      }
      if (isTyping()) return

      const ctrl = evt.ctrlKey || evt.metaKey
      const key = evt.key

      if (!ctrl && !evt.altKey) {
        if (key === 'm' || key === 'M') {
          setShowMiniMap(show => !show)
          return
        }
        if (key === 'w' || key === 'W') {
          // W toggles the wire tool
          if (wiring.isActive()) wiring.exitWireMode()
          else wiring.enterWireMode()
          return
        }
        if (key === 'Escape') {
          if (!wiring.cancel()) schematicStore.setSelection([])
          return
        }
        if (key === 'Enter') {
          if (wiring.isDrawing()) {
            evt.preventDefault()
            wiring.finalize()
          } else if (wiring.isActive()) {
            wiring.handleClick(mouseCanvasPos.current)
          }
          return
        }
        if (key === 'End' && wiring.isDrawing()) {
          wiring.finalize()
          return
        }
        if (key === ' ' && evt.shiftKey) {
          evt.preventDefault()
          wiring.toggleDirection()
          return
        }
        if (key === 'Delete') {
          if (evt.shiftKey) schematicStore.clearAll()
          else schematicStore.deleteSelection()
          return
        }
        if (key === 'v' || key === 'V') {
          // Instant voltage probe at the cursor
          const p = mouseCanvasPos.current
          const hit = snapProbeToWire({ x: p.x, y: p.y }, schematicStore.getState().wires, 20)
          const tipX = hit ? hit.x : p.x
          const tipY = hit ? hit.y : p.y
          schematicStore.addProbe({ probeType: 'V', color: nextProbeColor(), x: tipX - 10, y: tipY - 40 })
          return
        }
      }

      if (evt.altKey && key === 'ArrowRight') {
        rotateSelection(90)
        return
      }
      if (evt.altKey && key === 'ArrowLeft') {
        rotateSelection(-90)
        return
      }

      if (ctrl) {
        if (key === 'z' || key === 'Z') {
          evt.preventDefault()
          evt.stopPropagation()
          if (evt.shiftKey) schematicStore.redo()
          else schematicStore.undo()
        } else if (key === 'y') {
          // legacy: zoom-to-actual
          evt.stopPropagation()
          schematicStore.setView({ s: 1, dx: 0, dy: 0 })
        } else if (key === 'c') {
          evt.stopPropagation()
          schematicStore.copySelection()
        } else if (key === 'v') {
          evt.stopPropagation()
          schematicStore.paste(mouseCanvasPos.current)
        } else if (key === 'r' || key === 'R') {
          evt.stopPropagation()
          rotateSelection(90)
        } else if (key === '=' || key === '+') {
          evt.preventDefault()
          evt.stopPropagation()
          zoomCentre(1.2)
        } else if (key === '-') {
          evt.preventDefault()
          evt.stopPropagation()
          zoomCentre(1 / 1.2)
        } else if (key === 'a') {
          evt.preventDefault()
          evt.stopPropagation()
          schematicStore.selectAll()
        }
      }
    }

    const zoomCentre = (factor) => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const v = schematicStore.getState().view
      schematicStore.setView(zoomAtPoint(v, rect.width / 2, rect.height / 2, factor))
    }

    const rotateSelection = (delta) => {
      const st = schematicStore.getState()
      for (const id of st.selection) {
        if (st.components.some((c) => c.id === id)) schematicStore.rotateComponent(id, delta)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [wiring])

  return (
    <svg
      ref={svgRef}
      id="schematic-canvas"
      width="100%"
      height="100%"
      style={{ display: 'block', outline: 'none', userSelect: 'none' }}
      onMouseDown={onSvgMouseDown}
      onDoubleClick={onSvgDoubleClick}
      tabIndex={-1}
    >
      <defs>
        <pattern id="sch-grid-dots" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <circle cx={0.75} cy={0.75} r={0.75} fill="#b0bec5" />
        </pattern>
      </defs>
      <rect id="sch-bg" width="100%" height="100%" fill="transparent" />
      <g id="canvas-transform" transform={`translate(${view.dx} ${view.dy}) scale(${view.s})`}>
        <GridLayer view={view} size={size} />
        <WireLayer
          wires={state.wires}
          selection={state.selection}
          nodeNames={state.nodeNames}
          onWireMouseDown={onWireMouseDown}
        />
        <JunctionLayer wires={state.wires} components={state.components} />
        <ComponentLayer
          components={state.components}
          selection={state.selection}
          onCompMouseDown={onCompMouseDown}
          onCompDoubleClick={onCompDoubleClick}
        />
        <ProbeLayer probes={state.probes} selection={state.selection} onProbeMouseDown={onProbeMouseDown} />
        <InteractionOverlay svgRef={svgRef} />
      </g>
      {showMiniMap && (
        <MiniMap components={state.components} wires={state.wires} view={view} size={size} />
      )}
    </svg>
  )
}

const PROBE_COLORS = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf']

export function nextProbeColor () {
  return PROBE_COLORS[schematicStore.getState().probes.length % PROBE_COLORS.length]
}

// Re-exported for placement code (SideBar.js drag-drop)
export { snapPoint }
