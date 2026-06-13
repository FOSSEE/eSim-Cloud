import React, { useEffect, useState, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  List,
  ListItem,
  ListItemIcon,
  Tooltip,
  Popper,
  Fade,
  Paper,
  ClickAwayListener,
  Grid,
  Typography
} from '@material-ui/core'
import Loader from 'react-loader-spinner'
import SearchIcon from '@material-ui/icons/Search'
import StarIcon from '@material-ui/icons/Star'
import { makeStyles } from '@material-ui/core/styles'

// Custom EDA Category icons
import {
  PassiveIcon,
  AnalogIcon,
  TransistorIcon,
  IndicatorIcon,
  SwitchIcon,
  ModellingBlockIcon,
  ElectromechanicalIcon,
  PowerIcon,
  DigitalIcon
} from './Helper/EdaIcons'

import './Helper/SchematicEditor.css'
import { useDispatch, useSelector } from 'react-redux'
import { fetchLibraries, fetchComponents } from '../../redux/actions/index'
import SideComp from './SideComp.js'
import ComponentSearchBar from './ComponentSearchBar.js'
import { AddProbe } from './Helper/SideBar.js'
import { getFavourites } from '../../utils/favouritesStorage'
import api from '../../utils/Api'

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
  },
  head: {
    marginRight: 'auto'
  },
  /* ── Favourites chips bar ── */
  favBar: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    overflowX: 'auto',
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.5, 1),
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #e0e0e0',
    /* hide scrollbar on non-hover for a cleaner look */
    '&::-webkit-scrollbar': {
      height: 4
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#bdbdbd',
      borderRadius: 2
    }
  },
  /* ── Draggable favourite chip ── */
  favChip: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8e8e8',
    borderRadius: 16,
    padding: '4px 4px 4px 8px',
    cursor: 'grab',
    fontSize: '0.75rem',
    fontWeight: 500,
    maxWidth: 130,
    userSelect: 'none',
    border: '1px solid #d0d0d0',
    transition: 'background-color 0.15s ease',
    '&:hover': {
      backgroundColor: '#d4d4d4'
    },
    '&:active': {
      cursor: 'grabbing'
    }
  },
  favChipLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 88,
    lineHeight: 1.2
  },
  favChipRemove: {
    padding: 0,
    marginLeft: 'auto',
    width: 18,
    height: 18,
    flexShrink: 0
  },
  favChipRemoveIcon: {
    fontSize: 14
  }
}))

const UI_CATEGORIES = [
  {
    id: 'search',
    name: 'Search',
    icon: <SearchIcon />,
    match: () => false // Handled manually via search API
  },
  {
    id: 'favourites',
    name: 'Favourites',
    icon: <StarIcon style={{ color: '#f4b400' }} />,
    isFavouritesCategory: true
  },
  {
    id: 'probes',
    name: 'Probes',
    isProbeCategory: true,
    icon: (
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '4px',
        background: '#1a1a2e',
        border: '2px solid #00e676',
        color: '#00e676',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        fontFamily: 'monospace, sans-serif'
      }}>
        V
      </div>
    )
  },
  {
    id: 'passive',
    name: 'Passive',
    icon: <PassiveIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const kw = (comp.keyword || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      const prefix = (comp.symbol_prefix || '').toLowerCase()
      return prefix === 'r' || prefix === 'c' || prefix === 'l' ||
        svgPath.includes('esim_subcircuits/res') ||
        svgPath.includes('esim_subcircuits/cap') ||
        n.includes('resistor') || n.includes('capacitor') || n.includes('inductor') ||
        n === 'r' || n === 'c' || n === 'l' ||
        kw.includes('resistor') || kw.includes('capacitor') || kw.includes('inductor')
    }
  },
  {
    id: 'analog', name: 'Analog', icon: <AnalogIcon />, matchFn: (comp) => { const n = (comp.full_name || comp.name || '').toLowerCase(); const kw = (comp.keyword || '').toLowerCase(); const svgPath = (comp.svg_path || '').toLowerCase(); return svgPath.includes('analog') || svgPath.includes('opamp') || n.includes('analog') || n.includes('opamp') || kw.includes('analog') || kw.includes('opamp') }
  },
  {
    id: 'transistors',
    name: 'Transistors',
    icon: <TransistorIcon />,
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
    id: 'indicators',
    name: 'Indicators',
    icon: <IndicatorIcon />,
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
    id: 'switches',
    name: 'Switches',
    icon: <SwitchIcon />,
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
    id: 'modelling_block',
    name: 'Modelling Block',
    icon: <ModellingBlockIcon />,
    matchFn: (comp) => {
      const n = (comp.full_name || comp.name || '').toLowerCase()
      const svgPath = (comp.svg_path || '').toLowerCase()
      return svgPath.includes('esim_hybrid') ||
        n.includes('adc_bridge') || n.includes('dac_bridge')
    }
  },
  {
    id: 'electromechanical',
    name: 'Electromechanical',
    icon: <ElectromechanicalIcon />,
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
    id: 'power',
    name: 'Power',
    icon: <PowerIcon />,
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
    id: 'digital',
    name: 'Digital',
    icon: <DigitalIcon />,
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

// Draggable probe tile for the flyout
function ProbeItem ({ probeType, label, color, description }) {
  const imgRef = useRef(null)
  useEffect(() => {
    if (imgRef.current) AddProbe(probeType, imgRef.current)
    // eslint-disable-next-line
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', cursor: 'grab' }}>
      <Tooltip title={description} arrow>
        <div
          ref={imgRef}
          style={{
            width: 40,
            height: 40,
            borderRadius: probeType === 'V' ? '4px' : '50%',
            background: '#1a1a2e',
            border: `3px solid ${color}`,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            fontFamily: 'monospace, sans-serif',
            userSelect: 'none',
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

ProbeItem.propTypes = {
  probeType: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired
}

export default function ComponentSidebar ({ compRef, ltiSimResult, setLtiSimResult }) {
  const classes = useStyles()
  const libraries = useSelector(state => state.schematicEditorReducer.libraries)
  const components = useSelector(state => state.schematicEditorReducer.components)

  const dispatch = useDispatch()

  // ── localStorage-backed favourites state ─────────────────────────────────
  // Initialised once on mount from localStorage — no auth required.
  const [favourites, setFavourites] = useState([])

  useEffect(() => {
    // Task 4: runs once on mount with [] — persists across page refreshes automatically
    setFavourites(getFavourites())
  }, [])

  // Search State for Flyout
  const [isSearchedResultsEmpty, setIssearchedResultsEmpty] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchedComponentList, setSearchedComponents] = useState([])
  const [searchOption, setSearchOption] = useState('NAME')

  const searchBarRef = useRef(null)

  const handleSearchChange = React.useCallback((query, option = 'NAME') => {
    setSearchedComponents([])
    setSearchText(query)
    setSearchOption(option)
  }, [])

  useEffect(() => {
    if (!searchText.trim()) return
    setLoading(true)
    let config = {}
    const token = localStorage.getItem('esim_auth_token')
    if (token && token !== undefined) {
      config = {
        headers: {
          Authorization: `Token ${token}`
        }
      }
    }
    api.get(`components/?${searchOptions[searchOption]}=${searchText}`, config)
      .then((res) => {
        if (res.data.length === 0) {
          setIssearchedResultsEmpty(true)
          setSearchedComponents([])
        } else {
          setIssearchedResultsEmpty(false)
          // Client-side sorting to prioritize exact matches and prefix matches
          const sortedData = [...res.data].sort((a, b) => {
            const aName = (a.full_name || a.name || '').toLowerCase()
            const bName = (b.full_name || b.name || '').toLowerCase()
            const q = searchText.toLowerCase().trim()

            const aExact = aName === q
            const bExact = bName === q
            if (aExact && !bExact) return -1
            if (!aExact && bExact) return 1

            const aStarts = aName.startsWith(q)
            const bStarts = bName.startsWith(q)
            if (aStarts && !bStarts) return -1
            if (!aStarts && bStarts) return 1

            return 0
          })
          setSearchedComponents(sortedData)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [searchText, searchOption])

  // Flyout State
  const [anchorEl, setAnchorEl] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fetchedLibs, setFetchedLibs] = useState(new Set())

  useEffect(() => {
    const isModifierPressed = (evt) => evt.metaKey || evt.ctrlKey
    const isTypingContext = (evt) => {
      const tag = evt.target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || evt.target.isContentEditable
    }
    const handleKeyDown = (evt) => {
      if (isModifierPressed(evt) && evt.key === 'k') {
        evt.preventDefault()
        const searchBtn = document.getElementById('search-category-button')
        if (searchBtn) {
          setAnchorEl(searchBtn)
          setActiveCategory(UI_CATEGORIES.find(c => c.id === 'search'))
          setTimeout(() => {
            if (searchBarRef.current) searchBarRef.current.focus()
          }, 100)
        }
        return
      }
      if (evt.key === '/' && !isTypingContext(evt)) {
        evt.preventDefault()
        const searchBtn = document.getElementById('search-category-button')
        if (searchBtn) {
          setAnchorEl(searchBtn)
          setActiveCategory(UI_CATEGORIES.find(c => c.id === 'search'))
          setTimeout(() => {
            if (searchBarRef.current) searchBarRef.current.focus()
          }, 100)
        }
        return
      }
      if (evt.key === 'Escape' && searchBarRef.current && searchBarRef.current.isFocused()) {
        evt.preventDefault()
        searchBarRef.current.clear()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setAnchorEl, setActiveCategory])

  useEffect(() => {
    dispatch(fetchLibraries())
  }, [dispatch])

  // Listen for keyboard shortcut probe events (V / I keys)
  const probeCategoryRef = React.useRef(null)
  useEffect(() => {
    const probesCategory = UI_CATEGORIES.find(c => c.id === 'probes')
    probeCategoryRef.current = probesCategory

    const handler = (evt) => {
      // Open the probes flyout — anchor to the probes list item in the sidebar
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

  const handleCategoryClick = (event, category) => {
    setAnchorEl(event.currentTarget)
    setActiveCategory(category)
    setShowAdvanced(false)
  }

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

  const open = Boolean(anchorEl)

  return (
    <>
      <div className={classes.toolbar} />

      {/* Component palette — always visible, simulation mode no longer hides it */}
      <div>
        <List className={classes.paletteList}>
          {UI_CATEGORIES.map((cat) => (
            <Tooltip key={cat.id} title={cat.name} placement="right">
              <ListItem
                button
                id={cat.id === 'probes' ? 'probe-category-button' : (cat.id === 'search' ? 'search-category-button' : undefined)}
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
      </div>

      {/* Flyout panel — always rendered so it can open regardless of mode */}
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement="right-start"
        transition
        style={{ zIndex: 1300 }}
        modifiers={{
          preventOverflow: {
            enabled: true,
            boundariesElement: 'window'
          },
          flip: {
            enabled: true
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

                  {/* Persistent Flyout Favourites Quick-Add Bar */}
                  {favourites.length > 0 && (
                    <div
                      className={classes.favBar}
                      style={{
                        backgroundColor: '#fff',
                        padding: '8px',
                        borderBottom: '1px solid #ccc',
                        marginBottom: '8px',
                        display: 'flex',
                        overflowX: 'auto'
                      }}
                    >
                      <Typography variant="subtitle2" style={{ fontWeight: 'bold', color: '#555', marginRight: '16px', alignSelf: 'center' }}>
                        Favourites
                      </Typography>
                      {favourites.map((comp) => (
                        <div key={comp.id} style={{ display: 'flex', alignItems: 'center' }}>
                          <SideComp component={comp} setFavourite={setFavourites} favourite={favourites} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ backgroundColor: '#fff', padding: '8px', borderBottom: '1px solid #ccc', marginBottom: '8px' }}>
                    {activeCategory?.id === 'search' ? (
                      <ComponentSearchBar
                        onSearchChange={handleSearchChange}
                        ref={searchBarRef}
                      />
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
                          Drag a probe onto the canvas. Voltage probes snap to wires.
                        </Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={12} style={{ display: 'flex', justifyContent: 'center' }}>
                            <ProbeItem
                              probeType="V"
                              label="Voltage Probe"
                              color="#00e676"
                              description="Drag onto a wire to measure node voltage"
                            />
                          </Grid>
                        </Grid>
                      </div>
                    ) : activeCategory?.isFavouritesCategory ? (
                      <div style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden', width: '100%' }} >
                        {favourites.length === 0 ? (
                          <div style={{ padding: '16px', color: '#888', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                            <Typography variant="body2">No Favourites Added</Typography>
                          </div>
                        ) : (
                          <Grid container spacing={1}>
                            {favourites.map((comp) => (
                              <Grid item xs={4} key={comp.id} style={{ display: 'flex', padding: '4px' }}>
                                <SideComp component={comp} setFavourite={setFavourites} favourite={favourites} />
                              </Grid>
                            ))}
                          </Grid>
                        )}
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
                      loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '16px' }}>
                          <Loader
                            type="TailSpin"
                            color="#F44336"
                            height={50}
                            width={50}
                            visible={true}
                          />
                        </div>
                      ) : activeComponents.length === 0 ? (
                        <div style={{ padding: '16px', color: '#888', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                          <Typography variant="body2">No components loaded in this category.</Typography>
                        </div>
                      ) : (
                        (showAdvanced ? activeComponents : activeComponents.slice(0, 9)).map((comp) => (
                          <Grid item xs={showAdvanced ? 3 : 4} key={comp.full_name} style={{ display: 'flex', padding: '4px' }}>
                            <SideComp component={comp} setFavourite={setFavourites} favourite={favourites} />
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
