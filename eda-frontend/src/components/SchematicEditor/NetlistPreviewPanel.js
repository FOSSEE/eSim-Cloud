import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  List,
  ListItem,
  Collapse,
  Button,
  Typography,
  IconButton,
  Snackbar,
  Box,
  CircularProgress,
  Switch,
  FormControlLabel,
  Chip
} from '@material-ui/core'
import MuiAlert from '@material-ui/lab/Alert'
import { makeStyles } from '@material-ui/core/styles'
import ExpandLess from '@material-ui/icons/ExpandLess'
import ExpandMore from '@material-ui/icons/ExpandMore'
import RefreshIcon from '@material-ui/icons/Refresh'
import FileCopyIcon from '@material-ui/icons/FileCopy'
import GetAppIcon from '@material-ui/icons/GetApp'
import CloseIcon from '@material-ui/icons/Close'
import DescriptionIcon from '@material-ui/icons/Description'
import AceEditor from 'react-ace'
import EmptyState from '../Shared/EmptyState.js'
import 'brace/theme/monokai'
import 'brace/theme/github'
import { useSelector, useDispatch } from 'react-redux'
import { setNetlist, toggleSimulate } from '../../redux/actions/index'

import { sanitizeNetlistForExport, buildNetlistFromGraph } from './Helper/NetlistExporter'

const useStyles = makeStyles((theme) => ({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    justifyContent: 'center',
    padding: theme.spacing(1)
  },
  footer: {
    padding: theme.spacing(1),
    textAlign: 'center',
    color: '#8c8c8c'
  },
  header: {
    margin: '5px'
  }
}))

export default function NetlistPreviewPanel ({ gridRef }) {
  const classes = useStyles()
  const [open, setOpen] = useState(false)
  const [netlistText, setNetlistText] = useState('// Netlist not generated yet.\n// Click Refresh to generate.')
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMessage, setSnackMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const [themeState, setThemeState] = useState({ checkedA: false })
  const [templateLoadedSnack, setTemplateLoadedSnack] = useState(false)

  const [livePreview, setLivePreview] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const livePreviewRef = useRef(livePreview)
  const refreshTimerRef = useRef(null)
  const handleRefreshRef = useRef(null)

  const isMounted = useRef(true)
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    livePreviewRef.current = livePreview
    if (!livePreview) {
      clearTimeout(refreshTimerRef.current)
    }
  }, [livePreview])

  useEffect(() => {
    const handleGraphChange = () => {
      setIsStale(true)
      if (livePreviewRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = setTimeout(() => {
          if (handleRefreshRef.current) {
            handleRefreshRef.current(true)
          }
        }, 800)
      }
    }
    window.addEventListener('esim-graph-changed', handleGraphChange)
    return () => {
      window.removeEventListener('esim-graph-changed', handleGraphChange)
      clearTimeout(refreshTimerRef.current)
    }
  }, [])

  const schSave = useSelector(state => state.saveSchematicReducer)
  const netfile = useSelector(state => state.netlistReducer)
  const projectName = schSave.title || 'Untitled_Schematic'
  // const history = useHistory()
  const dispatch = useDispatch()

  const templateNetlist = useSelector(state => state.netlistReducer.netlist)

  useEffect(() => {
    if (templateNetlist) {
      console.log('[NetlistPreviewPanel] templateNetlist changed to:', templateNetlist?.substring(0, 50))
      setNetlistText(templateNetlist)
      // Step 1 — Expand the panel
      setOpen(true)
      // Step 2 — Show success Snackbar
      setTemplateLoadedSnack(true)
      // Step 3 — Scroll into view after expansion animation
      setTimeout(() => {
        const panel = document.getElementById('netlist-preview-panel') || document.querySelector('[data-testid="netlist-preview-panel"]')
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    }
  }, [templateNetlist])

  const handleThemeChange = (event) => {
    setThemeState({ ...themeState, [event.target.name]: event.target.checked })
  }

  const handleToggle = () => {
    setOpen(!open)
  }

  const handleRefresh = (isAuto = false) => {
    setIsLoading(true)
    const timer = setTimeout(() => {
      if (isMounted.current) {
        setShowSpinner(true)
      }
    }, 100)

    setTimeout(() => {
      if (!isMounted.current) {
        clearTimeout(timer)
        return
      }
      const start = Date.now()
      if (!gridRef || !gridRef.current || !gridRef.current.graph) {
        setNetlistText('// Error: Graph not loaded yet.')
      } else {
        try {
          const compNetlist = buildNetlistFromGraph(gridRef.current.graph)
          if (!compNetlist) {
            setNetlistText('// Error: ERC check failed. Netlist not generated.')
          } else {
            let printToPlotControlBlock = ''
            if (netfile && netfile.controlBlock) {
              const ctrlblk = netfile.controlBlock.split('\n')
              for (let line = 0; line < ctrlblk.length; line++) {
                if (ctrlblk[line].includes('print')) {
                  printToPlotControlBlock += 'plot '
                  let cleanCode = ctrlblk[line].split('print ')[1]
                  cleanCode = cleanCode.split('>')[0]
                  printToPlotControlBlock += cleanCode + '\n'
                } else {
                  printToPlotControlBlock += ctrlblk[line] + '\n'
                }
              }
            } else {
              // P0 fix: Ensure complete netlist by adding default .control block
              printToPlotControlBlock = '\n.control\nrun\nplot all\n.endc\n.end\n'
            }

            const title = (netfile && netfile.title) ? netfile.title : projectName
            // P0 fix: Add default simulation command if missing
            const controlLine = (netfile && netfile.controlLine) ? netfile.controlLine : '.tran 1u 1m 0'

            const fullNetlist =
              title +
              '\n\n' +
              compNetlist.models +
              '\n' +
              compNetlist.main +
              '\n' +
              controlLine +
              '\n' +
              printToPlotControlBlock +
              '\n'

            setNetlistText(fullNetlist)
            setIsStale(false)
            if (isAuto !== true) {
              setSnackMessage('Netlist refreshed successfully!')
              setSnackOpen(true)
            }
          }
        } catch (e) {
          setNetlistText('// Error generating netlist:\n// ' + e.message)
        }
      }

      const duration = Date.now() - start
      if (duration > 500) {
        console.warn(`Netlist generation took ${duration}ms — consider turning off Live Preview for large schematics.`)
      }

      clearTimeout(timer)
      setShowSpinner(false)
      setIsLoading(false)
    }, 0)
  }

  useEffect(() => {
    handleRefreshRef.current = handleRefresh
  })

  const handleCopy = () => {
    if (!navigator.clipboard) {
      setSnackMessage('Clipboard API not available')
      setSnackOpen(true)
      return
    }
    navigator.clipboard.writeText(netlistText).then(() => {
      setSnackMessage('Copied to clipboard!')
      setSnackOpen(true)
    }).catch(err => {
      setSnackMessage('Failed to copy: ' + err.message)
      setSnackOpen(true)
    })
  }

  const handleDownload = () => {
    if (!netlistText || netlistText.trim() === '' || netlistText.startsWith('// Netlist not generated yet') || netlistText.startsWith('// Error:')) {
      setSnackMessage('Cannot download empty or invalid netlist.')
      setSnackOpen(true)
      return
    }
    const element = document.createElement('a')
    const file = new Blob([netlistText], { type: 'text/plain' })
    element.href = URL.createObjectURL(file)
    element.download = `${projectName}.cir`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const handleSendToSimulator = () => {
    let sanitized = sanitizeNetlistForExport(netlistText)
    const lowerCode = sanitized.toLowerCase()
    if (!lowerCode.includes('.tran') && !lowerCode.includes('.ac') && !lowerCode.includes('.dc ') && !lowerCode.includes('.op')) {
      sanitized += '\n* -- Add your simulation command here --\n.tran 1u 1m 0\n.control\nrun\nplot all\n.endc\n.end\n'
    }
    dispatch(setNetlist(sanitized))
    setSnackMessage('Netlist loaded in Simulator')
    setSnackOpen(true)
    dispatch(toggleSimulate())
  }

  const handleCloseSnack = (event, reason) => {
    if (reason === 'clickaway') return
    setSnackOpen(false)
  }

  // Calculate stats
  const lineCount = netlistText.split('\n').length
  const charCount = netlistText.length

  return (
    <>
      <List id="netlist-preview-panel" data-testid="netlist-preview-panel">
        <ListItem button onClick={handleToggle} divider>
          <h2 className={classes.header}>Netlist Preview</h2>
          {/* Min-width wrapper prevents layout shift when Chip appears/disappears */}
          <Box style={{ minWidth: 60, display: 'inline-flex', alignItems: 'center' }}>
            {isStale && (
              <Chip
                label="● Stale"
                size="small"
                // Warning color — MUI v4 Chip has no warning variant
                style={{ backgroundColor: '#f9a825', color: '#000', fontSize: '10px', marginLeft: '10px' }}
              />
            )}
          </Box>
          <Box flexGrow={1} />
          {open ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Box className={classes.actions}>
            <Button
              size="small"
              onClick={handleRefresh}
              variant="outlined"
              color="primary"
              disabled={isLoading}
            >
              {showSpinner ? <CircularProgress size={24} /> : (
                <>
                  <RefreshIcon style={{ marginRight: 8 }} />
                  Refresh
                </>
              )}
            </Button>
            <Button
              size="small"
              startIcon={<FileCopyIcon />}
              onClick={handleCopy}
              variant="outlined"
            >
              Copy
            </Button>
            <Button
              size="small"
              startIcon={<GetAppIcon />}
              onClick={handleDownload}
              variant="outlined"
            >
              Download
            </Button>
            <Button
              size="small"
              onClick={handleSendToSimulator}
              variant="contained"
              color="primary"
            >
              Send to Simulator
            </Button>
            <FormControlLabel
              style={{ marginLeft: 'auto' }}
              control={<Switch checked={livePreview} color="primary" onChange={(e) => setLivePreview(e.target.checked)} size="small" />}
              label={<Typography variant="caption">Live</Typography>}
            />
            <FormControlLabel
              style={{ marginLeft: '10px' }}
              control={<Switch checked={themeState.checkedA} color="primary" onChange={handleThemeChange} name="checkedA" size="small" />}
              label={<Typography variant="caption">Light Mode</Typography>}
            />
          </Box>
          {netlistText.startsWith('// Netlist not generated yet') ? (
            <EmptyState
              icon={<DescriptionIcon />}
              title="No Netlist Generated"
              description="Click Refresh to generate a netlist from your circuit schematic."
              actionLabel="Generate Netlist"
              onAction={handleRefresh}
              actionIcon={<RefreshIcon />}
              minHeight="300px"
            />
          ) : (
            <>
              <AceEditor
                style={{ width: '100%', minHeight: '300px', height: '300px' }}
                value={netlistText}
                onChange={(newValue) => setNetlistText(newValue)}
                theme={themeState.checkedA ? 'github' : 'monokai'}
                // P0 fix: Allow users to edit netlist directly
                readOnly={false}
                mode="text"
                editorProps={{
                  $blockScrolling: true
                }}
                setOptions={{
                  enableBasicAutocompletion: true,
                  enableLiveAutocompletion: true,
                  enableSnippets: true,
                  fontSize: 14,
                  showPrintMargin: false
                }}
              />
              <Typography variant="caption" display="block" className={classes.footer}>
                Line Count: {lineCount} | Char Count: {charCount}
              </Typography>
            </>
          )}
        </Collapse>
      </List>

      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left'
        }}
        open={snackOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnack}
        message={snackMessage}
        action={
          <IconButton size="small" aria-label="close" color="inherit" onClick={handleCloseSnack}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />

      {/* Template-loaded success snackbar with MUI Alert */}
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={templateLoadedSnack}
        autoHideDuration={5000}
        onClose={() => setTemplateLoadedSnack(false)}
      >
        <MuiAlert
          elevation={6}
          variant="filled"
          severity="success"
          onClose={() => setTemplateLoadedSnack(false)}
        >
          Template netlist loaded! Review it below, then click SEND TO SIMULATOR.
        </MuiAlert>
      </Snackbar>
    </>
  )
}

NetlistPreviewPanel.propTypes = {
  gridRef: PropTypes.object.isRequired
}
