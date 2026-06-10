import { getStoredDarkMode } from '../../../themeStorage.js'

export function isSchematicDarkMode () {
  return getStoredDarkMode()
}

export function getComponentLabelColor (darkMode = isSchematicDarkMode()) {
  return darkMode ? '#90caf9' : '#1565c0'
}

export function getPinLabelColor (darkMode = isSchematicDarkMode()) {
  return darkMode ? '#ffffff' : '#cc0000'
}

export function getComponentVertexStyle (imagePath, darkMode = isSchematicDarkMode()) {
  const labelColor = getComponentLabelColor(darkMode)
  return 'shape=image;fontColor=' + labelColor + ';image=' + imagePath +
    ';imageVerticalAlign=bottom;verticalAlign=bottom;imageAlign=bottom;align=bottom;spacingLeft=25;'
}

export function getSchematicColors (darkMode) {
  return {
    invert: darkMode,
    canvasBackground: darkMode ? '#1a1a1a' : '#ffffff',
    strokeColor: darkMode ? '#c0c0c0' : '#000000',
    fontColor: darkMode ? '#ffffff' : '#000000',
    labelBackground: darkMode ? '#1a1a1a' : '#ffffff'
  }
}

export function updatePinLabelColors (graph, darkMode) {
  if (!graph) return

  const labelColor = getPinLabelColor(darkMode)
  const parent = graph.getDefaultParent()
  const cells = graph.getChildCells(parent, true, true)
  const pinCells = []

  for (let i = 0; i < cells.length; i++) {
    if (cells[i].Pin) {
      pinCells.push(cells[i])
    }
  }

  if (pinCells.length > 0) {
    graph.setCellStyles('fontColor', labelColor, pinCells)
  }
}

export function updateComponentLabelColors (graph, darkMode) {
  if (!graph) return

  const labelColor = getComponentLabelColor(darkMode)
  const parent = graph.getDefaultParent()
  const cells = graph.getChildCells(parent, true, true)
  const componentCells = []

  for (let i = 0; i < cells.length; i++) {
    if (cells[i].Component) {
      componentCells.push(cells[i])
    }
  }

  if (componentCells.length > 0) {
    graph.setCellStyles('fontColor', labelColor, componentCells)
  }
}

export function applyGraphStyles (graph, colors, strokeWidth = 2) {
  if (!graph) return

  const edgeStyle = graph.getStylesheet().getDefaultEdgeStyle()
  edgeStyle.strokeColor = colors.strokeColor
  edgeStyle.labelBackgroundColor = colors.labelBackground
  edgeStyle.fontColor = colors.fontColor

  const vertexStyle = graph.getStylesheet().getDefaultVertexStyle()
  vertexStyle.strokeColor = colors.strokeColor
  vertexStyle.fontColor = colors.fontColor

  updateComponentLabelColors(graph, colors.invert)
  updatePinLabelColors(graph, colors.invert)
  graph.refresh()
}
