import React from 'react'
import PropTypes from 'prop-types'
import { Line } from 'react-chartjs-2'
import 'chartjs-plugin-colorschemes'
import { Typography, Grid, Dialog, DialogContent, IconButton } from '@material-ui/core'
import CloseIcon from '@material-ui/icons/Close'
import Alert from '@material-ui/lab/Alert'
import { makeStyles } from '@material-ui/core/styles'
import Chart from 'chart.js'

Chart.defaults.global.defaultFontColor = '#333'

const useStyles = makeStyles((theme) => ({
  dialogPaper: {
    backgroundColor: '#1e1e1e', // Dark mode for premium feel
    color: '#f0f0f0'
  },
  dialogTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #333',
    padding: theme.spacing(2, 3)
  },
  content: {
    padding: theme.spacing(4),
    backgroundColor: '#121212'
  },
  chartContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: '12px',
    padding: theme.spacing(2),
    border: '1px solid #333',
    boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    transition: 'transform 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)'
    }
  },
  chartWrapper: {
    flexGrow: 1,
    minHeight: 400,
    width: '100%',
    marginBottom: theme.spacing(2)
  },
  runMetadata: {
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(2),
    borderTop: '1px solid #333',
    textAlign: 'center'
  },
  circuitName: {
    color: '#4db8ff',
    fontWeight: 'bold',
    marginBottom: theme.spacing(0.5)
  },
  runDetails: {
    color: '#aaa',
    fontSize: '0.85rem'
  }
}))

function formatDateTime (isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  } catch (_) { return isoString }
}

function extractCircuitName (netlist) {
  if (!netlist) return 'Unknown Circuit'
  const lines = netlist.split('\n')
  for (let line of lines) {
    line = line.trim()
    if (line && line.length > 0) {
      if (line.startsWith('*')) return line.substring(1).trim()
      return line // In Spice, the very first non-empty line is the title
    }
  }
  return 'Unknown Circuit'
}

/**
 * Builds Chart.js data and options config for a single run.
 * Returns null if the run has no valid graph data (null-safe at all levels).
 * @param {object} run     - history entry object
 * @param {boolean} isDashed - if true, datasets render with borderDash [5,5]
 * @param {string} runLabelPrefix - Prefix for the legend labels, e.g. "Run 1 (12:13) "
 */
function createChartConfig (run, isDashed = false, runLabelPrefix = '') {
  // Null-guard: run, run.result, and run.result.data must all exist
  const data = run?.result?.data
  if (!data || !Array.isArray(data) || data.length === 0) return null

  const graph = { labels: [], x_points: [], y_points: [] }

  // Null-guard on data[0].labels and data[0].x
  if (!data[0]?.labels || !data[0]?.x) return null

  graph.labels[0] = data[0].labels[0]
  graph.x_points = data[0].x.map(d => parseFloat(d))

  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    if (!item?.labels || !item?.y) continue

    for (let x = 1; x < item.labels.length; x++) {
      graph.labels.push(item.labels[x])
    }
    for (let z = 0; z < item.y.length; z++) {
      if (Array.isArray(item.y[z])) {
        graph.y_points.push(item.y[z].map(d => parseFloat(d)))
      }
    }
  }

  if (graph.y_points.length === 0) return null

  const datasets = []
  for (let i = 0; i < graph.y_points.length; i++) {
    const dataset = {
      label: runLabelPrefix + graph.labels[i + 1],
      data: graph.y_points[i],
      fill: false,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1
    }
    // borderDash is set per-dataset (not in chart options) — required for Chart.js to render dashes
    if (isDashed) {
      dataset.borderDash = [5, 5]
    }
    datasets.push(dataset)
  }

  return {
    data: {
      labels: graph.x_points,
      datasets: datasets
    },
    options: {
      plugins: {
        colorschemes: {
          scheme: 'brewer.SetOne9'
        }
      },
      responsive: true,
      maintainAspectRatio: false,
      title: {
        display: false
      },
      legend: {
        display: true,
        labels: {
          fontColor: '#ccc'
        }
      },
      tooltips: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFontColor: '#fff',
        bodyFontColor: '#fff',
        borderColor: '#333',
        borderWidth: 1
      },
      hover: {
        mode: 'nearest',
        intersect: true
      },
      scales: {
        xAxes: [{
          display: true,
          gridLines: { color: '#333', zeroLineColor: '#555' },
          scaleLabel: { display: true, labelString: graph.labels[0] || 'time', fontColor: '#aaa' },
          ticks: { fontColor: '#aaa' }
        }],
        yAxes: [{
          display: true,
          gridLines: { color: '#333', zeroLineColor: '#555' },
          ticks: { fontColor: '#aaa', fontSize: 13, padding: 10 }
        }]
      }
    }
  }
}

// Compare mode is auth-independent — history is stored in localStorage
// and works for both authenticated and anonymous users.
export default function SimulationCompareChart ({ open, onClose, run1, run2 }) {
  const classes = useStyles()

  // Null-guard: both runs must be present
  if (!run1 || !run2) return null

  // Null-guard: check graph flag via optional chaining
  const isInvalid = run1?.result?.graph !== 'true' || run2?.result?.graph !== 'true'

  let config1 = null
  let config2 = null

  if (!isInvalid) {
    const time1 = formatDateTime(run1.timestamp).split(', ')[1] || '' // Extract time part roughly
    const time2 = formatDateTime(run2.timestamp).split(', ')[1] || ''
    const prefix1 = `Run 1 (${time1}) - `
    const prefix2 = `Run 2 (${time2}) - `
    config1 = createChartConfig(run1, false, prefix1) // solid lines for run1
    config2 = createChartConfig(run2, true, prefix2) // dashed lines for run2
  }

  // If either config came back null (malformed/missing data), treat as invalid
  const hasValidData = !isInvalid && config1 !== null && config2 !== null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      classes={{ paper: classes.dialogPaper }}
    >
      <div className={classes.dialogTitle}>
        <Typography variant="h6" style={{ fontWeight: 600 }}>Compare Simulation Runs</Typography>
        <IconButton onClick={onClose} style={{ color: '#aaa' }}>
          <CloseIcon />
        </IconButton>
      </div>

      <DialogContent className={classes.content}>
        {!hasValidData ? (
          <Alert severity="warning">One or both selected runs have no graph data to compare.</Alert>
        ) : (
          <Grid container spacing={4} style={{ height: '100%' }}>
            {/* Graph 1 — solid lines */}
            <Grid item xs={12} md={6}>
              <div className={classes.chartContainer}>
                <div className={classes.chartWrapper}>
                  <Line data={config1.data} options={config1.options} />
                </div>
                <div className={classes.runMetadata}>
                  <Typography variant="h6" className={classes.circuitName}>
                    {extractCircuitName(run1.netlist)}
                  </Typography>
                  <Typography className={classes.runDetails}>
                     Graph 1 &bull; {formatDateTime(run1.timestamp)} &bull; {run1.simulationType}
                  </Typography>
                </div>
              </div>
            </Grid>

            {/* Graph 2 — dashed lines */}
            <Grid item xs={12} md={6}>
              <div className={classes.chartContainer}>
                <div className={classes.chartWrapper}>
                  <Line data={config2.data} options={config2.options} />
                </div>
                <div className={classes.runMetadata}>
                  <Typography variant="h6" className={classes.circuitName}>
                    {extractCircuitName(run2.netlist)}
                  </Typography>
                  <Typography className={classes.runDetails}>
                     Graph 2 &bull; {formatDateTime(run2.timestamp)} &bull; {run2.simulationType}
                  </Typography>
                </div>
              </div>
            </Grid>
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  )
}

SimulationCompareChart.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  run1: PropTypes.object,
  run2: PropTypes.object
}
