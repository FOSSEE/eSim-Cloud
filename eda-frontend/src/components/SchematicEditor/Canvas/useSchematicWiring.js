/**
 * useSchematicWiring.js — KiCad-style interactive wiring state machine.
 *
 * Modes:
 *   idle     — wire tool off
 *   armed    — wire tool on ('W'), waiting for the first anchor click
 *   drawing  — anchor placed; segments follow the cursor (no button held)
 *
 * Interactions:
 *   W               enter wire mode (crosshair cursor)
 *   click / Enter   armed: start at snapped point (magnet to pins/wires)
 *                   drawing: place a corner; clicking a pin/wire terminates
 *   Shift+Space     toggle L-route direction (H-then-V vs V-then-H)
 *   dblclick / End  terminate in empty space
 *   Escape          cancel active wire, second Escape exits the tool
 *
 * All per-mousemove state lives in refs + interactionStore so only the
 * overlay layer re-renders while routing.
 */

import { useRef, useCallback } from 'react'
import { snapPoint, routeManhattan, componentBBox } from './geometry'
import { schematicStore } from './schematicStore'
import { interactionStore } from './interactionStore'

const MAGNET_TOLERANCE = 8

/** Component bodies the router must not cross, cached per committed doc */
let obstaclesCache = null
let obstaclesFor = null
function componentObstacles () {
  const comps = schematicStore.getState().components
  if (obstaclesFor !== comps) {
    obstaclesCache = comps.map(componentBBox)
    obstaclesFor = comps
  }
  return obstaclesCache
}

export default function useSchematicWiring () {
  // 'idle' | 'armed' | 'drawing'
  const phaseRef = useRef('idle')
  const pointsRef = useRef([]) // committed pivot points of the active wire
  const dirRef = useRef('HV')
  const cursorRef = useRef(null)

  /** Snap a raw canvas point: magnet to pins/wire segments, else grid */
  const magnetSnap = useCallback((p) => {
    const index = schematicStore.getSpatialIndex()
    const nearPin = index.nearestPoint(p.x, p.y, MAGNET_TOLERANCE)
    if (nearPin) return { x: nearPin.x, y: nearPin.y, target: nearPin.payload }
    const nearSeg = index.nearestSegment(p.x, p.y, MAGNET_TOLERANCE)
    if (nearSeg) {
      const sp = snapPoint({ x: nearSeg.x, y: nearSeg.y })
      return { x: sp.x, y: sp.y, target: nearSeg.payload }
    }
    const sp = snapPoint(p)
    return { x: sp.x, y: sp.y, target: null }
  }, [])

  const publishDraft = useCallback(() => {
    if (phaseRef.current !== 'drawing' || !cursorRef.current) {
      interactionStore.set({ wireDraft: null })
      return
    }
    const last = pointsRef.current[pointsRef.current.length - 1]
    const cursor = cursorRef.current
    const corners = routeManhattan(last, cursor, dirRef.current, componentObstacles())
    interactionStore.set({
      wireDraft: {
        points: pointsRef.current,
        preview: [last, ...corners, { x: cursor.x, y: cursor.y }],
        dir: dirRef.current
      }
    })
  }, [])

  const setPhase = useCallback((phase) => {
    phaseRef.current = phase
    interactionStore.set({ tool: phase === 'idle' ? 'select' : 'wire' })
    if (phase !== 'drawing') {
      pointsRef.current = []
      cursorRef.current = null
      interactionStore.set({ wireDraft: null, snapIndicator: null })
    }
  }, [])

  const enterWireMode = useCallback(() => {
    if (phaseRef.current === 'idle') setPhase('armed')
  }, [setPhase])

  const exitWireMode = useCallback(() => {
    // Keep the segments already anchored (start → last pivot); only the
    // cursor-following preview segment is discarded.
    if (phaseRef.current === 'drawing' && pointsRef.current.length >= 2) {
      schematicStore.addWire(pointsRef.current)
    }
    setPhase('idle')
  }, [setPhase])

  /** Escape semantics: cancel active draw first, then exit the tool */
  const cancel = useCallback(() => {
    if (phaseRef.current === 'drawing') {
      setPhase('armed')
      return true
    }
    if (phaseRef.current === 'armed') {
      setPhase('idle')
      return true
    }
    return false
  }, [setPhase])

  const commitWire = useCallback((finalPoints) => {
    if (finalPoints.length >= 2) {
      schematicStore.addWire(finalPoints)
    }
    setPhase('armed') // stay in the tool for the next wire, KiCad-style
  }, [setPhase])

  /** Left click (or Enter at cursor). Returns true when consumed. */
  const handleClick = useCallback((rawPoint) => {
    if (phaseRef.current === 'idle') return false
    const snap = magnetSnap(rawPoint)

    if (phaseRef.current === 'armed') {
      pointsRef.current = [{ x: snap.x, y: snap.y }]
      cursorRef.current = { x: snap.x, y: snap.y }
      phaseRef.current = 'drawing'
      publishDraft()
      return true
    }

    // drawing: anchor the tracked segment(s)
    const last = pointsRef.current[pointsRef.current.length - 1]
    const corners = routeManhattan(last, snap, dirRef.current, componentObstacles())
    const newPoints = [...pointsRef.current, ...corners, { x: snap.x, y: snap.y }]

    if (snap.target) {
      // Clicked a pin or an existing wire — auto-terminate on the target.
      commitWire(newPoints)
    } else {
      pointsRef.current = newPoints
      publishDraft()
    }
    return true
  }, [magnetSnap, publishDraft, commitWire])

  /** Terminate in empty space (double click / Enter / End) */
  const finalize = useCallback(() => {
    if (phaseRef.current !== 'drawing') return false
    const last = pointsRef.current[pointsRef.current.length - 1]
    const cursor = cursorRef.current
    let finalPoints = pointsRef.current
    if (cursor && (cursor.x !== last.x || cursor.y !== last.y)) {
      finalPoints = [...pointsRef.current, ...routeManhattan(last, cursor, dirRef.current, componentObstacles()), cursor]
    }
    commitWire(finalPoints)
    return true
  }, [commitWire])

  /** Continuous cursor tracking — the wire follows without a held button */
  const handleMove = useCallback((rawPoint) => {
    if (phaseRef.current === 'idle') return
    const snap = magnetSnap(rawPoint)
    interactionStore.set({ snapIndicator: { x: snap.x, y: snap.y, magnetic: !!snap.target } })
    if (phaseRef.current === 'drawing') {
      cursorRef.current = { x: snap.x, y: snap.y }
      publishDraft()
    }
  }, [magnetSnap, publishDraft])

  /** Shift+Space — flip H-then-V <-> V-then-H */
  const toggleDirection = useCallback(() => {
    dirRef.current = dirRef.current === 'HV' ? 'VH' : 'HV'
    publishDraft()
  }, [publishDraft])

  return {
    isActive: () => phaseRef.current !== 'idle',
    isDrawing: () => phaseRef.current === 'drawing',
    enterWireMode,
    exitWireMode,
    cancel,
    handleClick,
    handleMove,
    finalize,
    toggleDirection
  }
}
