/**
 * interactionStore.js — colocated high-frequency interaction state.
 *
 * Everything that changes on mousemove (active wire preview, drag ghosts,
 * marquee, sidebar placement ghost) lives here instead of in the committed
 * schematic store, so only the thin <InteractionOverlay/> re-renders during
 * drags and wire routing; the grid/wire/component layers stay memoized.
 */

import { useEffect, useReducer } from 'react'

const state = {
  /** Active wire draft: { points: Point[], cursor: Point, dir: 'HV'|'VH' } */
  wireDraft: null,
  /** Component drag ghost: { ids: string[], dx, dy, snapped: boolean } */
  dragGhost: null,
  /** Sidebar placement ghost: { descriptor, schema, x, y, kind: 'component'|'probe', probeType } */
  placingGhost: null,
  /** Marquee selection rect: { x0, y0, x1, y1 } */
  marquee: null,
  /** Snap indicator dot: { x, y } */
  snapIndicator: null,
  /** Tool mode mirrored for the cursor: 'select' | 'wire' */
  tool: 'select'
}

const listeners = new Set()

function notify () {
  listeners.forEach((l) => l())
}

export const interactionStore = {
  getState () {
    return state
  },
  set (patch) {
    let changed = false
    for (const k of Object.keys(patch)) {
      if (state[k] !== patch[k]) {
        state[k] = patch[k]
        changed = true
      }
    }
    if (changed) notify()
  },
  reset () {
    interactionStore.set({
      wireDraft: null,
      dragGhost: null,
      placingGhost: null,
      marquee: null,
      snapIndicator: null
    })
  },
  subscribe (fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
}

/** Re-render the calling component whenever interaction state changes. */
export function useInteractionState () {
  const [, force] = useReducer((c) => c + 1, 0)
  useEffect(() => interactionStore.subscribe(force), [])
  return state
}
