/* eslint-disable no-unused-vars */
import React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography
} from '@material-ui/core'
import SweepGraph from '../Shared/SweepGraph'

// From one step's result.data, pull the (time, out) series.
// result.data is an array of tables; we want the table whose
// labels include 'out', and extract the 'out' column + 'time' column.
function extractOutTrace (result) {
  if (!result || !result.data) return null
  // Find the first voltage-node series: skip the x-axis label (time/
  // frequency at index 0) and any current columns (#branch). Works for
  // any circuit, including UI netlists with numeric node names.
  for (const table of result.data) {
    const labels = table.labels || []
    for (let k = 1; k < labels.length; k++) {
      const name = labels[k] || ''
      if (name === labels[0]) continue            // duplicate time col
      if (name.includes('#branch')) continue      // current, skip
      const seriesIdx = k - 1
      if (!table.y || !table.y[seriesIdx]) continue
      return { node: name, x: table.x, y: table.y[seriesIdx] }
    }
  }
  return null
}

export default function SweepResultDialog (props) {
  const { open, onClose, sweepData } = props

  let traces = []
  let component = ''
  if (sweepData && sweepData.steps) {
    component = sweepData.component || ''
    traces = sweepData.steps
      .filter(s => s.status === 'DONE' && s.result)
      .map(s => {
        const t = extractOutTrace(s.result)
        return t ? { value: s.value, x: t.x, y: t.y, node: t.node } : null
      })
      .filter(Boolean)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Parametric Sweep Result{traces.length ? ' — node ' + traces[0].node : ''}</DialogTitle>
      <DialogContent>
        {traces.length > 0
          ? <SweepGraph traces={traces} component={component} />
          : <Typography>No plottable data (no &apos;out&apos; node found in results).</Typography>
        }
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">Close</Button>
      </DialogActions>
    </Dialog>
  )
}
