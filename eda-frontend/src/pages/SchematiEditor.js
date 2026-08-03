
// Main Layout for Schemaic Editor page.
/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react'
import { CssBaseline } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

import Layout from '../components/Shared/Layout'
import Header from '../components/SchematicEditor/Header'
import ComponentSidebar from '../components/SchematicEditor/ComponentSidebar'
import LayoutMain from '../components/Shared/LayoutMain'
import SchematicToolbar from '../components/SchematicEditor/SchematicToolbar'
import RightSidebar from '../components/SchematicEditor/RightSidebar'
import PropertiesSidebar from '../components/SchematicEditor/PropertiesSidebar'
import NetlistPreviewPanel from '../components/SchematicEditor/NetlistPreviewPanel'
import { ClearGrid } from '../components/SchematicEditor/Helper/ToolbarTools'
import { SchematicCanvas, schematicStore } from '../components/SchematicEditor/Helper/ComponentDrag.js'
import ComponentProperties from '../components/SchematicEditor/ComponentProperties'
import SimulationProperties from '../components/SchematicEditor/SimulationProperties'
import SimulationScreen from '../components/Shared/SimulationScreen'
import TemplateWizard from '../components/SchematicEditor/TemplateWizard'
import '../components/SchematicEditor/Helper/SchematicEditor.css'
import { fetchSchematic, fetchGallerySchematic } from '../redux/actions/index'
import { useDispatch, useSelector } from 'react-redux'

const useStyles = makeStyles(() => ({
  root: {
    display: 'flex',
    minHeight: '100vh'
  },
  toolbar: {
    minHeight: '80px'
  }
}))

export default function SchematiEditor (props) {
  const classes = useStyles()
  const compRef = React.createRef()
  const gridRef = React.createRef()
  const outlineRef = React.createRef()
  const dispatch = useDispatch()
  const isSimulate = useSelector(state => state.schematicEditorReducer.isSimulate)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [ltiSimResult, setLtiSimResult] = React.useState(false)
  const [simulateOpen, setSimulateOpen] = React.useState(false)
  const [isResult, setIsResult] = React.useState(false)
  const [taskId, setTaskId] = React.useState(null)
  const [simType, setSimType] = React.useState('NgSpiceSimulator')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [clearCanvasFirst, setClearCanvasFirst] = useState(false)

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleWizardClose = () => {
    setWizardOpen(false)
    localStorage.setItem('esim_template_seen', 'true')
  }

  const handleTemplateSelect = (template) => {
    console.log('[TemplateWizard] Template selected:', template.title)
    if (clearCanvasFirst) {
      ClearGrid()
    }
    handleWizardClose()
  }

  const handleNewFromTemplate = () => {
    setClearCanvasFirst(true)
    setWizardOpen(true)
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const hasId = query.has('id')
    const hasVersion = query.has('version')
    const hasBranch = query.has('branch')

    if (!hasId && !hasVersion && !hasBranch && localStorage.getItem('esim_template_seen') !== 'true') {
      setClearCanvasFirst(false)
      setWizardOpen(true)
    }
  }, [])

  useEffect(() => {
    document.title = 'Schematic Editor - eSim '
    // Compatibility shim: panels that used to reach into the mxGraph
    // instance via gridRef.current.graph now get the schematic store.
    if (gridRef.current) {
      gridRef.current.graph = schematicStore
    }

    if (props.location.search !== '') {
      const query = new URLSearchParams(props.location.search)
      console.log(props.location.search)
      const cktid = query.get('id')
      const version = query.get('version')
      const branch = query.get('branch')
      console.log(cktid)
      if (cktid.substr(0, 7) === 'gallery') {
        // Loading Gallery schemaic.
        dispatch(fetchGallerySchematic(cktid))
      } else {
        // Loading User on-cloud saved schemaic.
        dispatch(fetchSchematic(cktid, version, branch))
      }
    }
  // eslint-disable-next-line
  }, [props.location])

  return (
    <div className={classes.root}>
      <CssBaseline />

      {/* Schematic editor header, toolbar and left side pane */}
      <Layout
        header={gridRef && <Header gridRef={gridRef}/> }
        resToolbar={
          <SchematicToolbar
            gridRef={gridRef}
            ltiSimResult={ltiSimResult}
            setLtiSimResult={setLtiSimResult}
            mobileClose={handleDrawerToggle}
            onNewFromTemplate={handleNewFromTemplate}
          />
        }
        sidebar={<ComponentSidebar compRef={compRef} ltiSimResult={ltiSimResult}
          setLtiSimResult={setLtiSimResult}/>}
      />

      <LayoutMain noPadding>
        <div className={classes.toolbar} />
        <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
          <div style={{ flex: isSimulate ? 1 : 'none', width: isSimulate ? '50%' : '100%', borderRight: isSimulate ? '2px solid #ccc' : 'none', overflow: 'hidden', height: '100%', position: 'relative' }}>
            <div className="grid-container" ref={gridRef} id="divGrid" style={{ width: '100%', height: '100%', margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }}>
              {/* Declarative React SVG canvas (includes its own minimap layer) */}
              <SchematicCanvas />
            </div>
          </div>
          {isSimulate && (
            <div style={{ flex: 1, width: '50%', overflowY: 'auto' }}>
              <SimulationScreen open={simulateOpen} isResult={isResult} close={() => setSimulateOpen(false)} taskId={taskId} simType={simType} />
            </div>
          )}
        </div>
      </LayoutMain>

      <RightSidebar mobileOpen={mobileOpen} mobileClose={handleDrawerToggle}>
        {isSimulate ? (
          <SimulationProperties
            setSimulateOpen={setSimulateOpen}
            setIsResult={setIsResult}
            setTaskId={setTaskId}
            setSimType={setSimType}
            ltiSimResult={ltiSimResult}
            setLtiSimResult={setLtiSimResult}
          />
        ) : (
          <>
            <PropertiesSidebar gridRef={gridRef} outlineRef={outlineRef} />
            <NetlistPreviewPanel gridRef={gridRef} />
          </>
        )}
      </RightSidebar>
      <ComponentProperties/>
      {wizardOpen && (
        <TemplateWizard
          open={wizardOpen}
          onClose={handleWizardClose}
          onTemplateSelect={handleTemplateSelect}
          clearCanvasFirst={clearCanvasFirst}
        />
      )}
    </div>
  )
}
