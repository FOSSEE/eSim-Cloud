
// Main Layout for Schemaic Editor page.
/* eslint-disable react/prop-types */
import React, { useEffect } from 'react'
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
import LoadGrid from '../components/SchematicEditor/Helper/ComponentDrag.js'
import ComponentProperties from '../components/SchematicEditor/ComponentProperties'
import SimulationProperties from '../components/SchematicEditor/SimulationProperties'
import SimulationScreen from '../components/Shared/SimulationScreen'
import '../components/SchematicEditor/Helper/SchematicEditor.css'
import { fetchSchematic, fetchGallerySchematic } from '../redux/actions/index'
import { useDispatch, useSelector } from 'react-redux'

const useStyles = makeStyles((theme) => ({
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
  const minimapRef = React.createRef()
  const dispatch = useDispatch()
  const isSimulate = useSelector(state => state.schematicEditorReducer.isSimulate)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [ltiSimResult, setLtiSimResult] = React.useState(false)
  const [simulateOpen, setSimulateOpen] = React.useState(false)
  const [isResult, setIsResult] = React.useState(false)
  const [taskId, setTaskId] = React.useState(null)
  const [simType, setSimType] = React.useState('NgSpiceSimulator')

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  useEffect(() => {
    document.title = 'Schematic Editor - eSim '
    const container = gridRef.current
    const sidebar = compRef.current
    const outline = outlineRef.current
    const minimap = minimapRef.current
    LoadGrid(container, sidebar, outline, minimap)

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
          />
        }
        sidebar={<ComponentSidebar compRef={compRef} ltiSimResult={ltiSimResult}
          setLtiSimResult={setLtiSimResult}/>}
      />

      <LayoutMain>
        <div className={classes.toolbar} />
        <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
          <div style={{ flex: isSimulate ? 1 : 'none', width: isSimulate ? '50%' : '100%', borderRight: isSimulate ? '2px solid #ccc' : 'none', overflow: 'hidden', height: '100%', position: 'relative' }}>
            <div className="grid-container" ref={gridRef} id="divGrid" style={{ width: '100%', height: '100%', margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none' }} />
            {/* Opaque Floating Dynamic Minimap */}
            <div 
              className="minimap-container"
              ref={minimapRef} 
              id="minimapContainer" 
              style={{
                position: 'absolute',
                top: '15px',
                left: '15px',
                width: '200px',
                height: '150px',
                backgroundColor: '#ffffff', // Opaque
                border: '1px solid #ccc',
                borderRadius: '5px',
                pointerEvents: 'none',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: 1000
              }}
            />
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
    </div>
  )
}
