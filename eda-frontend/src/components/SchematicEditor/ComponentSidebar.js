import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import api from '../../utils/Api'
import {
  Hidden,
  List,
  ListItem,
  ListItemIcon,
  Tooltip,
  TextField,
  InputAdornment,
  Divider,
  Popper,
  Fade,
  Paper,
  ClickAwayListener,
  Grid,
  Typography,
  IconButton,
  Collapse
} from '@material-ui/core'
import Loader from 'react-loader-spinner'
import SearchIcon from '@material-ui/icons/Search'
import CloseIcon from '@material-ui/icons/Close'
// Custom EDA Category icons
import {
  ConnectorIcon,
  SourceIcon,
  PassiveIcon,
  AnalogIcon,
  DiodeIcon,
  TransistorIcon,
  IndicatorIcon,
  SwitchIcon,
  ModellingBlockIcon,
  ElectromechanicalIcon,
  PowerIcon,
  DigitalIcon
} from './Helper/EdaIcons'

import { makeStyles } from '@material-ui/core/styles'

import './Helper/SchematicEditor.css'
import { useDispatch, useSelector } from 'react-redux'
import { fetchLibraries, toggleCollapse, fetchComponents, toggleSimulate } from '../../redux/actions/index'
import SideComp from './SideComp.js'
import { AddProbe } from './Helper/SideBar.js'
const COMPONENTS_PER_ROW = 3

const useStyles = makeStyles((theme) => ({
  toolbar: {
    minHeight: '90px'
  },
  paletteList: {
    width: '60px',
    backgroundColor: '#f8f9fa',
    borderRight: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '8px',
    height: '100%',
    overflowY: 'auto'
  },
  paletteItem: {
    display: 'flex',
    justifyContent: 'center',
    padding: '6px 0',
    borderRadius: '8px',
    margin: '2px',
    width: '42px',
    '&:hover': {
      backgroundColor: '#e3f2fd',
      color: '#1976d2'
    }
  },
  activeItem: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    borderLeft: '3px solid #1976d2'
  },
  icon: {
    minWidth: 'auto',
    color: 'inherit'
  },
  flyoutPaper: {
    width: '320px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e0e0e0'
  },
  flyoutContent: {
    padding: '8px',
    overflowY: 'auto',
    flexGrow: 1,
    backgroundColor: '#f5f5f5'
  },
  gridContainer: {
    margin: 0,
    width: '100%'
  }
}))

const UI_CATEGORIES = [
  {
    id: 'search', name: 'Search', icon: <SearchIcon />,
    match: () => false // Handled manually via search API
  },
  {
    id: 'probes', name: 'Probes', isProbeCategory: true,
    icon: (
      <div style={{
        width: 22, height: 22, borderRadius: '4px',
        background: '#1a1a2e', border: '2px solid #00e676',
        color: '#00e676', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '12px', fontWeight: 'bold',
        fontFamily: 'monospace, sans-serif'
      }}>
        V
      </div>
    )
  },
  {
    id: 'connectors', name: 'Schematic Connectors', icon: <ConnectorIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return prefix === 'GND' ||
        n === '0' ||
        n.includes('jumper') ||
        n.includes('connector') ||
        n.includes('jack') ||
        n.includes('plug') ||
        prefix === 'JP' ||
        kw.includes('jumper') ||
        kw.includes('connector')
    }
  },
  {
    id: 'sources', name: 'Sources', icon: <SourceIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toLowerCase()
      return svgPath.includes('esim_sources') ||
        prefix === 'v' ||
        (n.includes('source') && !n.includes('drag')) ||
        n === 'dc' || n === 'vsource' || n === 'isource' ||
        n.includes('cccs') || n.includes('ccvs') || n.includes('vccs') || n.includes('vcvs') ||
        kw.includes('voltage-source') || kw.includes('current source')
    }
  },
  {
    id: 'passive', name: 'Passive', icon: <PassiveIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return prefix === 'R' || prefix === 'C' || prefix === 'L' || prefix === 'RN' ||
        prefix === 'RV' || prefix === 'TH' || prefix === 'T' || prefix === 'FB' ||
        n.includes('resistor') || n.includes('capacitor') || n.includes('inductor') ||
        n.includes('potentiometer') || n.includes('transformer') ||
        n.includes('thermistor') || n.includes('varistor') ||
        n.includes('ferrite') || n.includes('fuse') ||
        n.includes('transmission_line') || n.includes('coupled') ||
        kw.includes('resistor') || kw.includes('capacitor') || kw.includes('inductor') ||
        kw.includes('coil') || kw.includes('fuse')
    }
  },
  {
    id: 'analog', name: 'Analog', icon: <AnalogIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      return svgPath.includes('analog') ||
        n.includes('opamp') || n.includes('comparator') ||
        n.includes('amplifier') || n.includes('timer') || n.includes('555') ||
        n.includes('lm3') || n.includes('ne555') ||
        kw.includes('opamp') || kw.includes('comparator') ||
        kw.includes('amplifier') || kw.includes('opto')
    }
  },
  {
    id: 'diodes', name: 'Diodes', icon: <DiodeIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return (svgPath.includes('diode') && !n.includes('led') && !n.includes('photo')) ||
        (prefix === 'D' && !n.includes('led') && !n.includes('laser') && !n.includes('photo') && !n.includes('bar')) ||
        n.includes('zener') || n.includes('schottky') ||
        n.includes('rectifier') || n.includes('varactor') ||
        kw.includes('diode rectifier') || kw.includes('zener') ||
        kw.includes('schottky')
    }
  },
  {
    id: 'transistors', name: 'Transistors', icon: <TransistorIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return svgPath.includes('transistor_bjt') || svgPath.includes('transistor_fet') ||
        svgPath.includes('transistor_igbt') ||
        (prefix === 'Q' && !svgPath.includes('triac') && !svgPath.includes('thyristor')) ||
        (prefix === 'M' && (n.includes('mos') || svgPath.includes('transistor'))) ||
        prefix === 'MES' ||
        n.includes('nmos') || n.includes('pmos') || n.includes('npn') || n.includes('pnp') ||
        n.includes('mosfet') || n.includes('jfet') || n.includes('igbt') ||
        n.includes('darlington') ||
        kw.includes('transistor') || kw.includes('mosfet') || kw.includes('jfet')
    }
  },
  {
    id: 'indicators', name: 'Indicators', icon: <IndicatorIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      return svgPath.includes('led') ||
        n.includes('led') || n.includes('lamp') || n.includes('display') ||
        n.includes('indicator') || n.includes('neopixel') ||
        n.startsWith('bar') ||
        kw.includes('led') || kw.includes('lamp') || kw.includes('neopixel')
    }
  },
  {
    id: 'switches', name: 'Switches', icon: <SwitchIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      
      const isTransistor = (prefix === 'Q' || svgPath.includes('transistor')) && !svgPath.includes('triac') && !svgPath.includes('thyristor')
      
      return !isTransistor && (
        svgPath.includes('triac') || svgPath.includes('thyristor') ||
        prefix === 'SW' ||
        n.includes('switch') || n.includes('relay') ||
        n.includes('triac') || n.includes('thyristor') || n.includes('circuit_breaker') ||
        prefix === 'CB' ||
        kw.includes('switch') || kw.includes('triac') || kw.includes('thyristor') || kw.includes('relay')
      )
    }
  },
  {
    id: 'modelling_block', name: 'Modelling Block', icon: <ModellingBlockIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      return svgPath.includes('esim_hybrid') ||
        n.includes('adc_bridge') || n.includes('dac_bridge')
    }
  },
  {
    id: 'electromechanical', name: 'Electromechanical', icon: <ElectromechanicalIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return svgPath.includes('motor') ||
        (prefix === 'M' && !n.includes('mos') && !svgPath.includes('transistor')) || 
        prefix === 'BZ' || prefix === 'LS' || prefix === 'SC' ||
        n.includes('motor') || n.includes('fan') || n.includes('buzzer') ||
        n.includes('speaker') || n.includes('microphone') || n.includes('solar') ||
        (n.includes('battery') && !n.includes('+batt') && !n.includes('-batt')) || n.includes('earphone') ||
        kw.includes('motor') || kw.includes('speaker') || kw.includes('buzzer') ||
        (kw.includes('battery') && !n.includes('+batt') && !n.includes('-batt')) || kw.includes('solar')
    }
  },
  {
    id: 'power', name: 'Power', icon: <PowerIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toUpperCase()
      return svgPath.includes('power.lib') || prefix === 'PWR' || prefix === 'FLG' ||
        kw.includes('power-flag') || n.includes('+batt') || n.includes('-batt')
    }
  },
  {
    id: 'digital', name: 'Digital', icon: <DigitalIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      return svgPath.includes('4xxx') || svgPath.includes('oscillator') ||
        n.includes('74hc') || n.includes('74ls') || n.includes('cd4') ||
        n.includes('gate') || n.includes('flipflop') || n.includes('counter') ||
        n.includes('shift_register') || n.includes('decoder') ||
        kw.includes('cmos') || kw.includes('ttl')
    }
  }
]

const searchOptions = {
  NAME: 'name__icontains',
  KEYWORD: 'keyword__icontains',
  DESCRIPTION: 'description__icontains',
  COMPONENT_LIBRARY: 'component_library__library_name__icontains',
  PREFIX: 'symbol_prefix'
}

// var tempSearchTxt = ''

const searchOptionsList = ['NAME', 'KEYWORD', 'DESCRIPTION', 'COMPONENT_LIBRARY', 'PREFIX']

export default function ComponentSidebar ({ compRef, ltiSimResult, setLtiSimResult }) {
  const classes = useStyles()
  const libraries = useSelector(state => state.schematicEditorReducer.libraries)
  const collapse = useSelector(state => state.schematicEditorReducer.collapse)
  const components = useSelector(state => state.schematicEditorReducer.components)
  const isSimulate = useSelector(state => state.schematicEditorReducer.isSimulate)
  const auth = useSelector(state => state.authReducer)

  const dispatch = useDispatch()
  const [isSearchedResultsEmpty, setIssearchedResultsEmpty] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const [favourite, setFavourite] = useState(null)
  const [favOpen, setFavOpen] = useState(false)

  const [searchedComponentList, setSearchedComponents] = useState([])
  const [searchOption, setSearchOption] = useState('NAME')
  const [uploaded, setuploaded] = useState(false)
  const [def, setdef] = useState(false)
  const [additional, setadditional] = useState(false)

  // Flyout State
  const [anchorEl, setAnchorEl] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fetchedLibs, setFetchedLibs] = useState(new Set())

  const timeoutId = React.useRef()

  const handleSearchOptionType = (evt) => {
    setSearchedComponents([])
    setSearchOption(evt.target.value)
  }

  const handleSearchText = (evt) => {
    // tempSearchTxt = evt.target.value
    if (searchText.length === 0) {
      setSearchedComponents([])
    }
    setSearchText(evt.target.value)
    setSearchedComponents([])
    // mimic the value so we can access the latest value in our API call.

    // call api from here. and set the result to searchedComponentList.
  }

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      const token = localStorage.getItem('esim_token')
      const config = {
        headers: {
          'Content-Type': 'application/json'
        }
      }
      if (token) {
        config.headers.Authorization = `Token ${token}`
      }
      api
        .get('favouritecomponents', config)
        .then((resp) => {
          setFavourite(resp.data.component)
        })
        .catch((err) => {
          console.log(err)
        })
    }
  }, [auth])

  React.useEffect(() => {
    // if the user keeps typing, stop the API call!
    clearTimeout(timeoutId.current)
    // don't make an API call with no data
    if (!searchText.trim()) return
    // capture the timeoutId so we can
    // stop the call if the user keeps typing
    timeoutId.current = setTimeout(() => {
      // call api here
      setLoading(true)
      let config = {}
      const token = localStorage.getItem('esim_token')
      if (token && token !== undefined) {
        config = {
          headers: {
            Authorization: `Token ${token}`
          }
        }
      }
      api.get(`components/?${searchOptions[searchOption]}=${searchText}`, config)
        .then(
          (res) => {
            if (res.data.length === 0) {
              setIssearchedResultsEmpty(true)
            } else {
              setIssearchedResultsEmpty(false)
              setSearchedComponents([...res.data])
            }
          }
        )
        .catch((err) => { console.error(err) })
      setLoading(false)
    }, 800)
  }, [searchText, searchOption])

  const handleCollapse = (id) => {
    // Fetches Components for given library if not already fetched
    if (collapse[id] === false && components[id].length === 0) {
      dispatch(fetchComponents(id))
    }

    // Updates state of collapse to show/hide dropdown
    dispatch(toggleCollapse(id))
  }

  // For Fetching Libraries
  useEffect(() => {
    dispatch(fetchLibraries())
  }, [dispatch])

  // Listen for keyboard shortcut probe events (V / I keys)
  const probeCategoryRef = React.useRef(null)
  useEffect(() => {
    const probesCategory = UI_CATEGORIES.find(c => c.id === 'probes')
    probeCategoryRef.current = probesCategory

    const handler = (evt) => {
      // Open the probes flyout \u2014 anchor to the probes list item in the sidebar
      const probeListItem = document.getElementById('probe-category-button')
      if (probeListItem) {
        setAnchorEl(probeListItem)
        setActiveCategory(probeCategoryRef.current)
        setShowAdvanced(false)
      }
    }
    document.addEventListener('openProbePanel', handler)
    return () => document.removeEventListener('openProbePanel', handler)
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    if (libraries.filter((ob) => { return ob.default === true }).length !== 0) { setdef(true) } else { setdef(false) }
    if (libraries.filter((ob) => { return ob.additional === true }).length !== 0) { setadditional(true) } else { setadditional(false) }
    if (libraries.filter((ob) => { return (!ob.additional && !ob.default) }).length !== 0) { setuploaded(true) } else { setuploaded(false) }
  }, [libraries])

  // Used to chunk array
  const chunk = (array, size) => {
    return array.reduce((chunks, item, i) => {
      if (i % size === 0) {
        chunks.push([item])
      } else {
        chunks[chunks.length - 1].push(item)
      }
      return chunks
    }, [])
  }

  const libraryDropDown = (library) => {
    // Keep it here just in case, but it won't be rendered in flyout UI
    return null
  }

  const handleFavOpen = () => {
    setFavOpen(!favOpen)
  }

  const handleCategoryClick = (event, category) => {
    setAnchorEl(event.currentTarget)
    setActiveCategory(category)
    setShowAdvanced(false) // Reset when switching categories
  }

  // Ensure components are fetched even if libraries load AFTER category is clicked
  useEffect(() => {
    if (activeCategory && libraries && libraries.length > 0) {
      const newFetched = new Set(fetchedLibs)
      let changed = false
      libraries.forEach(lib => {
        if (!newFetched.has(lib.id)) {
          dispatch(fetchComponents(lib.id))
          newFetched.add(lib.id)
          changed = true
        }
      })
      if (changed) {
        setFetchedLibs(newFetched)
      }
    }
  }, [activeCategory, libraries, fetchedLibs, dispatch])

  const handleClose = () => {
    setAnchorEl(null)
    setActiveCategory(null)
    setShowAdvanced(false)
  }

  const allComponents = React.useMemo(() => {
    return Object.values(components)
      .filter(val => Array.isArray(val))
      .flat()
  }, [components])

  const activeComponents = React.useMemo(() => {
    if (!activeCategory || activeCategory.id === 'search') return []
    
    if (activeCategory.matchFn) {
      return allComponents.filter(comp => activeCategory.matchFn(comp))
    }
    
    return []
  }, [activeCategory, allComponents])



  // Inline ProbeItem — a draggable probe tile for the flyout
  const ProbeItem = ({ probeType, label, color, description }) => {
    const imgRef = React.useRef(null)
    React.useEffect(() => {
      if (imgRef.current) AddProbe(probeType, imgRef.current)
      // eslint-disable-next-line
    }, [])
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', cursor: 'grab' }}>
        <Tooltip title={description} arrow>
          <div
            ref={imgRef}
            style={{
              width: 40, height: 40, borderRadius: probeType === 'V' ? '4px' : '50%',
              background: '#1a1a2e', border: `3px solid ${color}`,
              color: color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px', fontWeight: 'bold',
              fontFamily: 'monospace, sans-serif', userSelect: 'none',
              boxShadow: `0 0 6px ${color}`
            }}
          >
            {probeType === 'V' ? 'V' : 'A'}
          </div>
        </Tooltip>
        <span style={{ fontSize: '11px', textAlign: 'center', marginTop: '4px', color, fontWeight: 'bold' }}>
          {label}
        </span>
      </div>
    )
  }

  const open = Boolean(anchorEl)

  return (
    <>
      <div className={classes.toolbar} />
      
      <div>
        <List className={classes.paletteList}>
          {UI_CATEGORIES.map((cat) => (
            <Tooltip key={cat.id} title={cat.name} placement="right">
              <ListItem 
                button 
                id={cat.id === 'probes' ? 'probe-category-button' : undefined}
                className={`${classes.paletteItem} ${activeCategory?.id === cat.id ? classes.activeItem : ''}`}
                onClick={(e) => handleCategoryClick(e, cat)}
              >
                <ListItemIcon className={classes.icon}>
                  {cat.icon}
                </ListItemIcon>
              </ListItem>
            </Tooltip>
          ))}
        </List>

        <Popper
          open={open}
          anchorEl={anchorEl}
          placement="right-start"
          transition
          style={{ zIndex: 1300 }}
          modifiers={{
            preventOverflow: {
              enabled: true,
              boundariesElement: 'window',
            },
            flip: {
              enabled: true,
            },
            offset: {
              enabled: true,
              offset: '0, 0'
            }
          }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={350}>
              <Paper className={classes.flyoutPaper} elevation={8}>
                <ClickAwayListener onClickAway={handleClose}>
                  <div ref={compRef} className={classes.flyoutContent}>
                    
                    <div style={{ backgroundColor: '#fff', padding: '8px', borderBottom: '1px solid #ccc', marginBottom: '8px' }}>
                      {activeCategory?.id === 'search' ? (
                        <>
                          <TextField
                            id="standard-number"
                            placeholder="Search Component"
                            variant="outlined"
                            size="small"
                            fullWidth
                            value={searchText}
                            onChange={handleSearchText}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <SearchIcon />
                                </InputAdornment>
                              )
                            }}
                            style={{ marginBottom: '8px' }}
                          />
                          <TextField
                            style={{ width: '100%' }}
                            id="searchType"
                            size='small'
                            variant="outlined"
                            select
                            label="Search By"
                            value={searchOption}
                            onChange={handleSearchOptionType}
                            SelectProps={{
                              native: true
                            }}
                          >
                            {searchOptionsList.map((value, i) => (
                              <option key={i} value={value}>
                                {value}
                              </option>
                            ))}
                          </TextField>
                        </>
                      ) : (
                        <Typography variant="subtitle2" style={{ fontWeight: 'bold', color: '#555' }}>
                          {activeCategory?.name}
                        </Typography>
                      )}
                    </div>

                    <Grid container spacing={1} className={classes.gridContainer}>
                      {activeCategory?.isProbeCategory ? (
                        <div style={{ padding: '12px 8px', width: '100%' }}>
                          <Typography variant="caption" style={{ color: '#888', display: 'block', marginBottom: '12px' }}>
                            Drag a probe onto the canvas. Voltage probes snap to wires; current probes snap to Voltage Source pins.
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6} style={{ display: 'flex', justifyContent: 'center' }}>
                              <ProbeItem
                                probeType="V"
                                label="Voltage Probe"
                                color="#00e676"
                                description="Drag onto a wire to measure node voltage"
                              />
                            </Grid>
                            <Grid item xs={6} style={{ display: 'flex', justifyContent: 'center' }}>
                              <ProbeItem
                                probeType="I"
                                label="Current Probe"
                                color="#ff9100"
                                description="Drag onto a Voltage Source to measure branch current"
                              />
                            </Grid>
                          </Grid>
                        </div>
                      ) : activeCategory?.id === 'search' ? (
                        <div style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden', width: '100%' }} >
                          {searchText.length !== 0 && searchedComponentList.length !== 0 &&
                            searchedComponentList.map((component, i) => {
                              return (<ListItemIcon key={i} style={{ width: '33%', display: 'inline-flex', padding: '4px', boxSizing: 'border-box' }}>
                                <SideComp component={component} />
                              </ListItemIcon>)
                            })
                          }
                          <ListItem style={{ display: loading ? 'flex' : 'none', justifyContent: 'center' }}>
                            <Loader
                              type="TailSpin"
                              color="#F44336"
                              height={50}
                              width={50}
                              visible={loading}
                            />
                          </ListItem>
                          {!loading && searchText.length !== 0 && isSearchedResultsEmpty && (
                            <div style={{ padding: '16px', color: '#888', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                              <Typography variant="body2">No Components Found</Typography>
                            </div>
                          )}
                          {searchText.length === 0 && (
                            <div style={{ padding: '16px', color: '#888', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                              <Typography variant="body2">Type to search components...</Typography>
                            </div>
                          )}
                        </div>
                      ) : (
                        activeComponents.length === 0 ? (
                          <div style={{ padding: '16px', color: '#888', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                            <Typography variant="body2">No components loaded in this category.</Typography>
                          </div>
                        ) : (
                          (showAdvanced ? activeComponents : activeComponents.slice(0, 9)).map((comp) => (
                            <Grid item xs={showAdvanced ? 3 : 4} key={comp.full_name} style={{ display: 'flex', padding: '4px' }}>
                              <SideComp component={comp} setFavourite={setFavourite} favourite={favourite} />
                            </Grid>
                          ))
                        )
                      )}
                      
                      {activeCategory?.id !== 'search' && activeComponents.length > 9 && !showAdvanced && (
                        <div style={{ width: '100%', textAlign: 'center', marginTop: '8px' }}>
                          <Typography 
                            variant="caption" 
                            style={{ color: '#1976d2', cursor: 'pointer', fontWeight: 'bold' }}
                            onClick={() => setShowAdvanced(true)}
                          >
                            + {activeComponents.length - 9} More Variants
                          </Typography>
                        </div>
                      )}
                    </Grid>
                  </div>
                </ClickAwayListener>
              </Paper>
            </Fade>
          )}
        </Popper>
      </div>
    </>
  )
}

ComponentSidebar.propTypes = {
  compRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) })
  ]),
  ltiSimResult: PropTypes.string,
  setLtiSimResult: PropTypes.func
}
