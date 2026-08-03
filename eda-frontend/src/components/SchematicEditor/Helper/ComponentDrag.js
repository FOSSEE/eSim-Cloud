/**
 * ComponentDrag.js — legacy entry point of the mxGraph editor.
 *
 * The imperative LoadGrid routine and its #divGrid DOM bindings are replaced
 * by the declarative <SchematicCanvas /> React SVG component. This module
 * re-exports it so historical import paths keep working.
 */

import SchematicCanvas from '../Canvas/SchematicCanvas'
import { schematicStore } from '../Canvas/schematicStore'

export { SchematicCanvas, schematicStore }

/**
 * @deprecated mount <SchematicCanvas /> instead. Kept so stray callers fail
 * loudly in the console rather than silently binding to a dead container.
 */
export default function LoadGrid () {
  console.warn('LoadGrid(container) is deprecated — render <SchematicCanvas /> instead.')
}
