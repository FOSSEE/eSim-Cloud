import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CircularProgress, Card, Typography, IconButton, Paper, Button } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { makeStyles } from '@material-ui/core/styles';
import LockIcon from '@material-ui/icons/Lock';
import ZoomOutMapIcon from '@material-ui/icons/ZoomOutMap';
import ImageIcon from '@material-ui/icons/Image';
import PrintIcon from '@material-ui/icons/Print';
import Tooltip from '@material-ui/core/Tooltip';

import api from '../utils/Api';
import ReadOnlyGraph from '../components/Viewer/ReadOnlyGraph';

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
  },
  loaderContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  errorCard: {
    margin: 'auto',
    padding: theme.spacing(4),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: 400,
  },
  lockIcon: {
    fontSize: 60,
    color: theme.palette.grey[500],
    marginBottom: theme.spacing(2),
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(1, 2),
    backgroundColor: '#fff',
    borderBottom: '1px solid #e0e0e0',
    '@media print': {
      display: 'none',
    }
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    padding: theme.spacing(0.5, 2),
    backgroundColor: '#f5f5f5',
    '@media print': {
      display: 'none',
    }
  },
  footer: {
    padding: theme.spacing(1),
    '@media print': {
      display: 'none',
    }
  },
  graphContainer: {
    flexGrow: 1,
    overflow: 'hidden',
  },
  titleContainer: {
    maxWidth: '50%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}));

export default function CircuitViewer() {
  const classes = useStyles();
  const { saveId, version, branch } = useParams();
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const [circuitData, setCircuitData] = useState(null);
  const viewerRef = useRef(null);

  const fetchCircuit = React.useCallback(() => {
    let isMounted = true;
    setLoading(true);
    setErrorStatus(null);
    api.get(`save/shared/${saveId}/${version}/${branch}/`)
      .then((res) => {
        if (isMounted) {
          setCircuitData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          if (err.response) {
            setErrorStatus(err.response.status);
          } else {
            setErrorStatus('NETWORK');
          }
          setLoading(false);
        }
      });
      return () => {
        isMounted = false;
      };
  }, [saveId, version, branch]);

  useEffect(() => {
    const cleanup = fetchCircuit();
    return cleanup;
  }, [fetchCircuit]);

  const handleZoomFit = () => {
    if (viewerRef.current) {
      viewerRef.current.fitGraph();
    }
  };

  const handleExportPNG = async () => {
    if (viewerRef.current) {
      const rawSvg = viewerRef.current.exportSVG();
      if (!rawSvg) return;
      
      const svg = rawSvg.cloneNode(true);
      const images = svg.getElementsByTagName('image');
      
      for (const image of images) {
        const href = image.getAttribute('xlink:href') || image.getAttribute('href');
        if (href && !href.startsWith('data:')) {
          try {
            const data = await fetch(href).then((v) => v.text());
            image.removeAttribute('xlink:href');
            image.removeAttribute('href');
            image.setAttribute('href', 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(data))));
          } catch (err) {
            console.warn('Failed to fetch image for export:', err);
          }
        }
      }

      const canvas = document.createElement('canvas');
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        canvas.width = rawSvg.clientWidth || 800;
        canvas.height = rawSvg.clientHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.download = `${circuitData?.name || 'circuit'}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className={classes.loaderContainer}>
        <CircularProgress />
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className={classes.loaderContainer}>
        <Card className={classes.errorCard} role="alert">
          <LockIcon className={classes.lockIcon} />
          <Typography variant="h5" gutterBottom>Circuit Not Public</Typography>
          <Typography variant="body1">The owner of this circuit has not made it public yet.</Typography>
          <Typography variant="body2" color="textSecondary">If you received this link, ask the owner to enable sharing from their editor.</Typography>
        </Card>
      </div>
    );
  }

  if (errorStatus === 404) {
    return (
      <div className={classes.loaderContainer}>
        <Card className={classes.errorCard}>
          <Typography variant="h5" gutterBottom>Circuit Not Found</Typography>
          <Typography variant="body1">This circuit link may be invalid or the circuit may have been deleted.</Typography>
        </Card>
      </div>
    );
  }

  if (errorStatus) {
    return (
      <div className={classes.loaderContainer}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={fetchCircuit}>Retry</Button>
        }>
          Failed to load circuit. Please try again.
        </Alert>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <Paper square className={classes.topBar}>
        <Tooltip title={circuitData?.name || circuitData?.save_id || ''}>
          <Typography variant="h6" className={classes.titleContainer}>
            {circuitData?.name || circuitData?.save_id}
          </Typography>
        </Tooltip>
        <Typography variant="body2" style={{ color: '#9e9e9e' }}>View only</Typography>
      </Paper>
      
      <Paper square className={classes.toolbar}>
        <Tooltip title="Zoom to Fit">
          <IconButton size="small" aria-label="Zoom to Fit" onClick={handleZoomFit}><ZoomOutMapIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Export as PNG">
          <IconButton size="small" aria-label="Export as PNG" onClick={handleExportPNG}><ImageIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Print">
          <IconButton size="small" aria-label="Print" onClick={handlePrint}><PrintIcon /></IconButton>
        </Tooltip>
      </Paper>

      <div className={classes.graphContainer}>
        {(!circuitData?.data_dump) ? (
          <Alert severity="info" style={{ margin: '16px' }}>This circuit has no canvas content to display.</Alert>
        ) : (
          <ReadOnlyGraph ref={viewerRef} xmlData={circuitData?.data_dump} />
        )}
      </div>

      <div className={classes.footer}>
        <Alert severity="info">
          This is a read-only view. Open eSim-Cloud to create and simulate your own circuits.
        </Alert>
      </div>
    </div>
  );
}
