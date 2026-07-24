import React, { useState, useEffect } from 'react'
import { Container, Grid, Button, Paper, Typography, Switch, FormControlLabel } from '@material-ui/core'
import MuiAlert from '@material-ui/lab/Alert'
import { makeStyles } from '@material-ui/core/styles'
import Editor from '../components/Simulator/Editor'
import textToFile from '../components/Simulator/textToFile'
import SimulationScreen from '../components/Shared/SimulationScreen'
import { useDispatch, useSelector } from 'react-redux'
import { setResultGraph, setResultText, setNetlist, setLastSimulationError } from '../redux/actions/index'
import Notice from '../components/Shared/Notice'
import { sanitizeNetlistForExport } from '../components/SchematicEditor/Helper/NetlistExporter'
import ErrorExplainerCard from '../components/Simulator/ErrorExplainerCard'
import ChatPanel from '../components/AIAssistant/ChatPanel'
import SimulationHistoryDrawer from '../components/Simulator/SimulationHistoryDrawer'
import { saveSimulationRun } from '../utils/simulationHistory'

import api from '../utils/Api'

const useStyles = makeStyles((theme) => ({
  header: {
    padding: theme.spacing(5, 0, 6)
    // color: '#fff'
  },
  paper: {
    padding: theme.spacing(2),
    textAlign: 'center',
    backgroundColor: '#404040',
    color: '#fff'

  }
}))

export default function Simulator () {
  const classes = useStyles()
  const dispatch = useDispatch()
  const [netlistCode, setNetlistCode] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [err, setErr] = useState(false)
  const [status, setStatus] = useState('')
  const stats = { loading: 'loading', error: 'error', success: 'success' }
  // errorDetails holds the full result object for failed simulations
  const [errorDetails, setErrorDetails] = useState(null)

  const [missingSimCmd, setMissingSimCmd] = useState(false)

  // History drawer state
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyErrorDetails, setHistoryErrorDetails] = useState(null)

  const handleSelectHistoryResult = (item) => {
    setErrorDetails(null)
    if (item && !item.success) {
      setHistoryErrorDetails(item.result)
    } else {
      setHistoryErrorDetails(null)
    }
  }
  const [state, setState] = React.useState({
    checkedA: false

  })
  const [taskId, setTaskId] = useState(null)

  const reduxNetlist = useSelector(state => state.netlistReducer.netlist)

  useEffect(() => {
    document.title = 'Simulator - eSim '
  })

  useEffect(() => {
    if (reduxNetlist) {
      setNetlistCode(reduxNetlist)
    }
  }, [reduxNetlist])

  const handleChange = (event) => {
    setState({ ...state, [event.target.name]: event.target.checked })
  }

  const handleSimulationButtonClick = () => {
    const lowerCode = netlistCode.toLowerCase()
    if (!lowerCode.includes('.tran') && !lowerCode.includes('.ac') && !lowerCode.includes('.dc ') && !lowerCode.includes('.op')) {
      setMissingSimCmd(true)
      return
    }
    prepareNetlist()
  }
  const onCodeChange = (code) => {
    setNetlistCode(code)
    const lowerCode = code.toLowerCase()
    if (lowerCode.includes('.tran') || lowerCode.includes('.ac') || lowerCode.includes('.dc ') || lowerCode.includes('.op')) {
      setMissingSimCmd(false)
    }
  }

  const [simulateOpen, setSimulateOpen] = React.useState(false)

  const handleErrOpen = () => {
    setErr(true)
  }
  const handleErrClose = () => {
    setErr(false)
  }
  const handleErrMsg = (msg) => {
    setErrMsg(msg)
  }
  const handleStatus = (status) => {
    setStatus(status)
  }
  const handlesimulateOpen = () => {
    setSimulateOpen(true)
  }

  const handleSimulateClose = () => {
    setSimulateOpen(false)
  }

  function prepareNetlist () {
    const sanatizedText = sanitizeNetlistForExport(netlistCode)
    dispatch(setNetlist(sanatizedText))
    const file = textToFile(sanatizedText)
    sendNetlist(file)
  }

  // Upload the nelist
  function netlistConfig (file) {
    const token = localStorage.getItem('esim_auth_token')
    const formData = new FormData()
    formData.append('file', file)
    const config = {
      headers: {
        'content-type': 'multipart/form-data'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }
    return api.post('simulation/upload', formData, config)
  }

  function sendNetlist (file) {
    setIsResult(false)
    netlistConfig(file)
      .then((response) => {
        const res = response.data
        const getUrl = 'simulation/status/'.concat(res.details.task_id)
        setTaskId(res.details.task_id)
        simulationResult(getUrl)
      })
      .catch(function (error) {
        console.log(error)
      })
  }

  const [isResult, setIsResult] = useState(false)

  function simulationResult (url) {
    let msg
    api
      .get(url)
      .then((res) => {
        if (res.data.state === 'PROGRESS' || res.data.state === 'PENDING') {
          handleStatus(stats.loading)
          setTimeout(() => simulationResult(url), 1000)
          return { type: 'PROGRESS' }
        } else if (Object.prototype.hasOwnProperty.call(res.data.details, 'fail')) {
          console.log('failed notif')
          console.log(res.data.details)
          msg = res.data.details.fail.replace("b'", '')
          
          const errorHelp = res.data?.details?.error_help
          dispatch(setLastSimulationError(errorHelp?.summary || "Simulation failed"))
          setErrorDetails(res.data.details)
          
          return { type: 'FAIL', details: res.data.details, errorHelp: errorHelp }
        } else {
          const result = res.data.details
          if (result === null) {
            return { type: 'NULL_RESULT' }
          } else {
            const temp = res.data.details.data
            const data = result.data
            if (res.data.details.graph === 'true') {
              const simResultGraph = { labels: [], x_points: [], y_points: [] }
              for (let i = 0; i < data.length; i++) {
                simResultGraph.labels[0] = data[i].labels[0]
                const lab = data[i].labels
                simResultGraph.x_points = data[0].x
                for (let x = 1; x < lab.length; x++) {
                  simResultGraph.labels.push(lab[x])
                }
                for (let z = 0; z < data[i].y.length; z++) {
                  simResultGraph.y_points.push(data[i].y[z])
                }
              }
              simResultGraph.x_points = simResultGraph.x_points.map(d => parseFloat(d))
              for (let i1 = 0; i1 < simResultGraph.y_points.length; i1++) {
                simResultGraph.y_points[i1] = simResultGraph.y_points[i1].map(d => parseFloat(d))
              }
              dispatch(setResultGraph(simResultGraph))
            } else {
              const simResultText = []
              for (let i = 0; i < temp.length; i++) {
                let postfixUnit = ''
                if (temp[i][0].includes('#branch')) {
                  postfixUnit = 'A'
                } else if (temp[i][0].includes('transfer_function')) {
                  postfixUnit = ''
                } else if (temp[i][0].includes('impedance')) {
                  postfixUnit = 'Ohm'
                } else {
                  temp[i][0] = `V(${temp[i][0]})`
                  postfixUnit = 'V'
                }
                simResultText.push(temp[i][0] + ' ' + temp[i][1] + ' ' + parseFloat(temp[i][2]) + ' ' + postfixUnit + '\n')
              }
              dispatch(setResultText(simResultText))
            }
            return { type: 'SUCCESS', details: res.data.details }
          }
        }
      })
      .then((chainData) => {
        if (!chainData) return
        
        if (chainData.type === 'SUCCESS') {
          handleStatus(stats.success)
          handlesimulateOpen()
          setErrorDetails(null)
          
          saveSimulationRun({
            timestamp: new Date().toISOString(),
            success: true,
            simulationType: 'NgSpiceSimulator',
            result: chainData.details,
            errorHelp: null,
            netlist: netlistCode
          })
          setIsResult(true)
        } else if (chainData.type === 'FAIL') {
          setIsResult(false)
          
          saveSimulationRun({
            timestamp: new Date().toISOString(),
            success: false,
            simulationType: 'NgSpiceSimulator',
            result: chainData.details,
            errorHelp: chainData.errorHelp || null,
            netlist: netlistCode
          })
          
          handleStatus(stats.error)
          handleErrMsg("Simulation failed. See technical details above.")
          handleErrOpen()
        } else if (chainData.type === 'NULL_RESULT') {
          setIsResult(false)
        }
      })
      .catch(function (error) {
        console.log(error)
      })
  }

  /**
   * Builds and dispatches the cross-component event that tells ChatPanel to
   * pre-fill its input with a description of the current error.
   */
  const handleAskAI = () => {
    const errorHelp = errorDetails && errorDetails.error_help
    const summary = errorHelp ? errorHelp.summary : "Simulation failed"
    const hints = errorHelp && errorHelp.hints ? errorHelp.hints : []
    const message = 'I got this simulation error: ' + summary +
      (hints && hints.length > 0 ? '. Hints: ' + hints.join(', ') : '')
    window.dispatchEvent(new CustomEvent('esim-open-chat-with-prompt', {
      detail: { message, includeContext: true }
    }))
  }

  const handleHistoryAskAI = () => {
    const errorHelp = historyErrorDetails && historyErrorDetails.error_help
    const summary = errorHelp ? errorHelp.summary : "Simulation failed"
    const hints = errorHelp && errorHelp.hints ? errorHelp.hints : []
    const message = 'I got this simulation error: ' + summary +
      (hints && hints.length > 0 ? '. Hints: ' + hints.join(', ') : '')
    window.dispatchEvent(new CustomEvent('esim-open-chat-with-prompt', {
      detail: { message, includeContext: true }
    }))
  }

  return (
    <Container component="main" maxWidth="md" className={classes.header}>
      <SimulationScreen open={simulateOpen} isResult={isResult} close={handleSimulateClose} dark={state} taskId={taskId} />
      <Grid
        container
        spacing={3}
        direction="row"
        justify="center"
        alignItems="stretch"
      >
        {/* ErrorExplainerCard appears above the raw error Notice when
            the backend has provided structured error_help. */}
        {errorDetails && (
          <Grid item xs={12}>
            <ErrorExplainerCard
              errorDetails={errorDetails}
              onAskAI={handleAskAI}
            />
          </Grid>
        )}
        {historyErrorDetails && (
          <Grid item xs={12}>
            <ErrorExplainerCard
              errorDetails={historyErrorDetails}
              onAskAI={handleHistoryAskAI}
            />
          </Grid>
        )}
        <Notice status={status} open={err} msg={errMsg} close={handleErrClose}/>
        <Grid item xs={12} >
          <Paper className={classes.paper}>

            <Typography variant="h4" gutterBottom>
              SPICE SIMULATOR
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              eSim on Cloud - ngSpice Simulator
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} >
          <Paper className={classes.paper}>

            <Typography variant="h5" gutterBottom>
              Enter Netlist

            </Typography>
            <FormControlLabel
              style={{ marginLeft: '10px' }}
              control={<Switch checked={state.checkedA} color="primary" onChange={handleChange} name="checkedA" />}
              label="Light Mode"
            />

            {missingSimCmd && (
              <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                <MuiAlert severity="warning">
                  Your netlist has no simulation command. Add one of these before .end:
                </MuiAlert>
                <Paper style={{ padding: '8px', backgroundColor: '#2d2d2d', color: '#a6e22e', fontFamily: 'monospace', marginTop: '8px', fontSize: '14px' }}>
                  .tran 10u 10m 0   &larr; Transient (timestep stoptime start)<br/>
                  .ac dec 10 1 1Meg  &larr; AC analysis<br/>
                  .dc V1 0 5 0.1    &larr; DC sweep
                </Paper>
                <Button
                  variant="outlined"
                  color="primary"
                  style={{ marginTop: '8px', borderColor: '#a6e22e', color: '#a6e22e' }}
                  onClick={() => {
                    const newCode = netlistCode + '\n.tran 1u 1m 0\n.control\nrun\nplot all\n.endc\n.end\n'
                    setNetlistCode(newCode)
                    setMissingSimCmd(false)
                  }}
                >
                  Quick Add Transient
                </Button>
              </div>
            )}

            <Editor code={netlistCode} onCodeChange={onCodeChange} dark={state} />
            <br />

            <Button variant="contained" color="primary" size="large" onClick={handleSimulationButtonClick}>
              Simulate
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              size="large"
              onClick={() => setHistoryOpen(true)}
              style={{ marginLeft: '10px' }}
            >
              History
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <SimulationHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectResult={handleSelectHistoryResult}
      />
      <ChatPanel />
    </Container>
  )
}
