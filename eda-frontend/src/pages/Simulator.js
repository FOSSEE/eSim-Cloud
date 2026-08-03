import React, { useState, useEffect, useRef, useCallback } from 'react'
import './VerilogSimulator.css'
import './SpiceSimulator.css'

// CodeMirror imports
import { Controlled as CodeMirror } from 'react-codemirror2'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/material-darker.css'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/selection/active-line'
import 'codemirror/addon/display/placeholder'

import { useDispatch, useSelector } from 'react-redux'
import { setNetlist } from '../redux/actions/index'
import { sanitizeNetlistForExport } from '../components/SchematicEditor/Helper/NetlistExporter'
import { saveSimulationRun } from '../utils/simulationHistory'
import textToFile from '../components/Simulator/textToFile'
import api from '../utils/Api'
import Graph from '../components/Shared/Graph'

// ── SVG Icons ──
const IconPlay = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
const IconUpload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
const IconSun = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
const IconMoon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
const IconDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
const IconMenu = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
const IconMaximize = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
const IconRestore = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
const IconTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
const IconFile = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
const IconZap = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
const IconChevronDown = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
const IconCircle = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"></circle></svg>
const IconX = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
const IconActivity = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>

// ──────────────────────────────────────────
//  Template Starter Netlist
// ──────────────────────────────────────────
const TEMPLATE_NETLIST = `* RC Low-pass Filter
V1 in 0 PULSE(0 5 0 1u 1u 5m 10m)
R1 in out 1k
C1 out 0 1u

.tran 10u 20m

.control
run
print all > data.txt
.endc
.end
`

// ──────────────────────────────────────────
//  Netlist Hierarchy Parser (Client-Side)
// ──────────────────────────────────────────
const COMPONENT_TYPES = {
  R: 'Resistor',
  C: 'Capacitor',
  L: 'Inductor',
  V: 'V Source',
  I: 'I Source',
  D: 'Diode',
  Q: 'BJT',
  M: 'MOSFET',
  J: 'JFET',
  X: 'Subcircuit',
  E: 'VCVS',
  F: 'CCCS',
  G: 'VCCS',
  H: 'CCVS',
  K: 'Coupling',
  S: 'Switch',
  W: 'Switch',
  T: 'Line',
  U: 'IC',
  B: 'Behavioral'
}

function parseNetlistHierarchy (files) {
  return files.map((file) => {
    const components = []
    const analyses = []
    const models = []
    const subckts = []

    file.content.split('\n').forEach((rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('*') || line.startsWith('+')) return
      const lower = line.toLowerCase()
      const firstToken = line.split(/\s+/)[0]

      if (line.startsWith('.')) {
        if (/^\.(tran|ac|dc|op|noise|disto|tf|pz|sens|four)\b/.test(lower)) {
          analyses.push(line)
        } else if (lower.startsWith('.model')) {
          const name = line.split(/\s+/)[1]
          if (name) models.push(name)
        } else if (lower.startsWith('.subckt')) {
          const name = line.split(/\s+/)[1]
          if (name) subckts.push(name)
        }
        return
      }

      const typeKey = firstToken[0].toUpperCase()
      if (COMPONENT_TYPES[typeKey]) {
        components.push({ name: firstToken, type: COMPONENT_TYPES[typeKey] })
      }
    })

    return { filename: file.filename, components, analyses, models, subckts }
  })
}

// ──────────────────────────────────────────
//  Console Message Classifier
// ──────────────────────────────────────────
function classifyLine (line) {
  const lower = line.toLowerCase()
  if (lower.includes('error')) return 'error'
  if (lower.includes('warning')) return 'warning'
  if (lower.includes('[ok]') || lower.includes('success') || lower.includes('passed')) return 'success'
  if (lower.includes('[info]') || lower.startsWith('>')) return 'info'
  if (lower.startsWith('[') || lower.includes('simulat')) return 'system'
  return ''
}

function getTimestamp () {
  const now = new Date()
  return now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

// Trace colors for analog waveforms (1-based index, as Shared/Graph expects)
const TRACE_PALETTE = ['#1e66f5', '#d20f39', '#40a02b', '#df8e1d', '#8839ef', '#179299', '#fe640b', '#ea76cb']

function buildProbeColors (labels) {
  const colors = {}
  for (let i = 1; i < labels.length; i++) {
    colors[i] = TRACE_PALETTE[(i - 1) % TRACE_PALETTE.length]
  }
  return colors
}

// ──────────────────────────────────────────
//  Main Component
// ──────────────────────────────────────────
export default function Simulator () {
  const dispatch = useDispatch()
  const reduxNetlist = useSelector(state => state.netlistReducer.netlist)

  // ── File Tabs ──
  const [files, setFiles] = useState([
    { filename: 'netlist.cir', content: TEMPLATE_NETLIST }
  ])
  const [activeTab, setActiveTab] = useState(0)

  // ── Console ──
  const [consoleLines, setConsoleLines] = useState([
    { text: 'eSim Spice Simulator ready. Use Ctrl+Shift+B to check netlist, Ctrl+Shift+R to run.', type: 'system', time: getTimestamp() }
  ])
  const consoleEndRef = useRef(null)

  // ── Waveform ──
  // Merged graph data ({ labels, x, y }) as consumed by Shared/Graph —
  // the same viewer the schematic editor's simulation screen uses.
  const [waveformData, setWaveformData] = useState(null)
  const [waveformVisible, setWaveformVisible] = useState(false)

  // ── Hierarchy ──
  const [hierarchy, setHierarchy] = useState([])
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(false)

  // ── Panel States ──
  const [maximizedPanel, setMaximizedPanel] = useState(null) // 'editor' | 'console' | 'waveform' | 'hierarchy' | null
  const [bottomHeight, setBottomHeight] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false) // Light mode is default
  const [engine, setEngine] = useState('ngspice')

  // ── Simulation State ──
  const [isRunning, setIsRunning] = useState(false)
  const pollRef = useRef(null)

  // ── File Upload ──
  const fileInputRef = useRef(null)

  // ── Page Title ──
  useEffect(() => {
    document.title = 'Spice Simulator - eSim'
  }, [])

  // ── Import netlist forwarded from the Schematic Editor ──
  useEffect(() => {
    if (reduxNetlist && reduxNetlist.trim()) {
      setFiles(prev => prev.map((f, i) => i === 0 ? { ...f, content: reduxNetlist } : f))
    }
  }, [reduxNetlist])

  // ── Auto-scroll console ──
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [consoleLines])

  // ── Update hierarchy when files change ──
  useEffect(() => {
    setHierarchy(parseNetlistHierarchy(files))
  }, [files])

  // ── Cleanup polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ── Console Helper ──
  const addConsoleMessage = useCallback((text, type) => {
    setConsoleLines(prev => [...prev, { text, type: type || classifyLine(text), time: getTimestamp() }])
  }, [])

  // ── File Tab Management ──
  const addFile = () => {
    let idx = files.length
    let name = 'netlist_' + idx + '.cir'
    while (files.some(f => f.filename === name)) {
      idx++
      name = 'netlist_' + idx + '.cir'
    }
    setFiles(prev => [...prev, { filename: name, content: '' }])
    setActiveTab(files.length)
  }

  const removeFile = (index) => {
    if (files.length <= 1) return
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
    if (activeTab >= newFiles.length) {
      setActiveTab(newFiles.length - 1)
    } else if (activeTab === index) {
      setActiveTab(Math.max(0, index - 1))
    }
  }

  const renameFile = (index) => {
    const currentName = files[index].filename
    const newName = window.prompt('Rename file:', currentName)
    if (newName && newName.trim() && newName !== currentName) {
      const trimmed = newName.trim()
      if (files.some((f, i) => i !== index && f.filename === trimmed)) {
        window.alert('A file with that name already exists.')
        return
      }
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, filename: trimmed } : f))
    }
  }

  const updateFileContent = (index, content) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, content } : f))
  }

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files)
    if (!uploadedFiles.length) return

    const newFilesPromises = uploadedFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          resolve({ filename: file.name, content: ev.target.result })
        }
        reader.readAsText(file)
      })
    })

    Promise.all(newFilesPromises).then(results => {
      setFiles(prev => {
        const nextFiles = [...prev]
        results.forEach(res => {
          let finalName = res.filename
          let idx = 1
          while (nextFiles.some(f => f.filename === finalName)) {
            const parts = res.filename.split('.')
            const ext = parts.length > 1 ? '.' + parts.pop() : ''
            const name = parts.join('.')
            finalName = `${name}_${idx}${ext}`
            idx++
          }
          nextFiles.push({ ...res, filename: finalName })
        })
        return nextFiles
      })
      addConsoleMessage(`[INFO] Successfully uploaded ${results.length} file(s).`, 'info')
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Netlist Checks ──
  const hasSimulationCommand = (code) => {
    const lower = code.toLowerCase()
    return lower.includes('.tran') || lower.includes('.ac') || lower.includes('.dc ') || lower.includes('.op')
  }

  const checkNetlist = () => {
    const file = files[activeTab]
    addConsoleMessage('▶ Checking netlist: ' + file.filename, 'system')
    const code = file.content
    const lower = code.toLowerCase()
    let errors = 0

    if (!code.trim()) {
      addConsoleMessage('[ERROR] Netlist is empty.', 'error')
      errors++
    }
    if (code.trim() && !lower.includes('.end')) {
      addConsoleMessage('[ERROR] Missing .end statement at the end of the netlist.', 'error')
      errors++
    }
    if (code.trim() && !hasSimulationCommand(code)) {
      addConsoleMessage('[ERROR] No simulation command found. Add one of these before .end:', 'error')
      addConsoleMessage('    .tran 10u 10m 0      (Transient: timestep stoptime start)', 'info')
      addConsoleMessage('    .ac dec 10 1 1Meg    (AC analysis)', 'info')
      addConsoleMessage('    .dc V1 0 5 0.1       (DC sweep)', 'info')
      errors++
    }
    const controlCount = (lower.match(/^\s*\.control\b/gm) || []).length
    const endcCount = (lower.match(/^\s*\.endc\b/gm) || []).length
    if (controlCount !== endcCount) {
      addConsoleMessage('[ERROR] Unbalanced .control/.endc block.', 'error')
      errors++
    }
    const subcktCount = (lower.match(/^\s*\.subckt\b/gm) || []).length
    const endsCount = (lower.match(/^\s*\.ends\b/gm) || []).length
    if (subcktCount !== endsCount) {
      addConsoleMessage('[ERROR] Unbalanced .subckt/.ends block.', 'error')
      errors++
    }

    if (errors === 0) {
      addConsoleMessage('[OK] Netlist check passed.', 'success')
    } else {
      addConsoleMessage(`✗ Netlist check failed with ${errors} issue(s).`, 'error')
    }
    return errors === 0
  }

  const insertTransientBlock = () => {
    const code = files[activeTab].content
    const newCode = code + '\n.tran 1u 1m 0\n.control\nrun\nprint all > data.txt\n.endc\n.end\n'
    updateFileContent(activeTab, newCode)
    addConsoleMessage('[INFO] Added transient analysis block to ' + files[activeTab].filename + '.', 'info')
  }

  // ── Simulation ──
  const runSimulation = () => {
    const file = files[activeTab]
    if (!hasSimulationCommand(file.content)) {
      addConsoleMessage('[ERROR] No simulation command found in ' + file.filename + '. Use Check Netlist for details, or Add .tran to insert a transient block.', 'error')
      return
    }

    const sanitized = sanitizeNetlistForExport(file.content)
    dispatch(setNetlist(sanitized))

    setIsRunning(true)
    setWaveformData(null)
    addConsoleMessage('▶ Starting ' + engine + ' simulation...', 'system')

    const token = localStorage.getItem('esim_auth_token')
    const formData = new FormData()
    formData.append('file', textToFile(sanitized))
    const config = { headers: { 'content-type': 'multipart/form-data' } }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }

    api.post('simulation/upload', formData, config)
      .then((response) => {
        const taskId = response.data.details.task_id
        if (!taskId) {
          addConsoleMessage('[ERROR] No task ID received from server.', 'error')
          setIsRunning(false)
          return
        }
        addConsoleMessage('Task dispatched: ' + taskId, 'system')
        pollSimulation(taskId)
      })
      .catch((err) => {
        addConsoleMessage('[ERROR] Request failed: ' + (err.response ? JSON.stringify(err.response.data) : err.message), 'error')
        setIsRunning(false)
      })
  }

  const pollSimulation = (taskId) => {
    let attempts = 0
    const maxAttempts = 120 // 2 minutes max

    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(pollRef.current)
        addConsoleMessage('[ERROR] Polling timed out after 2 minutes.', 'error')
        setIsRunning(false)
        return
      }

      try {
        const res = await api.get('simulation/status/' + taskId)
        const state = res.data.state
        if (state === 'PROGRESS' || state === 'PENDING') return

        clearInterval(pollRef.current)
        const details = res.data.details

        if (details && Object.prototype.hasOwnProperty.call(details, 'fail')) {
          const msg = String(details.fail).replace("b'", '')
          msg.split('\\n').join('\n').split('\n').forEach(line => {
            if (line.trim()) addConsoleMessage(line, 'error')
          })
          // Structured error help from the backend parser, when available.
          if (details.error_help) {
            if (details.error_help.summary) {
              addConsoleMessage('[INFO] ' + details.error_help.summary, 'info')
            }
            (details.error_help.hints || []).forEach(hint => {
              addConsoleMessage('    • ' + hint, 'info')
            })
          }
          addConsoleMessage('✗ Simulation failed.', 'error')
          saveSimulationRun({
            timestamp: new Date().toISOString(),
            success: false,
            simulationType: 'NgSpiceSimulator',
            result: details,
            errorHelp: details.error_help || null,
            netlist: files[activeTab].content
          })
          setIsRunning(false)
          return
        }

        if (!details || !details.data) {
          addConsoleMessage('[ERROR] Simulation returned no data.', 'error')
          setIsRunning(false)
          return
        }

        if (details.graph === 'true') {
          // Merge all result datasets into the single { labels, x, y }
          // shape Shared/Graph expects: labels[0] is the x-axis name.
          const merged = { labels: [], x: [], y: [] }
          details.data.forEach((d, i) => {
            if (i === 0) {
              merged.labels.push(d.labels[0])
              merged.x = d.x.map(v => parseFloat(v))
            }
            d.labels.slice(1).forEach(l => merged.labels.push(l))
            d.y.forEach(row => merged.y.push(row.map(v => parseFloat(v))))
          })
          setWaveformData(merged)
          setWaveformVisible(true)
          addConsoleMessage('Waveform data loaded.', 'success')
        } else {
          setWaveformData(null)
          addConsoleMessage('─── Simulation Output ───', 'info')
          details.data.forEach(row => {
            let postfixUnit = ''
            let label = row[0]
            if (label.includes('#branch')) {
              postfixUnit = 'A'
            } else if (label.includes('transfer_function')) {
              postfixUnit = ''
            } else if (label.includes('impedance')) {
              postfixUnit = 'Ohm'
            } else {
              label = `V(${label})`
              postfixUnit = 'V'
            }
            addConsoleMessage(label + ' ' + row[1] + ' ' + parseFloat(row[2]) + ' ' + postfixUnit)
          })
        }

        addConsoleMessage('✓ Simulation completed successfully.', 'success')
        saveSimulationRun({
          timestamp: new Date().toISOString(),
          success: true,
          simulationType: 'NgSpiceSimulator',
          result: null,
          errorHelp: null,
          netlist: files[activeTab].content
        })
        setIsRunning(false)
      } catch (pollErr) {
        clearInterval(pollRef.current)
        addConsoleMessage('[ERROR] Polling error: ' + pollErr.message, 'error')
        setIsRunning(false)
      }
    }, 1000)
  }

  // ── Downloads ──
  const downloadNetlist = () => {
    const file = files[activeTab]
    const blob = new Blob([file.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    a.click()
    URL.revokeObjectURL(url)
    addConsoleMessage('Netlist downloaded: ' + file.filename, 'success')
  }

  const downloadWaveformCSV = () => {
    if (!waveformData || !waveformData.x || waveformData.x.length === 0) {
      addConsoleMessage('[INFO] No waveform data available. Run a simulation first.', 'info')
      return
    }
    const lines = [waveformData.labels.join(',')]
    for (let i = 0; i < waveformData.x.length; i++) {
      const row = [waveformData.x[i]]
      waveformData.y.forEach(sig => row.push(sig[i]))
      lines.push(row.join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulation_data.csv'
    a.click()
    URL.revokeObjectURL(url)
    addConsoleMessage('Waveform data downloaded as CSV.', 'success')
  }

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        if (!isRunning) checkNetlist()
      } else if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (!isRunning) runSimulation()
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        addConsoleMessage('[INFO] Project saved locally.', 'system')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // ── Resize Handle Logic ──
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = bottomHeight

    const onMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, startHeight + delta))
      setBottomHeight(newHeight)
    }

    const onUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Toggle Maximize ──
  const toggleMaximize = (panel) => {
    setMaximizedPanel(prev => prev === panel ? null : panel)
  }

  // ── Navigate to file from hierarchy ──
  const navigateToFile = (filename) => {
    const idx = files.findIndex(f => f.filename === filename)
    if (idx >= 0) setActiveTab(idx)
  }

  // ── CodeMirror Options ──
  const cmOptions = {
    mode: null,
    theme: isDarkMode ? 'material-darker' : 'default',
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    placeholder: 'Write your SPICE netlist here...'
  }

  // ──────────────────────────────────────────
  //  Render
  // ──────────────────────────────────────────

  // If a panel is maximized, render only that panel
  if (maximizedPanel === 'editor') {
    return (
      <div className={`verilog-ide ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="verilog-editor-panel verilog-panel-maximized">
          <div className="verilog-panel-header">
            <span>Code Editor</span>
            <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('editor')} title="Restore"><IconRestore /></button>
          </div>
          {renderTabs()}
          <div className="verilog-editor-container">
            <CodeMirror
              value={files[activeTab] ? files[activeTab].content : ''}
              options={cmOptions}
              onBeforeChange={(editor, data, value) => updateFileContent(activeTab, value)}
            />
          </div>
        </div>
      </div>
    )
  }

  if (maximizedPanel === 'console') {
    return (
      <div className={`verilog-ide ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="verilog-console verilog-panel-maximized">
          <div className="verilog-panel-header">
            <span>Output Console</span>
            <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('console')} title="Restore"><IconRestore /></button>
          </div>
          {renderConsole()}
        </div>
      </div>
    )
  }

  if (maximizedPanel === 'waveform') {
    return (
      <div className={`verilog-ide ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="verilog-waveform verilog-panel-maximized">
          <div className="verilog-panel-header">
            <span>Waveform Viewer</span>
            <div>
              <button className="verilog-panel-header-btn" onClick={downloadWaveformCSV} title="Download CSV"><IconDownload /></button>
              <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('waveform')} title="Restore"><IconRestore /></button>
            </div>
          </div>
          {renderWaveform()}
        </div>
      </div>
    )
  }

  if (maximizedPanel === 'hierarchy') {
    return (
      <div className={`verilog-ide ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="verilog-hierarchy verilog-panel-maximized">
          <div className="verilog-panel-header">
            <span>Circuit Hierarchy</span>
            <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('hierarchy')} title="Restore"><IconRestore /></button>
          </div>
          {renderHierarchyTree()}
        </div>
      </div>
    )
  }

  // ── Helper Render Functions ──
  function renderTabs () {
    return (
      <div className="verilog-tabs">
        {files.map((file, idx) => (
          <div
            key={idx}
            className={'verilog-tab' + (idx === activeTab ? ' active' : '')}
            onClick={() => setActiveTab(idx)}
            onDoubleClick={() => renameFile(idx)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconFile /> {file.filename}
            </span>
            {files.length > 1 && (
              <span className="verilog-tab-close" onClick={(e) => { e.stopPropagation(); removeFile(idx) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </span>
            )}
          </div>
        ))}
        <div className="verilog-tab-add" onClick={addFile} title="Add new file">+</div>
      </div>
    )
  }

  function renderConsole () {
    return (
      <div className="verilog-console-content">
        {consoleLines.map((line, idx) => (
          <div key={idx} className={'verilog-console-line ' + line.type}>
            <span className="verilog-console-timestamp">[{line.time}]</span>
            {line.text}
          </div>
        ))}
        <div ref={consoleEndRef} />
      </div>
    )
  }

  function renderWaveform () {
    if (!waveformData || !waveformData.x || waveformData.x.length === 0) {
      return (
        <div className="verilog-waveform-content">
          <div className="verilog-waveform-empty">
            Run a simulation to see waveforms here.
          </div>
        </div>
      )
    }

    return (
      <div className="verilog-waveform-content">
        <div className="spice-graph-card">
          <Graph
            labels={waveformData.labels}
            x={waveformData.x}
            y={waveformData.y}
            xscale="si"
            yscale="si"
            precision={5}
            probeColors={buildProbeColors(waveformData.labels)}
          />
        </div>
      </div>
    )
  }

  function renderHierarchyTree () {
    if (hierarchy.length === 0 || hierarchy.every(f => f.components.length === 0 && f.analyses.length === 0 && f.subckts.length === 0)) {
      return (
        <div className="verilog-hierarchy-tree">
          <div style={{ color: '#585b70', fontSize: '12px', padding: '8px' }}>
            No components detected.
          </div>
        </div>
      )
    }

    return (
      <div className="verilog-hierarchy-tree">
        {hierarchy.map((file) => (
          <div key={file.filename}>
            <div
              className={'verilog-hierarchy-item' + (files[activeTab] && files[activeTab].filename === file.filename ? ' active' : '')}
              onClick={() => navigateToFile(file.filename)}
              style={{ paddingLeft: '8px' }}
            >
              <span className="icon" style={{ display: 'flex', alignItems: 'center' }}>
                <IconChevronDown />
              </span>
              <span>{file.filename}</span>
            </div>
            <div className="verilog-hierarchy-children">
              {file.components.map((comp, i) => (
                <div
                  key={'c' + i}
                  className="verilog-hierarchy-item"
                  onClick={() => navigateToFile(file.filename)}
                  style={{ paddingLeft: '24px' }}
                >
                  <span className="icon" style={{ display: 'flex', alignItems: 'center' }}><IconCircle /></span>
                  <span>{comp.name} <span style={{ opacity: 0.6 }}>({comp.type})</span></span>
                </div>
              ))}
              {file.subckts.map((name, i) => (
                <div
                  key={'s' + i}
                  className="verilog-hierarchy-item"
                  onClick={() => navigateToFile(file.filename)}
                  style={{ paddingLeft: '24px' }}
                >
                  <span className="icon" style={{ display: 'flex', alignItems: 'center' }}><IconCircle /></span>
                  <span>{name} <span style={{ opacity: 0.6 }}>(Subckt)</span></span>
                </div>
              ))}
              {file.analyses.map((line, i) => (
                <div
                  key={'a' + i}
                  className="verilog-hierarchy-item"
                  onClick={() => navigateToFile(file.filename)}
                  style={{ paddingLeft: '24px' }}
                >
                  <span className="icon" style={{ display: 'flex', alignItems: 'center' }}><IconZap /></span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Default Layout ──
  return (
    <div className={`verilog-ide ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Toolbar */}
      <div className="verilog-toolbar">
        <div className="verilog-toolbar-left">
          <span className="verilog-toolbar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconZap /> Spice Simulator
          </span>
          <button
            className="verilog-toolbar-btn success"
            onClick={runSimulation}
            disabled={isRunning}
          >
            {isRunning ? <span className="verilog-spinner" /> : <IconPlay />}
            Run
            <span className="verilog-shortcut-hint">Ctrl+Shift+R</span>
          </button>
          <button
            className="verilog-toolbar-btn primary"
            onClick={checkNetlist}
            disabled={isRunning}
          >
            <IconCheck /> Check Netlist
            <span className="verilog-shortcut-hint">Ctrl+Shift+B</span>
          </button>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              className="verilog-toolbar-btn"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              title="Select Simulation Engine"
              style={{ outline: 'none', appearance: 'none', paddingRight: '28px', cursor: 'pointer', height: '100%', margin: 0 }}
            >
              <option value="ngspice">Ngspice</option>
            </select>
            <div style={{ position: 'absolute', right: '10px', pointerEvents: 'none', display: 'flex', color: 'var(--text-main)' }}>
              <IconChevronDown />
            </div>
          </div>

          <button
            className="verilog-toolbar-btn primary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            title="Upload local netlist files"
          >
            <IconUpload /> Upload Files
          </button>
          <input
            type="file"
            multiple
            accept=".cir,.net,.sp,.spice,.txt"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button
            className="verilog-toolbar-btn"
            onClick={insertTransientBlock}
            title="Append a transient analysis + control block to the active netlist"
          >
            <IconZap /> Add .tran
          </button>
        </div>
        <div className="verilog-toolbar-right">
          <button
            className="verilog-toolbar-btn"
            onClick={() => setIsDarkMode(prev => !prev)}
            title="Toggle Light/Dark Mode"
          >
            {isDarkMode ? <><IconSun /> Light Mode</> : <><IconMoon /> Dark Mode</>}
          </button>
          <button className="verilog-toolbar-btn" onClick={downloadNetlist}>
            <IconDownload /> Download Netlist
          </button>
          <button
            className="verilog-toolbar-btn"
            onClick={() => setWaveformVisible(prev => !prev)}
          >
            <IconActivity /> {waveformVisible ? 'Hide Waveform' : 'Show Waveform'}
          </button>
          <button
            className="verilog-toolbar-btn"
            onClick={() => setHierarchyCollapsed(prev => !prev)}
          >
            <IconMenu /> {hierarchyCollapsed ? 'Show Hierarchy' : 'Hide Hierarchy'}
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="verilog-main">
        {/* Hierarchy Sidebar */}
        <div className={'verilog-hierarchy' + (hierarchyCollapsed ? ' collapsed' : '')}>
          <div className="verilog-panel-header">
            <span>Hierarchy</span>
            <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('hierarchy')} title="Maximize"><IconMaximize /></button>
          </div>
          {renderHierarchyTree()}
        </div>

        {/* Workspace: editor + console left, waveform right */}
        <div className="spice-workspace">
          {/* Left: Editor + Console */}
          <div className="spice-left">
            {/* Editor Panel */}
            <div className="verilog-editor-panel">
              <div className="verilog-panel-header">
                <span>Editor</span>
                <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('editor')} title="Maximize"><IconMaximize /></button>
              </div>
              {renderTabs()}
              <div className="verilog-editor-container">
                <CodeMirror
                  value={files[activeTab] ? files[activeTab].content : ''}
                  options={cmOptions}
                  onBeforeChange={(editor, data, value) => updateFileContent(activeTab, value)}
                />
              </div>
            </div>

            {/* Resize Handle */}
            <div
              className="verilog-resize-handle"
              onMouseDown={handleResizeStart}
              style={{ cursor: isResizing ? 'row-resize' : undefined }}
            />

            {/* Console */}
            <div className="verilog-bottom" style={{ height: bottomHeight + 'px' }}>
              <div className="verilog-console">
                <div className="verilog-panel-header">
                  <span>Console</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="verilog-panel-header-btn"
                      onClick={() => setConsoleLines([])}
                      title="Clear Console"
                    >
                      <IconTrash />
                    </button>
                    <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('console')} title="Maximize"><IconMaximize /></button>
                  </div>
                </div>
                {renderConsole()}
              </div>
            </div>
          </div>

          {/* Right: Waveform */}
          <div className={'spice-right' + (waveformVisible ? '' : ' hidden')}>
            <div className="verilog-waveform">
              <div className="verilog-panel-header">
                <span>Waveform</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="verilog-panel-header-btn" onClick={downloadWaveformCSV} title="Download CSV"><IconDownload /></button>
                  <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('waveform')} title="Maximize"><IconMaximize /></button>
                  <button className="verilog-panel-header-btn" onClick={() => setWaveformVisible(false)} title="Hide Waveform"><IconX /></button>
                </div>
              </div>
              {renderWaveform()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
