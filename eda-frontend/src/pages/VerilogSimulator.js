import React, { useState, useEffect, useRef, useCallback } from 'react'
import './VerilogSimulator.css'

// CodeMirror imports
import { Controlled as CodeMirror } from 'react-codemirror2'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/material-darker.css'
import 'codemirror/mode/verilog/verilog'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/selection/active-line'
import 'codemirror/addon/display/placeholder'

import api from '../utils/Api'
import Graph from '../components/Shared/WaveformGraph'

// ── SVG Icons ──
const IconPlay = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>;
const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconUpload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>;
const IconSun = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>;
const IconMoon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>;
const IconDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>;
const IconMenu = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
const IconMaximize = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>;
const IconRestore = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>;
const IconTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const IconFile = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>;
const IconCpu = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>;
const IconChevronDown = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
const IconCircle = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"></circle></svg>;

// ──────────────────────────────────────────
//  Template Starter Code
// ──────────────────────────────────────────
const TEMPLATE_SOURCE = `// 2-Input AND Gate
module and_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = a & b;
endmodule
`

const TEMPLATE_TESTBENCH = `\`timescale 1ns/1ps

module tb_and_gate;
    reg a, b;
    wire y;

    // Instantiate the Unit Under Test
    and_gate uut (
        .a(a),
        .b(b),
        .y(y)
    );

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_and_gate);

        // Test all input combinations
        a = 0; b = 0; #10;
        a = 0; b = 1; #10;
        a = 1; b = 0; #10;
        a = 1; b = 1; #10;

        $display("All tests completed.");
        $finish;
    end

    // Monitor signal changes
    initial begin
        $monitor("Time=%0t  a=%b  b=%b  y=%b", $time, a, b, y);
    end
endmodule
`

// ──────────────────────────────────────────
//  Hierarchy Parser (Client-Side Regex)
// ──────────────────────────────────────────
function parseHierarchy (files) {
  const modules = {}
  const instances = []

  files.forEach((file) => {
    // Find module declarations
    const moduleRegex = /\bmodule\s+(\w+)/g
    let match
    while ((match = moduleRegex.exec(file.content)) !== null) {
      modules[match[1]] = { name: match[1], file: file.filename, children: [] }
    }
  })

  files.forEach((file) => {
    // Find instantiations: <ModuleName> <instance_name> (
    const instRegex = /\b(\w+)\s+(\w+)\s*\(/g
    let match
    while ((match = instRegex.exec(file.content)) !== null) {
      const moduleName = match[1]
      const instanceName = match[2]
      // Skip Verilog keywords and primitives
      const keywords = new Set([
        'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg',
        'assign', 'always', 'initial', 'begin', 'end', 'if', 'else',
        'case', 'endcase', 'for', 'while', 'function', 'endfunction',
        'task', 'endtask', 'parameter', 'localparam', 'integer',
        'generate', 'endgenerate', 'posedge', 'negedge'
      ])
      if (keywords.has(moduleName) || keywords.has(instanceName)) continue
      if (modules[moduleName]) {
        instances.push({ parent: file.filename, module: moduleName, instance: instanceName })
      }
    }
  })

  // Build tree: find top-level modules (those never instantiated by others)
  const instantiatedModules = new Set(instances.map(i => i.module))
  const topModules = Object.keys(modules).filter(m => !instantiatedModules.has(m))

  // Attach children
  instances.forEach(inst => {
    // Find which module contains this instantiation
    Object.values(modules).forEach(mod => {
      if (mod.file === inst.parent) {
        // This is the parent module file — but we need the actual parent module name
        // For simplicity, add children to the module defined in the same file
        mod.children.push({ name: inst.module, instance: inst.instance })
      }
    })
  })

  return { modules, topModules }
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
  if (lower.startsWith('[') || lower.includes('compil') || lower.includes('simulat')) return 'system'
  return ''
}

function getTimestamp () {
  const now = new Date()
  return now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

// ──────────────────────────────────────────
//  Main Component
// ──────────────────────────────────────────
export default function VerilogSimulator () {
  // ── File Tabs ──
  const [files, setFiles] = useState([
    { filename: 'and_gate.v', content: TEMPLATE_SOURCE, isTestbench: false },
    { filename: 'tb_and_gate.v', content: TEMPLATE_TESTBENCH, isTestbench: true }
  ])
  const [activeTab, setActiveTab] = useState(0)

  // ── Console ──
  const [consoleLines, setConsoleLines] = useState([
    { text: 'eSim Verilog Simulator ready. Use Ctrl+Shift+B to check syntax, Ctrl+Shift+R to run.', type: 'system', time: getTimestamp() }
  ])
  const consoleEndRef = useRef(null)

  // ── Waveform ──
  const [waveformData, setWaveformData] = useState(null)

  // ── Hierarchy ──
  const [hierarchy, setHierarchy] = useState({ modules: {}, topModules: [] })
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(false)

  // ── Panel States ──
  const [maximizedPanel, setMaximizedPanel] = useState(null) // 'editor' | 'console' | 'waveform' | 'hierarchy' | null
  const [bottomHeight, setBottomHeight] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false) // Light mode is default
  const [compiler, setCompiler] = useState('iverilog') // 'iverilog' | 'systemverilog'

  // ── Simulation State ──
  const [isRunning, setIsRunning] = useState(false)
  const pollRef = useRef(null)
  
  // ── Editor State ──
  const [editorInstance, setEditorInstance] = useState(null)
  const [syntaxErrors, setSyntaxErrors] = useState([])

  // ── File Upload ──
  const fileInputRef = useRef(null)

  // ── Page Title ──
  useEffect(() => {
    document.title = 'Verilog Simulator - eSim'
  }, [])

  // ── Auto-scroll console ──
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [consoleLines])

  // ── Update hierarchy when files change ──
  useEffect(() => {
    setHierarchy(parseHierarchy(files))
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

  // ── Error Highlighting ──
  useEffect(() => {
    if (!editorInstance) return;

    // Clear old errors
    editorInstance.eachLine((lineHandle) => {
      editorInstance.removeLineClass(lineHandle, 'background', 'cm-error-line');
    });

    if (syntaxErrors.length === 0) return;

    const currentFilename = files[activeTab]?.filename;
    const firstError = syntaxErrors.find(err => err.filename === currentFilename);
    
    if (firstError) {
      // Line numbers are 0-indexed in CodeMirror, iverilog is 1-indexed
      const lineIdx = Math.max(0, firstError.line - 1);
      const lineCount = editorInstance.lineCount();
      if (lineIdx < lineCount) {
        editorInstance.addLineClass(lineIdx, 'background', 'cm-error-line');
      }
    }
  }, [editorInstance, syntaxErrors, activeTab, files]);

  // ── File Tab Management ──
  const addFile = () => {
    let idx = files.length
    let name = 'module_' + idx + '.v'
    while (files.some(f => f.filename === name)) {
      idx++
      name = 'module_' + idx + '.v'
    }
    setFiles(prev => [...prev, { filename: name, content: '', isTestbench: false }])
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

  const toggleTestbench = (index) => {
    setFiles(prev => prev.map((f, i) => {
      if (i === index) return { ...f, isTestbench: !f.isTestbench }
      // Only one testbench allowed — unmark others if this becomes testbench
      if (!files[index].isTestbench) return { ...f, isTestbench: false }
      return f
    }))
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
          resolve({
            filename: file.name,
            content: ev.target.result,
            isTestbench: file.name.toLowerCase().includes('tb') || file.name.toLowerCase().includes('test')
          })
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

  // ── Simulation ──
  const getSourcesAndTestbench = () => {
    const testbench = files.find(f => f.isTestbench)
    if (!testbench) {
      addConsoleMessage('[ERROR] No testbench file designated. Right-click a tab to mark it as testbench.', 'error')
      return null
    }
    const sources = files.filter(f => !f.isTestbench).map(f => ({ filename: f.filename, content: f.content }))
    return {
      sources,
      testbench: { filename: testbench.filename, content: testbench.content }
    }
  }

  const submitSimulation = async (mode) => {
    const payload = getSourcesAndTestbench()
    if (!payload) return

    setIsRunning(true)
    setSyntaxErrors([])
    addConsoleMessage(mode === 'syntax_check' ? '▶ Checking syntax...' : '▶ Starting simulation...', 'system')

    try {
      const res = await api.post('verilog/upload', { ...payload, mode, compiler })
      const taskId = res.data.task_id

      if (!taskId) {
        addConsoleMessage('[ERROR] No task ID received from server.', 'error')
        setIsRunning(false)
        return
      }

      addConsoleMessage('Task dispatched: ' + taskId, 'system')

      // Poll for results
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
          const statusRes = await api.get('verilog/status/' + taskId)
          const state = statusRes.data.state

          if (state === 'SUCCESS') {
            clearInterval(pollRef.current)
            const details = statusRes.data.details || {}

            // Show compile log
            if (details.compile_log) {
              const logErrors = [];
              // iverilog error format: /absolute/path/filename.v:10: error message
              const regex = /^([^:]+):(\d+):\s*(.*)/;

              details.compile_log.split('\n').forEach(line => {
                if (line.trim()) addConsoleMessage(line)
                
                const match = line.match(regex);
                if (match) {
                  const fullPath = match[1].trim();
                  const filename = fullPath.split('/').pop();
                  
                  logErrors.push({
                    filename: filename,
                    line: parseInt(match[2], 10),
                    message: match[3].trim()
                  });
                }
              })
              setSyntaxErrors(logErrors);
            } else {
              setSyntaxErrors([]);
            }

            // Show simulation output
            if (details.sim_output) {
              addConsoleMessage('─── Simulation Output ───', 'info')
              details.sim_output.split('\n').forEach(line => {
                if (line.trim()) addConsoleMessage(line)
              })
            }

            // Handle waveform
            if (details.waveform && details.waveform.graph === 'true') {
              setWaveformData(details.waveform)
              addConsoleMessage('Waveform data loaded.', 'success')
            }

            // Store raw VCD for download
            if (details.vcd_raw) {
              window.__verilog_vcd_raw = details.vcd_raw
            }

            if (details.success) {
              addConsoleMessage('✓ ' + (mode === 'syntax_check' ? 'Syntax check' : 'Simulation') + ' completed successfully.', 'success')
            } else {
              addConsoleMessage('✗ ' + (mode === 'syntax_check' ? 'Syntax check' : 'Simulation') + ' failed.', 'error')
            }

            setIsRunning(false)
          } else if (state === 'FAILURE') {
            clearInterval(pollRef.current)
            const details = statusRes.data.details || {}
            addConsoleMessage('[ERROR] Task failed: ' + JSON.stringify(details), 'error')
            setIsRunning(false)
          }
          // else PENDING/PROGRESS — keep polling
        } catch (pollErr) {
          clearInterval(pollRef.current)
          addConsoleMessage('[ERROR] Polling error: ' + pollErr.message, 'error')
          setIsRunning(false)
        }
      }, 1000)
    } catch (err) {
      addConsoleMessage('[ERROR] Request failed: ' + (err.response ? JSON.stringify(err.response.data) : err.message), 'error')
      setIsRunning(false)
    }
  }

  const downloadVCD = () => {
    const vcd = window.__verilog_vcd_raw
    if (!vcd) {
      addConsoleMessage('[INFO] No VCD data available. Run a simulation first.', 'info')
      return
    }
    const blob = new Blob([vcd], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulation.vcd'
    a.click()
    URL.revokeObjectURL(url)
    addConsoleMessage('VCD file downloaded.', 'success')
  }

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        if (!isRunning) submitSimulation('syntax_check')
      } else if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (!isRunning) submitSimulation('simulate')
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
    mode: 'verilog',
    theme: isDarkMode ? 'material-darker' : 'default',
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    placeholder: 'Write your Verilog code here...'
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
              editorDidMount={(editor) => setEditorInstance(editor)}
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
              <button className="verilog-panel-header-btn" onClick={downloadVCD} title="Download VCD"><IconDownload /></button>
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
            <span>Module Hierarchy</span>
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
            className={'verilog-tab' + (idx === activeTab ? ' active' : '') + (file.isTestbench ? ' testbench' : '')}
            onClick={() => setActiveTab(idx)}
            onDoubleClick={() => renameFile(idx)}
            onContextMenu={(e) => { e.preventDefault(); toggleTestbench(idx) }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {file.isTestbench ? <IconCpu /> : <IconFile />} {file.filename} {file.isTestbench ? ' [TB]' : ''}
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
    if (!waveformData || !waveformData.data || waveformData.data.length === 0) {
      return (
        <div className="verilog-waveform-content">
          <div className="verilog-waveform-empty">
            {waveformData && waveformData.error
              ? waveformData.error
              : 'Run a simulation to see waveforms here.'}
          </div>
        </div>
      )
    }

    return (
      <div className="verilog-waveform-content">
        {waveformData.data.map((dataset, idx) => (
          <Graph
            key={idx}
            labels={dataset.labels}
            x={dataset.x}
            y={dataset.y}
            stepped={true}
            isDarkMode={isDarkMode}
          />
        ))}
      </div>
    )
  }

  function renderHierarchyTree () {
    const { modules, topModules } = hierarchy

    if (topModules.length === 0) {
      return (
        <div className="verilog-hierarchy-tree">
          <div style={{ color: '#585b70', fontSize: '12px', padding: '8px' }}>
            No modules detected.
          </div>
        </div>
      )
    }

    const renderNode = (moduleName, depth = 0) => {
      const mod = modules[moduleName]
      if (!mod) return null

      return (
        <div key={moduleName + depth}>
          <div
            className={'verilog-hierarchy-item' + (files[activeTab] && files[activeTab].filename === mod.file ? ' active' : '')}
            onClick={() => navigateToFile(mod.file)}
            style={{ paddingLeft: (8 + depth * 16) + 'px' }}
          >
            <span className="icon" style={{ display: 'flex', alignItems: 'center' }}>
              {mod.children.length > 0 ? <IconChevronDown /> : <IconCircle />}
            </span>
            <span>{moduleName}</span>
          </div>
          {mod.children.length > 0 && (
            <div className="verilog-hierarchy-children">
              {mod.children.map((child, i) => (
                <div key={i}>
                  {renderNode(child.name, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="verilog-hierarchy-tree">
        {topModules.map(m => renderNode(m))}
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
            <IconCpu /> Verilog Simulator
          </span>
          <button
            className="verilog-toolbar-btn success"
            onClick={() => submitSimulation('simulate')}
            disabled={isRunning}
          >
            {isRunning ? <span className="verilog-spinner" /> : <IconPlay />}
            Run
            <span className="verilog-shortcut-hint">Ctrl+Shift+R</span>
          </button>
          <button
            className="verilog-toolbar-btn primary"
            onClick={() => submitSimulation('syntax_check')}
            disabled={isRunning}
          >
            <IconCheck /> Check Syntax
            <span className="verilog-shortcut-hint">Ctrl+Shift+B</span>
          </button>
          
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select 
              className="verilog-toolbar-btn" 
              value={compiler}
              onChange={(e) => setCompiler(e.target.value)}
              title="Select Compiler"
              style={{ outline: 'none', appearance: 'none', paddingRight: '28px', cursor: 'pointer', height: '100%', margin: 0 }}
            >
              <option value="iverilog">Icarus Verilog</option>
              <option value="systemverilog">SystemVerilog</option>
              <option value="vhdl">VHDL (NVC)</option>
            </select>
            <div style={{ position: 'absolute', right: '10px', pointerEvents: 'none', display: 'flex', color: 'var(--text-main)' }}>
              <IconChevronDown />
            </div>
          </div>
          
          <button
            className="verilog-toolbar-btn primary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            title="Upload local .v or .sv files"
          >
            <IconUpload /> Upload Files
          </button>
          <input
            type="file"
            multiple
            accept=".v,.sv,.vh,.txt"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
        <div className="verilog-toolbar-right">
          <button
            className="verilog-toolbar-btn"
            onClick={() => setIsDarkMode(prev => !prev)}
            title="Toggle Light/Dark Mode"
          >
            {isDarkMode ? <><IconSun /> Light Mode</> : <><IconMoon /> Dark Mode</>}
          </button>
          <button className="verilog-toolbar-btn" onClick={downloadVCD}>
            <IconDownload /> Download VCD
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

        {/* Content Area */}
        <div className="verilog-content">
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
                editorDidMount={(editor) => setEditorInstance(editor)}
              />
            </div>
          </div>

          {/* Resize Handle */}
          <div
            className="verilog-resize-handle"
            onMouseDown={handleResizeStart}
            style={{ cursor: isResizing ? 'row-resize' : undefined }}
          />

          {/* Bottom Panels */}
          <div className="verilog-bottom" style={{ height: bottomHeight + 'px' }}>
            {/* Console */}
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

            {/* Waveform */}
            <div className="verilog-waveform">
              <div className="verilog-panel-header">
                <span>Waveform</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="verilog-panel-header-btn" onClick={downloadVCD} title="Download VCD"><IconDownload /></button>
                  <button className="verilog-panel-header-btn" onClick={() => toggleMaximize('waveform')} title="Maximize"><IconMaximize /></button>
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
