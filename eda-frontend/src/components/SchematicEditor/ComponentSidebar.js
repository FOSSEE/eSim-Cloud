import React, { useEffect, useState, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  Hidden,
  List,
  ListItem,
  Collapse,
  ListItemIcon,
  IconButton,
  Tooltip,
  Divider,
  Typography,
  Snackbar,
  CircularProgress
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import ExpandLess from '@material-ui/icons/ExpandLess'
import ExpandMore from '@material-ui/icons/ExpandMore'
import CloseIcon from '@material-ui/icons/Close'

import './Helper/SchematicEditor.css'
import { useDispatch, useSelector } from 'react-redux'
import { fetchLibraries, toggleCollapse, fetchComponents, toggleSimulate, fetchComponentsBySearch } from '../../redux/actions/index'
import SideComp from './SideComp.js'
import ComponentSearchBar from './ComponentSearchBar'
import SimulationProperties from './SimulationProperties'
import { getFavourites, removeFavourite } from '../../utils/favouritesStorage'
import { AddComponent } from './Helper/SideBar.js'

const COMPONENTS_PER_ROW = 3

const useStyles = makeStyles((theme) => ({
  toolbar: {
    minHeight: '90px'
  },
  nested: {
    paddingLeft: theme.spacing(2),
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

// ─────────────────────────────────────────────────────────────────────────────
// FavChip — a draggable chip for a favourite component.
//
// Registers itself with mxGraph's makeDraggable (via AddComponent) so that
// dragging onto the canvas works exactly like dragging from the library list.
// ─────────────────────────────────────────────────────────────────────────────
function FavChip ({ component, onRemove, classes }) {
  const chipRef = useRef(null)

  // Register this DOM element as an mxGraph drag source — identical mechanism
  // to what SideComp.js does via AddComponent(component, imageRef.current)
  useEffect(() => {
    if (chipRef.current) {
      AddComponent(component, chipRef.current)
    }
    // eslint-disable-next-line
  }, [])

  return (
    <div
      ref={chipRef}
      className={classes.favChip}
      title={component.full_name || component.name}
      aria-label={`Favourite: ${component.full_name || component.name}. Drag to canvas or click X to remove.`}
    >
      <span className={classes.favChipLabel}>{component.name}</span>
      <IconButton
        className={classes.favChipRemove}
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(component.id)
        }}
        aria-label={`Remove ${component.name} from favourites`}
      >
        <CloseIcon className={classes.favChipRemoveIcon} />
      </IconButton>
    </div>
  )
}

FavChip.propTypes = {
  component: PropTypes.object.isRequired,
  onRemove: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ComponentSidebar
// ─────────────────────────────────────────────────────────────────────────────
export default function ComponentSidebar ({ compRef, ltiSimResult, setLtiSimResult }) {
  const classes = useStyles()
  const libraries = useSelector(state => state.schematicEditorReducer.libraries)
  const collapse = useSelector(state => state.schematicEditorReducer.collapse)
  const components = useSelector(state => state.schematicEditorReducer.components)
  const isSimulate = useSelector(state => state.schematicEditorReducer.isSimulate)

  const dispatch = useDispatch()

  // ── localStorage-backed favourites state ─────────────────────────────────
  // Initialised once on mount from localStorage — no auth required.
  const [favourites, setFavourites] = useState([])

  useEffect(() => {
    // Task 4: runs once on mount with [] — persists across page refreshes automatically
    setFavourites(getFavourites())
  }, [])

  // Snackbar for star toggle feedback
  const [snackbar, setSnackbar] = useState({ open: false, message: '' })
  const showSnackbar = (msg) => setSnackbar({ open: true, message: msg })
  const closeSnackbar = (_, reason) => {
    if (reason === 'clickaway') return
    setSnackbar((s) => ({ ...s, open: false }))
  }

  const [favOpen, setFavOpen] = useState(false)
  const [uploaded, setuploaded] = useState(false)
  const [def, setdef] = useState(false)
  const [additional, setadditional] = useState(false)

  // Redux-backed API search state
  const searchResults = useSelector(state => state.schematicEditorReducer.searchResults)
  const searchLoading = useSelector(state => state.schematicEditorReducer.searchLoading)
  const searchError = useSelector(state => state.schematicEditorReducer.searchError)
  const [activeSearchQuery, setActiveSearchQuery] = useState('')

  const handleSearchChange = useCallback((query, searchOption = 'ALL') => {
    setActiveSearchQuery(query)
    dispatch(fetchComponentsBySearch(query, searchOption))
  }, [dispatch])

  // ── Ref for the ComponentSearchBar ───────────────────────────────────────
  const searchBarRef = useRef(null)

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const isModifierPressed = (evt) => evt.metaKey || evt.ctrlKey

    const isTypingContext = (evt) => {
      const tag = evt.target.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA'
      const isEditable = evt.target.isContentEditable
      return isInput || isEditable
    }

    const handleKeyDown = (evt) => {
      if (isModifierPressed(evt) && evt.key === 'k') {
        evt.preventDefault()
        if (searchBarRef.current) {
          searchBarRef.current.focus()
        }
        return
      }

      if (evt.key === '/' && !isTypingContext(evt)) {
        evt.preventDefault()
        if (searchBarRef.current) {
          searchBarRef.current.focus()
        }
        return
      }

      if (evt.key === 'Escape' && searchBarRef.current &&
          searchBarRef.current.isFocused()) {
        evt.preventDefault()
        searchBarRef.current.clear()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleCollapse = (id) => {
    if (collapse[id] === false && (!components[id] || components[id].length === 0)) {
      dispatch(fetchComponents(id))
    }
    dispatch(toggleCollapse(id))
  }

  useEffect(() => {
    dispatch(fetchLibraries())
  }, [dispatch])

  useEffect(() => {
    if (libraries.filter((ob) => { return ob.default === true }).length !== 0) { setdef(true) } else { setdef(false) }
    if (libraries.filter((ob) => { return ob.additional === true }).length !== 0) { setadditional(true) } else { setadditional(false) }
    if (libraries.filter((ob) => { return (!ob.additional && !ob.default) }).length !== 0) { setuploaded(true) } else { setuploaded(false) }
  }, [libraries])

  // ── Chip remove handler ───────────────────────────────────────────────────
  const handleChipRemove = (componentId) => {
    const updated = removeFavourite(componentId)
    setFavourites(updated)
    showSnackbar('Removed from favourites')
  }

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
    return (
      <div key={library.id}>
        <ListItem onClick={(e, id = library.id) => handleCollapse(id)} button divider>
          <span className={classes.head}>{library.library_name.slice(0, -4)}</span>
          {collapse[library.id] ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={collapse[library.id]} timeout={'auto'} unmountOnExit mountOnEnter exit={false}>
          <List component="div" disablePadding dense >
            {/* Chunked Components of Library */}
            {components[library.id] && chunk(components[library.id], COMPONENTS_PER_ROW).map((componentChunk) => {
              return (
                <ListItem key={componentChunk[0].svg_path} divider>
                  {componentChunk.map((component) => {
                    return (
                      <ListItemIcon key={component.full_name} style={{ position: 'relative' }}>
                        {/* Pass localStorage favourites state to SideComp */}
                        <SideComp
                          component={component}
                          setFavourite={setFavourites}
                          favourite={favourites}
                        />
                      </ListItemIcon>
                    )
                  })}
                </ListItem>
              )
            })}
          </List>
        </Collapse>
      </div>
    )
  }

  return (
    <>
      <Hidden smDown>
        <div className={classes.toolbar} />
      </Hidden>

      <div style={isSimulate ? { display: 'none' } : {}}>
        {/* Display List of categorized components */}
        <List>
          <ListItem button>
            <h2 style={{ margin: '5px' }}>Components List</h2>
          </ListItem>

          {/* Component search bar — dispatches to backend API */}
          <ListItem>
            <ComponentSearchBar
              ref={searchBarRef}
              onSearchChange={handleSearchChange}
              placeholder="Search components…"
            />
          </ListItem>

          {/* ── Favourites Chips Bar ──────────────────────────────────────────────
              Shown to ALL users (no auth check). Persists via localStorage.
              Empty when no favourites — no placeholder shown.
          ─────────────────────────────────────────────────────────────────────── */}
          {favourites.length > 0 && (
            <ListItem style={{ padding: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography
                variant="caption"
                style={{
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#616161',
                  padding: '4px 8px 0'
                }}
              >
                ⭐ FAVOURITES
              </Typography>
              <div className={classes.favBar}>
                {favourites.map((comp) => (
                  <FavChip
                    key={comp.id}
                    component={comp}
                    onRemove={handleChipRemove}
                    classes={classes}
                  />
                ))}
              </div>
            </ListItem>
          )}

          <div style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' }} >

            {/* API search results from ComponentSearchBar */}
            {activeSearchQuery.trim() !== '' && (
              searchLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <CircularProgress size={24} />
                </div>
              ) : searchError ? (
                <Typography variant="body2" style={{ padding: '16px', color: '#c62828' }}>
                  Search failed. Please try again.
                </Typography>
              ) : (searchResults && searchResults.length > 0) ? (
                chunk(searchResults, COMPONENTS_PER_ROW).map((componentChunk) => {
                  return (
                    <ListItem key={componentChunk.map((c) => c.id).join('-')} divider>
                      {componentChunk.map((component) => {
                        return (
                          <ListItemIcon key={component.id}>
                            <SideComp component={component} setFavourite={setFavourites} favourite={favourites} />
                          </ListItemIcon>
                        )
                      })}
                    </ListItem>
                  )
                })
              ) : (
                <Typography variant="body2" style={{ padding: '16px', color: '#999' }}>
                  No components found for &ldquo;{activeSearchQuery}&rdquo;
                </Typography>
              )
            )}

            {activeSearchQuery.trim() === '' && favourites && favourites.length > 0 &&
              <>
                <ListItem button onClick={() => setFavOpen((prev) => !prev)} divider>
                  <span className={classes.head}>Favourite Components</span>
                  <div>
                    {favOpen ? <ExpandLess /> : <ExpandMore />}
                  </div>
                </ListItem>
                <Collapse in={favOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    <ListItem>
                      <div style={{ marginLeft: '-30px' }}>
                        {chunk(favourites, 3).map((componentChunk) => {
                          return (
                            <div key={`fav-chunk-${componentChunk[0].id}`}>
                              <ListItem key={`fav-item-${componentChunk[0].id}`} divider>
                                {
                                  componentChunk.map((component) => {
                                    return (
                                      <ListItemIcon key={component.full_name}>
                                        <SideComp favourite={favourites} setFavourite={setFavourites} component={component} />
                                      </ListItemIcon>
                                    )
                                  }
                                  )
                                }
                              </ListItem>
                            </div>
                          )
                        })}
                      </div>
                    </ListItem>
                  </List>
                </Collapse>
              </>
            }
            {activeSearchQuery.trim() === '' &&
            <>
              <div style={!def ? { display: 'none' } : {}}>
                <Divider />
                <ListItem dense divider style={{ backgroundColor: '#e8e8e8' }}>
                  <span>DEFAULT</span>
                </ListItem>
                <Divider />
                { libraries.sort(function (a, b) {
                  const textA = a.library_name.toUpperCase()
                  const textB = b.library_name.toUpperCase()
                  return (textA < textB) ? -1 : (textA > textB) ? 1 : 0
                }).filter((library) => {
                  if (library.default) { return 1 }
                  return 0
                }).map(
                  (library) => {
                    return (libraryDropDown(library))
                  }
                )}
              </div>
              <div style={!additional ? { display: 'none' } : {}}>
                <ListItem dense divider style={{ backgroundColor: '#e8e8e8' }}>
                  <span className={classes.head}>ADDITIONAL</span>
                </ListItem>
                { libraries.sort(function (a, b) {
                  const textA = a.library_name.toUpperCase()
                  const textB = b.library_name.toUpperCase()
                  return (textA < textB) ? -1 : (textA > textB) ? 1 : 0
                }).filter((library) => {
                  if (library.additional) { return 1 }
                  return 0
                }).map(
                  (library) => {
                    return (libraryDropDown(library))
                  }
                )}
              </div>
              <div style={!uploaded ? { display: 'none' } : {}}>
                <ListItem dense divider style={{ backgroundColor: '#e8e8e8' }}>
                  <span className={classes.head}>UPLOADED</span>
                </ListItem>
                { libraries.sort(function (a, b) {
                  const textA = a.library_name.toUpperCase()
                  const textB = b.library_name.toUpperCase()
                  return (textA < textB) ? -1 : (textA > textB) ? 1 : 0
                }).filter((library) => {
                  if (!library.default && !library.additional) { return 1 }
                  return 0
                }).map(
                  (library) => {
                    return (libraryDropDown(library))
                  }
                )}
              </div>
            </>
            }

          </div>
        </List>
      </div>
      <div style={isSimulate ? {} : { display: 'none' }}>
        {/* Display simulation modes parameters on left side pane */}
        <List>
          <ListItem button divider>
            <h2 style={{ margin: '5px auto 5px 5px' }}>Simulation Modes</h2>
            <Tooltip title="close">
              <IconButton color="inherit" className={classes.tools} size="small" onClick={() => { dispatch(toggleSimulate()) }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </ListItem>
          <SimulationProperties ltiSimResult={ltiSimResult} setLtiSimResult={setLtiSimResult} />
        </List>
      </div>

      {/* Global snackbar for star toggle feedback */}
      <Snackbar
        style={{ zIndex: 100 }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={closeSnackbar}
        message={snackbar.message}
        action={
          <>
            <IconButton size="small" aria-label="close" color="inherit" onClick={closeSnackbar}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      />
    </>
  )
}

ComponentSidebar.propTypes = {
  compRef: PropTypes.object.isRequired,
  ltiSimResult: PropTypes.string,
  setLtiSimResult: PropTypes.func
}
