/**
 * standardLibs.js — bundled standard KiCad symbol definitions.
 *
 * public/kicad-libs/standard.lib is a concatenation of the legacy .lib files
 * the backend seeds its component DB from (Device, power, eSim_Sources,
 * Transistor_BJT, ...; rebuilt with scripts/bundle-kicad-libs.sh). It acts as
 * a built-in -cache.lib so a bare .sch imports with exact pin positions; a
 * user-provided cache lib overlays it for project-specific symbols.
 */

import { parseLegacyLib } from './legacyLib'

let defsPromise = null

/**
 * Lazily fetch + parse the bundled library. Memoised; resolves to an empty
 * Map when the asset is unavailable so imports degrade to proximity matching
 * instead of failing.
 *
 * @returns {Promise<Map<string, Object>>} symbol name → LegacyLibDef
 */
export function getStandardDefs () {
  if (!defsPromise) {
    const url = (process.env.PUBLIC_URL || '') + '/kicad-libs/standard.lib'
    defsPromise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.text()
      })
      .then((text) => parseLegacyLib(text))
      .catch((e) => {
        console.warn('Standard KiCad libs unavailable, importing without them:', e)
        return new Map()
      })
  }
  return defsPromise
}

/** Test hook: forget the memoised fetch */
export function resetStandardDefs () {
  defsPromise = null
}
