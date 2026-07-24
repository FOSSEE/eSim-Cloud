export function buildEditorContext(graph, lastSimulationError = null, netlistSnippet = null) {
  const safeNetlistSnippet = netlistSnippet ? netlistSnippet.slice(0, 4000) : null;
  const defaultContext = { page: 'editor', components: [], wireCount: 0, analysisHints: {}, lastSimulationError, netlistSnippet: safeNetlistSnippet };
  
  if (!graph) return defaultContext;

  const model = graph.getModel();
  if (!model || !model.cells) return defaultContext;

  const components = [];
  let wireCount = 0;

  Object.values(model.cells).forEach(cell => {
    if (!cell) return;

    if (cell.CellType === 'Component') {
      const safeProps = {};
      if (cell.properties) {
        Object.keys(cell.properties).forEach(k => {
          const val = cell.properties[k];
          if (typeof val === 'string') {
            if (val.length > 200) return;
            if (val.includes('<svg') || val.includes('base64,')) return;
            if (val.match(/\.(png|jpg|jpeg|gif|svg)$/i)) return;
            safeProps[k] = val;
          } else if (typeof val === 'number' || typeof val === 'boolean') {
            safeProps[k] = val;
          }
        });
      }

      components.push({
        id: cell.id,
        symbol: cell.symbol || null,
        properties: safeProps
      });
    } else if (cell.edge === true) {
      wireCount++;
    }
  });

  if (components.length > 50) {
    components.length = 50;
  }

  return {
    page: 'editor',
    components,
    wireCount,
    analysisHints: {},
    lastSimulationError,
    netlistSnippet: safeNetlistSnippet
  };
}
