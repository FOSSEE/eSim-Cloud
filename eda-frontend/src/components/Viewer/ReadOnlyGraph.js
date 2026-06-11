import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { CircularProgress } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { makeStyles } from '@material-ui/core/styles';
import mxGraphFactory from 'mxgraph';

import { parseXmlToGraph } from '../SchematicEditor/Helper/ToolbarTools';

const { mxGraph, mxUtils, mxEvent } = new mxGraphFactory();

const useStyles = makeStyles((theme) => ({
  container: {
    width: '100%',
    height: 'calc(100vh - 200px)',
    position: 'relative',
    overflow: 'hidden',
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  error: {
    margin: theme.spacing(2),
  }
}));

const ReadOnlyGraph = forwardRef(({ xmlData }, ref) => {
  const classes = useStyles();
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [error, setError] = useState(false);

  useImperativeHandle(ref, () => ({
    fitGraph: () => {
      if (graphRef.current) {
        graphRef.current.fit();
        graphRef.current.center(true, true, 0.5, 0.5);
      }
    },
    exportSVG: () => {
       if (containerRef.current) {
          const svg = containerRef.current.querySelector('svg');
          return svg;
       }
       return null;
    }
  }));

  useEffect(() => {
    if (!xmlData || !containerRef.current) return;

    let destroyed = false;
    try {
      mxEvent.disableContextMenu(containerRef.current);
      const graph = new mxGraph(containerRef.current);
      graphRef.current = graph;

      graph.setEnabled(false);
      graph.setTooltips(false);
      if (graph.popupMenuHandler) {
        graph.popupMenuHandler.enabled = false;
      }

      try {
        const xmlDoc = mxUtils.parseXml(xmlData);
        // parseXmlToGraph manages its own beginUpdate/endUpdate calls internally
        // Do NOT wrap in an extra beginUpdate or the update counter gets unbalanced
        parseXmlToGraph(xmlDoc, graph);
      } catch (parseErr) {
        console.error('Error parsing XML data:', parseErr);
      }

      // Fit after all animations settle (parseXmlToGraph uses mxMorphing with ~20 steps × 20ms delay)
      setTimeout(() => {
        if (!destroyed && graphRef.current) {
          graphRef.current.fit();
          graphRef.current.center(true, true, 0.5, 0.5);
          graphRef.current.refresh();
        }
      }, 600);

    } catch (err) {
      console.error('Error initializing mxGraph:', err);
      setError(true);
    }

    return () => {
      destroyed = true;
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [xmlData]);

  if (error) {
    return <Alert severity="error" className={classes.error}>Failed to render circuit.</Alert>;
  }

  return (
    <div className={classes.container}>
      {!xmlData && <CircularProgress className={classes.loader} />}
      <div ref={containerRef} role="img" aria-label="Circuit diagram — read only view" style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default ReadOnlyGraph;
