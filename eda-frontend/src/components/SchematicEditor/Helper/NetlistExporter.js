/**
 * NetlistExporter.js — SPICE netlist generation for the React canvas.
 *
 * The legacy DFS/BFS mxGraph cell traversal is replaced by the DSU network
 * compiler in Canvas/dsuNetlist.js. Exported signatures keep the legacy
 * `graph` parameter for compatibility; the canvas document is read from the
 * schematic store instead.
 */

import { schematicStore } from '../Canvas/schematicStore'
import { checkErc, compileNetlist, assignPrefixes } from '../Canvas/dsuNetlist'

/**
 * ERC check before netlist generation.
 * @returns {Object} { isValid, vertexCount, errorCount, pinNC, ground, errorMsg }
 */
export function checkNetlistErc () {
  return checkErc(schematicStore.getState())
}

/**
 * Annotate components with R1/V1/C1... prefixes and computed node names.
 * Persists PREFIX into component properties (drives on-canvas labels) and
 * returns the annotated component list.
 */
export function annotate () {
  const doc = schematicStore.getState()
  const compiled = compileNetlist(doc)

  // Persist prefixes so labels and follow-up queries see them
  for (const comp of compiled.annotated) {
    const current = schematicStore.getComponent(comp.id)
    if (current && current.properties.PREFIX !== comp.properties.PREFIX) {
      schematicStore.setComponentProperties(comp.id, comp.properties)
    }
  }

  return compiled
}

/**
 * Build the SPICE netlist from the current canvas state.
 * Output shape matches the legacy exporter:
 * @returns {Object} { models, main, componentlist, nodelist }
 */
export function buildNetlistFromGraph () {
  const compiled = annotate()

  // Show generated node names on the wires
  const nodeNames = {}
  compiled.wireNode.forEach((name, wireId) => {
    nodeNames[wireId] = name
  })
  schematicStore.setNodeNames(nodeNames)

  return {
    models: compiled.models,
    main: compiled.main,
    componentlist: compiled.componentlist,
    nodelist: compiled.nodelist
  }
}

export { assignPrefixes }

export const sanitizeNetlistForExport = (code) => {
  const codeArray = code.split('\n')
  let cleanCode = ''
  let frontPlot = ''
  for (let line = 0; line < codeArray.length; line++) {
    if (codeArray[line].includes('plot') && !codeArray[line].includes('setplot')) {
      frontPlot += codeArray[line].split('plot ')[1] + ' '
    }
  }
  frontPlot = `print ${frontPlot} > data.txt \n`
  let flag = 0
  for (let i = 0; i < codeArray.length; i++) {
    if (codeArray[i].includes('plot') && !codeArray[i].includes('setplot')) {
      if (!flag) {
        cleanCode += frontPlot
        flag = 1
      }
    } else {
      cleanCode += codeArray[i] + '\n'
    }
  }
  return cleanCode
}
