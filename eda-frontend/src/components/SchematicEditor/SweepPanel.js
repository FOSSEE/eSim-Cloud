/* eslint-disable no-unused-vars */
import React, { useState } from 'react'
import {
  List, ListItem, Button, TextField, Typography,
  ExpansionPanel, ExpansionPanelSummary, ExpansionPanelDetails,
  Snackbar, LinearProgress
} from '@material-ui/core'
import MuiAlert from '@material-ui/lab/Alert'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import { makeStyles } from '@material-ui/core/styles'
import { GenerateNetList, GenerateCompList } from './Helper/ToolbarTools'
import api from '../../utils/Api'
import SweepResultDialog from './SweepResultDialog'

const useStyles = makeStyles((theme) => ({
  simulationOptions: { margin: '0px', padding: '0px', width: '100%' },
  propertiesBox: { width: '100%' },
  heading: { fontSize: theme.typography.pxToRem(15), fontWeight: theme.typography.fontWeightRegular }
}))

function Alert (props) {
  return <MuiAlert elevation={6} variant="filled" {...props} />
}

export default function SweepPanel (props) {
  const classes = useStyles()
  const [componentsList, setComponentsList] = useState([])
  const [cfg, setCfg] = useState({
    component: '', start: '', stop: '', stepCount: '5', scale: 'lin'
  })
  const [needParams, setNeedParams] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [doneMsg, setDoneMsg] = useState(false)
  const [sweepData, setSweepData] = useState(null)
  const [resultOpen, setResultOpen] = useState(false)

  // populate component dropdown with R / L / C only
  const onExpand = () => {
    try {
      GenerateNetList()
      const all = GenerateCompList()
      const passives = all.filter((v) => {
        const c = (v || '').charAt(0).toLowerCase()
        return c === 'r' || c === 'l' || c === 'c'
      })
      setComponentsList(['', ...passives])
    } catch (e) {
      console.log('SweepPanel comp list error:', e)
      setComponentsList([])
    }
  }

  const handleCfg = (evt) => {
    setCfg({ ...cfg, [evt.target.id]: evt.target.value })
  }

  // poll the sweep run until DONE
  const pollSweep = (sweepRunId) => {
    api.get('simulation/sweep-simulate/' + sweepRunId + '/')
      .then((res) => {
        const d = res.data
        setProgress({ done: d.completed_steps, total: d.total_steps })
        if (d.status === 'DONE' || d.status === 'FAILED') {
          setRunning(false)
          setDoneMsg(true)
          setSweepData(d)
          setResultOpen(true)
          if (props.onSweepResult) props.onSweepResult(d)
        } else {
          setTimeout(() => pollSweep(sweepRunId), 1000)
        }
      })
      .catch((err) => { console.log(err); setRunning(false) })
  }

  const runSweep = () => {
    if (!cfg.component || cfg.start === '' || cfg.stop === '' || cfg.stepCount === '') {
      setNeedParams(true)
      return
    }
    let compNetlist
    try {
      compNetlist = GenerateNetList()
    } catch (e) {
      setNeedParams(true)
      return
    }
    // assemble base netlist the same way the other modes do
    const baseNetlist =
      props.title + '\n\n' +
      compNetlist.models + '\n' +
      compNetlist.main + '\n' +
      '.tran 10e-03 100e-03 0e-03\n' +
      '\n.control \nrun \nprint all > data.txt \n.endc \n.end\n'

    const token = localStorage.getItem('esim_token')
    const config = { headers: { 'content-type': 'application/json' } }
    if (token) config.headers.Authorization = `Token ${token}`

    const body = {
      base_netlist: baseNetlist,
      component: cfg.component.toLowerCase(),
      start_value: parseFloat(cfg.start),
      stop_value: parseFloat(cfg.stop),
      step_count: parseInt(cfg.stepCount, 10),
      scale: cfg.scale
    }

    setRunning(true)
    setProgress({ done: 0, total: body.step_count })
    api.post('simulation/sweep-simulate/', body, config)
      .then((res) => { pollSweep(res.data.sweep_run_id) })
      .catch((err) => { console.log(err); setRunning(false) })
  }

  return (
    <ListItem className={classes.simulationOptions} divider>
      <Snackbar open={needParams} autoHideDuration={6000} onClose={() => setNeedParams(false)}>
        <Alert onClose={() => setNeedParams(false)} severity="error">
          Please enter all sweep parameters!
        </Alert>
      </Snackbar>
      <Snackbar open={doneMsg} autoHideDuration={4000} onClose={() => setDoneMsg(false)}>
        <Alert onClose={() => setDoneMsg(false)} severity="success">
          Sweep complete!
        </Alert>
      </Snackbar>

      <div className={classes.propertiesBox}>
        <ExpansionPanel onClick={onExpand}>
          <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
            <Typography className={classes.heading}>Parametric Sweep</Typography>
          </ExpansionPanelSummary>
          <ExpansionPanelDetails>
            <form className={classes.propertiesBox} noValidate autoComplete="off">
              <List>
                <ListItem>
                  <TextField
                    style={{ width: '100%' }} id="component" size="small"
                    variant="outlined" select label="Select Component (R/L/C)"
                    value={cfg.component} error={!cfg.component}
                    onChange={handleCfg} SelectProps={{ native: true }}
                  >
                    {componentsList.map((value, i) => (
                      <option key={i} value={value}>{value}</option>
                    ))}
                  </TextField>
                </ListItem>
                <ListItem>
                  <TextField id="start" label="Start Value" size="small" variant="outlined"
                    value={cfg.start} error={!cfg.start} onChange={handleCfg} />
                </ListItem>
                <ListItem>
                  <TextField id="stop" label="Stop Value" size="small" variant="outlined"
                    value={cfg.stop} error={!cfg.stop} onChange={handleCfg} />
                </ListItem>
                <ListItem>
                  <TextField id="stepCount" label="Number of Steps" size="small" variant="outlined"
                    value={cfg.stepCount} error={!cfg.stepCount} onChange={handleCfg} />
                </ListItem>
                <ListItem>
                  <TextField
                    style={{ width: '100%' }} id="scale" size="small"
                    variant="outlined" select label="Scale"
                    value={cfg.scale} onChange={handleCfg} SelectProps={{ native: true }}
                  >
                    <option key="lin" value="lin">Linear</option>
                    <option key="log" value="log">Logarithmic</option>
                  </TextField>
                </ListItem>

                {running &&
                  <ListItem>
                    <div style={{ width: '100%' }}>
                      <Typography variant="body2">
                        {progress.done} of {progress.total} simulations complete
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={progress.total ? (progress.done / progress.total) * 100 : 0}
                      />
                    </div>
                  </ListItem>
                }

                <ListItem>
                  <Button id="sweepSimulate" size="small" variant="contained" color="primary"
                    disabled={running} onClick={runSweep}>
                    {running ? 'Running...' : 'Run Sweep'}
                  </Button>
                </ListItem>
                {sweepData &&
                  <ListItem>
                    <Button size="small" variant="outlined" color="primary"
                      onClick={() => setResultOpen(true)}>
                      View Result
                    </Button>
                  </ListItem>
                }
              </List>
            </form>
          </ExpansionPanelDetails>
        </ExpansionPanel>
      </div>
      <SweepResultDialog open={resultOpen} onClose={() => setResultOpen(false)} sweepData={sweepData} />
    </ListItem>
  )
}
