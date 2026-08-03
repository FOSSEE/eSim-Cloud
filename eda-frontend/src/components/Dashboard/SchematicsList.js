/**
 * @file SchematicsList.js
 * @description User's "My Schematics" dashboard page.
 *
 * Cleaned and unified to show:
 *   1. Quick Actions header bar — New Circuit, Open Gallery, Open Simulator
 *   2. Search & Sort controls alongside a tabbed view
 *   3. Tabs categorized into: Schematics, Projects, LTI Apps, LTI Submissions
 *   4. Each category groups Pinned circuits at the top and Recent ones below
 *   5. Option under "Projects" tab to bundle multiple saved circuits into a new project
 *
 * Built using the modern, premium CircuitCard component.
 */
import React, { useCallback, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  Grid,
  Button,
  Typography,
  Input,
  IconButton,
  Popover,
  FormControl,
  Tabs,
  Tab,
  AppBar,
  Select,
  MenuItem,
  InputLabel,
  CircularProgress,
  Box,
  Divider,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Card,
  CardContent,
  CardActionArea
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Link as RouterLink } from 'react-router-dom'
import CircuitCard from './CircuitCard'
import { useDispatch, useSelector } from 'react-redux'
import { fetchSchematics, fetchMyProjects } from '../../redux/actions/index'
import FilterListIcon from '@material-ui/icons/FilterList'
import AddIcon from '@material-ui/icons/Add'
import AppsIcon from '@material-ui/icons/Apps'
import PlayCircleOutlineIcon from '@material-ui/icons/PlayCircleOutline'
import FolderIcon from '@material-ui/icons/Folder'
import { Alert } from '@material-ui/lab'
import api from '../../utils/Api'

const useStyles = makeStyles((theme) => ({
  typography: {
    padding: theme.spacing(2)
  },
  popover: {
    paddingRight: '10px'
  },
  // ── Quick Actions bar ──────────────────────────────────────────────────────
  quickActionsBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: theme.spacing(3)
  },
  quickActionsTitle: {
    fontWeight: 700,
    fontSize: '0.85rem',
    color: theme.palette.text.secondary,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginRight: theme.spacing(1)
  },
  // ── Section headings ───────────────────────────────────────────────────────
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(1.5),
    marginTop: theme.spacing(2)
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: '1.05rem',
    marginRight: theme.spacing(1)
  },
  sectionDivider: {
    marginBottom: theme.spacing(2.5),
    marginTop: theme.spacing(3)
  },
  emptyText: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    padding: theme.spacing(2, 0),
    textAlign: 'center'
  },
  // ── Loading / error states ─────────────────────────────────────────────────
  centeredSpinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 180
  },
  filterContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: theme.spacing(2)
  }
}))

function TabPanel (props) {
  const { children, value, index } = props
  return (
    <React.Fragment>
      {value === index && (
        <Box style={{ width: '100%', marginTop: '16px' }}>{children}</Box>
      )}
    </React.Fragment>
  )
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
}

// Helper to render pinned & recent circuits for a given tab's data
function CircuitListSection ({ circuits, emptyMessage, onRefresh, classes, inProjectFolder = false }) {
  const pinnedCircuits = circuits.filter(s => s.pinned === true)
  const recentCircuits = circuits.filter(s => s.pinned !== true)

  return (
    <Grid container spacing={3}>
      {/* Pinned Section */}
      {pinnedCircuits.length > 0 && (
        <Grid item xs={12}>
          <div className={classes.sectionHeader}>
            <Typography className={classes.sectionTitle} variant='h6'>
              ★ Pinned
            </Typography>
            <Typography variant='body2' color='textSecondary'>
              ({pinnedCircuits.length})
            </Typography>
          </div>
          <Grid container spacing={2}>
            {pinnedCircuits.map((sch) => (
              <Grid item xs={12} sm={6} md={4} key={sch.save_id}>
                <CircuitCard sch={sch} onRefresh={onRefresh} inProjectFolder={inProjectFolder} />
              </Grid>
            ))}
          </Grid>
          <Divider className={classes.sectionDivider} />
        </Grid>
      )}

      {/* Recent Section */}
      <Grid item xs={12}>
        {pinnedCircuits.length > 0 && recentCircuits.length > 0 && (
          <div className={classes.sectionHeader}>
            <Typography className={classes.sectionTitle} variant='h6'>
              🕒 Recent
            </Typography>
            <Typography variant='body2' color='textSecondary'>
              ({recentCircuits.length})
            </Typography>
          </div>
        )}

        {recentCircuits.length === 0 && pinnedCircuits.length === 0 ? (
          <Typography className={classes.emptyText}>
            {emptyMessage}
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {recentCircuits.map((sch) => (
              <Grid item xs={12} sm={6} md={4} key={sch.save_id}>
                <CircuitCard sch={sch} onRefresh={onRefresh} inProjectFolder={inProjectFolder} />
              </Grid>
            ))}
          </Grid>
        )}
      </Grid>
    </Grid>
  )
}

CircuitListSection.propTypes = {
  circuits: PropTypes.array.isRequired,
  emptyMessage: PropTypes.string.isRequired,
  onRefresh: PropTypes.func.isRequired,
  classes: PropTypes.object.isRequired,
  inProjectFolder: PropTypes.bool
}

export default function SchematicsList ({ ltiDetails = null }) {
  const classes = useStyles()
  const auth = useSelector(state => state.authReducer)
  const schematics = useSelector(state => state.dashboardReducer.schematics)
  const myProjects = useSelector(state => state.dashboardReducer.myProjects)
  const [saves, setSaves] = React.useState(schematics)
  const dispatch = useDispatch()
  const [anchorEl, setAnchorEl] = React.useState(null)
  const open = Boolean(anchorEl)
  const [value, setValue] = React.useState(0)
  const [sort, setSort] = React.useState('')
  const [order, setOrder] = React.useState('ascending')

  // Local loading / error state for the initial fetch
  const [isLoading, setIsLoading] = React.useState(false)
  const [fetchError, setFetchError] = React.useState(null)

  // Project dialog and create variables
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false)
  const [projectTitle, setProjectTitle] = React.useState('')
  const [projectDescription, setProjectDescription] = React.useState('')
  const [selectedCircuitIds, setSelectedCircuitIds] = React.useState([])
  const [projectError, setProjectError] = React.useState('')
  const [isSubmittingProject, setIsSubmittingProject] = React.useState(false)
  const [activeProjectId, setActiveProjectId] = React.useState(null)

  // Edit Project variables
  const [editProjectDialogOpen, setEditProjectDialogOpen] = React.useState(false)
  const [editProjectTitle, setEditProjectTitle] = React.useState('')
  const [editProjectDescription, setEditProjectDescription] = React.useState('')
  const [editProjectError, setEditProjectError] = React.useState('')
  const [isSubmittingEditProject, setIsSubmittingEditProject] = React.useState(false)

  // Add Schematic variables
  const [addSchematicDialogOpen, setAddSchematicDialogOpen] = React.useState(false)
  const [selectedAddCircuitIds, setSelectedAddCircuitIds] = React.useState([])
  const [addCircuitError, setAddCircuitError] = React.useState('')
  const [isSubmittingAddCircuit, setIsSubmittingAddCircuit] = React.useState(false)

  const handleOpenEditProjectDialog = (project) => {
    setEditProjectTitle(project.title)
    setEditProjectDescription(project.description || '')
    setEditProjectError('')
    setEditProjectDialogOpen(true)
  }

  const handleCloseEditProjectDialog = () => {
    setEditProjectDialogOpen(false)
  }

  const handleEditProject = () => {
    if (!editProjectTitle.trim()) {
      setEditProjectError('Project title is required')
      return
    }

    setIsSubmittingEditProject(true)
    setEditProjectError('')

    const token = auth.token || localStorage.getItem('esim_token')
    const config = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }

    api.patch(`/publish/myproject/${activeProjectId}/`, {
      title: editProjectTitle,
      description: editProjectDescription
    }, config)
      .then(() => {
        setIsSubmittingEditProject(false)
        setEditProjectDialogOpen(false)
        doFetch()
      })
      .catch((err) => {
        setIsSubmittingEditProject(false)
        setEditProjectError(err.response?.data?.error || 'Failed to update project details')
      })
  }

  const handleOpenAddSchematicDialog = (project) => {
    setSelectedAddCircuitIds([])
    setAddCircuitError('')
    setAddSchematicDialogOpen(true)
  }

  const handleCloseAddSchematicDialog = () => {
    setAddSchematicDialogOpen(false)
  }

  const handleToggleAddCircuitSelection = (saveId) => {
    if (selectedAddCircuitIds.includes(saveId)) {
      setSelectedAddCircuitIds(selectedAddCircuitIds.filter(id => id !== saveId))
    } else {
      setSelectedAddCircuitIds([...selectedAddCircuitIds, saveId])
    }
  }

  const handleAddSchematics = () => {
    if (selectedAddCircuitIds.length === 0) {
      setAddCircuitError('Please select at least one circuit to add')
      return
    }

    setIsSubmittingAddCircuit(true)
    setAddCircuitError('')

    const token = auth.token || localStorage.getItem('esim_token')
    const config = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }

    api.post('/publish/add_schematic/', {
      project_id: activeProjectId,
      save_ids: selectedAddCircuitIds
    }, config)
      .then(() => {
        setIsSubmittingAddCircuit(false)
        setAddSchematicDialogOpen(false)
        doFetch()
      })
      .catch((err) => {
        setIsSubmittingAddCircuit(false)
        setAddCircuitError(err.response?.data?.error || 'Failed to add schematics to project')
      })
  }

  const doFetch = useCallback(() => {
    const hasToken = auth.token || localStorage.getItem('esim_auth_token')
    if (!hasToken) {
      return
    }

    setIsLoading(true)
    setFetchError(null)
    Promise.all([
      Promise.resolve(dispatch(fetchSchematics())),
      Promise.resolve(dispatch(fetchMyProjects()))
    ])
      .catch((err) => {
        if (err.response && err.response.status === 401) {
          localStorage.removeItem('esim_auth_token')
          if (auth.token) {
            dispatch({ type: 'AUTH_ERROR' })
          }
          window.location.reload()
        } else {
          setFetchError(err ? err.message || 'Failed to load circuits.' : 'Failed to load circuits.')
        }
      })
      .finally(() => setIsLoading(false))
  }, [dispatch, auth.token])

  useEffect(() => { doFetch() }, [doFetch])
  useEffect(() => { setSaves(schematics) }, [schematics])

  const onSearch = (e) => {
    setSaves(schematics.filter((o) =>
      // eslint-disable-next-line
      Object.keys(o).some((k) => {
        if ((k === 'name' || k === 'description' || k === 'owner' || k === 'save_time' || k === 'create_time') && String(o[k]).toLowerCase().includes(e.target.value.toLowerCase())) {
          return String(o[k]).toLowerCase().includes(e.target.value.toLowerCase())
        }
      })
    ))
  }

  const handleFilterOpen = (e) => {
    if (anchorEl) {
      setAnchorEl(null)
    } else {
      setAnchorEl(e.currentTarget)
    }
  }

  const sortSaves = (sorting, order) => {
    const sorted = [...saves]
    if (order === 'ascending') {
      if (sorting === 'name') {
        setSaves(sorted.sort((a, b) => (a.name > b.name) ? 1 : -1))
      } else if (sorting === 'created_at') {
        setSaves(sorted.sort((a, b) => (a.create_time > b.create_time) ? 1 : -1))
      } else if (sorting === 'updated_at') {
        setSaves(sorted.sort((a, b) => (a.save_time < b.save_time) ? 1 : -1))
      }
    } else {
      if (sorting === 'name') {
        setSaves(sorted.sort((a, b) => (a.name < b.name) ? 1 : -1))
      } else if (sorting === 'created_at') {
        setSaves(sorted.sort((a, b) => (a.create_time < b.create_time) ? 1 : -1))
      } else if (sorting === 'updated_at') {
        setSaves(sorted.sort((a, b) => (a.save_time > b.save_time) ? 1 : -1))
      }
    }
  }

  const handleSort = (e) => {
    sortSaves(e.target.value, order)
    setSort(e.target.value)
  }

  const handleOrder = (e) => {
    setOrder(e.target.value)
    if (sort !== '') {
      sortSaves(sort, e.target.value)
    }
  }

  const handleChange = (event, newValue) => {
    setValue(newValue)
    setActiveProjectId(null)
  }

  const handleOpenProjectDialog = () => {
    setProjectTitle('')
    setProjectDescription('')
    setSelectedCircuitIds([])
    setProjectError('')
    setProjectDialogOpen(true)
  }

  const handleCloseProjectDialog = () => {
    setProjectDialogOpen(false)
  }

  const handleToggleCircuitSelection = (saveId) => {
    if (selectedCircuitIds.includes(saveId)) {
      setSelectedCircuitIds(selectedCircuitIds.filter(id => id !== saveId))
    } else {
      setSelectedCircuitIds([...selectedCircuitIds, saveId])
    }
  }

  const handleCreateProject = () => {
    if (!projectTitle.trim()) {
      setProjectError('Project title is required')
      return
    }
    if (selectedCircuitIds.length === 0) {
      setProjectError('Please select at least one circuit to bundle')
      return
    }

    setIsSubmittingProject(true)
    setProjectError('')

    const token = auth.token || localStorage.getItem('esim_token')
    const config = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }

    api.post('/publish/create_project/', {
      title: projectTitle,
      description: projectDescription,
      save_ids: selectedCircuitIds
    }, config)
      .then(() => {
        setIsSubmittingProject(false)
        setProjectDialogOpen(false)
        doFetch()
      })
      .catch((err) => {
        setIsSubmittingProject(false)
        setProjectError(err.response?.data?.error || 'Failed to create project')
      })
  }

  return (
    <>
      <Grid
        container
        direction='row'
        justify='flex-start'
        alignItems='flex-start'
        alignContent='center'
        spacing={3}
      >
        {/* Quick Actions Bar */}
        <Grid item xs={12}>
          <Paper className={classes.quickActionsBar} elevation={0}>
            <Typography className={classes.quickActionsTitle}>
              Quick Actions
            </Typography>

            <Button
              size='small'
              variant='contained'
              color='primary'
              startIcon={<AddIcon />}
              component={RouterLink}
              to='/editor'
            >
              New Circuit
            </Button>

            <Button
              size='small'
              variant='outlined'
              startIcon={<AppsIcon />}
              component={RouterLink}
              to='/gallery'
            >
              Open Gallery
            </Button>

            <Button
              size='small'
              variant='outlined'
              startIcon={<PlayCircleOutlineIcon />}
              component={RouterLink}
              to='/simulator/ngspice'
            >
              Open Simulator
            </Button>
          </Paper>
        </Grid>

        {!(auth.token || localStorage.getItem('esim_auth_token')) ? (
          <Grid item xs={12}>
            <Alert severity="info">Login to view your saved circuits.</Alert>
          </Grid>
        ) : (
          <>
            {/* Error view */}
            {fetchError && (
              <Grid item xs={12}>
                <Alert severity="error">{fetchError}</Alert>
              </Grid>
            )}

            {/* Filter and Tab Options */}
            <Grid item xs={12}>
              <Box className={classes.filterContainer}>
                <Typography variant='h5' style={{ fontWeight: 600 }}>
                  Welcome, {auth.user ? auth.user.username : ''}
                </Typography>
                <Box display="flex" alignItems="center">
                  <Input onChange={(e) => onSearch(e)} placeholder='Search circuits...' />
                  {schematics && (
                    <IconButton onClick={handleFilterOpen}>
                      <FilterListIcon />
                    </IconButton>
                  )}
                </Box>
              </Box>

              <Popover
                open={open}
                onClose={handleFilterOpen}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'center'
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'center'
                }}
                anchorEl={anchorEl}
              >
                <FormControl style={{ width: '200px', padding: '10px' }}>
                  <InputLabel style={{ marginLeft: '10px' }}>Select Sort</InputLabel>
                  <Select className={classes.popover} value={sort} onChange={handleSort}>
                    <MenuItem key='name' value='name'>Name</MenuItem>
                    <MenuItem key='created_at' value='created_at'>Created</MenuItem>
                    <MenuItem key='updated_at' value='updated_at'>Updated</MenuItem>
                  </Select>
                </FormControl>
                <FormControl style={{ width: '200px', padding: '10px' }}>
                  <InputLabel style={{ marginLeft: '10px' }}>Select Order</InputLabel>
                  <Select className={classes.popover} value={order} onChange={handleOrder}>
                    <MenuItem key='ascending' value='ascending'>Ascending</MenuItem>
                    <MenuItem key='descending' value='descending'>Descending</MenuItem>
                  </Select>
                </FormControl>
              </Popover>

              <AppBar position='static' color='default' elevation={0} style={{ borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                <Tabs value={value} onChange={handleChange} indicatorColor="primary" textColor="primary">
                  <Tab label='Schematics' />
                  <Tab label='Projects' />
                  <Tab label='LTI Apps' />
                  <Tab label='LTI Submissions' />
                </Tabs>
              </AppBar>
            </Grid>

            {/* Loading / Results display */}
            {isLoading ? (
              <Grid item xs={12}>
                <Box className={classes.centeredSpinner}>
                  <CircularProgress />
                </Box>
              </Grid>
            ) : (
              <Grid item xs={12}>
                {/* TabPanel 0: Schematics */}
                <TabPanel value={value} index={0}>
                  <CircuitListSection
                    circuits={saves.filter(x => x.lti_id == null && x.is_submission == null)}
                    emptyMessage={`Hey ${auth.user?.username || ''}, you don't have any saved schematics...`}
                    onRefresh={doFetch}
                    classes={classes}
                  />
                </TabPanel>

                {/* TabPanel 1: Projects */}
                <TabPanel value={value} index={1}>
                  {activeProjectId && myProjects.find(p => p.project_id === activeProjectId) ? (
                    (() => {
                      const activeProject = myProjects.find(p => p.project_id === activeProjectId)
                      return (
                        <div>
                          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap">
                            <Box display="flex" alignItems="center">
                              <Button
                                variant="outlined"
                                color="default"
                                size="small"
                                onClick={() => setActiveProjectId(null)}
                                style={{ marginRight: '16px' }}
                              >
                                ← Back to Projects
                              </Button>
                              <Typography variant="h5" style={{ fontWeight: 600, marginRight: '16px' }}>
                                {activeProject.title}
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                onClick={() => handleOpenEditProjectDialog(activeProject)}
                              >
                                Edit Details
                              </Button>
                            </Box>
                            <Button
                              variant="contained"
                              color="primary"
                              size="small"
                              onClick={() => handleOpenAddSchematicDialog(activeProject)}
                            >
                              + Add Schematic
                            </Button>
                          </Box>
                          <Typography variant="body1" color="textSecondary" style={{ marginBottom: '20px' }}>
                            {activeProject.description || 'No description provided.'}
                          </Typography>
                          <Divider style={{ marginBottom: '24px' }} />
                          <CircuitListSection
                            circuits={activeProject.schematics || []}
                            emptyMessage="This project bundle is empty."
                            onRefresh={doFetch}
                            classes={classes}
                            inProjectFolder={true}
                          />
                        </div>
                      )
                    })()
                  ) : (
                    <div>
                      <Box display="flex" justifyContent="flex-end" mb={2}>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleOpenProjectDialog}
                        >
                          Create Project
                        </Button>
                      </Box>
                      {myProjects.length === 0 ? (
                        <Typography className={classes.emptyText}>
                          Hey {auth.user?.username || ''}, you don't have any saved projects...
                        </Typography>
                      ) : (
                        <Grid container spacing={3}>
                          {myProjects.map((proj) => (
                            <Grid item xs={12} sm={6} md={4} key={proj.project_id}>
                              <Card style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                <CardActionArea onClick={() => setActiveProjectId(proj.project_id)} style={{ flexGrow: 1 }}>
                                  <CardContent>
                                    <Box display="flex" alignItems="center" mb={1.5}>
                                      <FolderIcon style={{ color: '#ffca28', fontSize: '2.5rem', marginRight: '12px' }} />
                                      <div>
                                        <Typography variant="h6" style={{ fontWeight: 600, lineHeight: 1.2 }}>
                                          {proj.title}
                                        </Typography>
                                        <Typography variant="caption" color="textSecondary">
                                          {(proj.schematics || []).length} {(proj.schematics || []).length === 1 ? 'circuit' : 'circuits'}
                                        </Typography>
                                      </div>
                                    </Box>
                                    <Typography variant="body2" color="textSecondary" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '40px' }}>
                                      {proj.description || 'No description provided.'}
                                    </Typography>
                                  </CardContent>
                                </CardActionArea>
                                <Box p={1.5} display="flex" justifyContent="flex-end" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                  <Button size="small" color="primary" onClick={() => setActiveProjectId(proj.project_id)}>
                                    Open Group
                                  </Button>
                                </Box>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      )}
                    </div>
                  )}
                </TabPanel>

                {/* TabPanel 2: LTI Apps */}
                <TabPanel value={value} index={2}>
                  <CircuitListSection
                    circuits={saves.filter(x => x.lti_id != null)}
                    emptyMessage={`Hey ${auth.user?.username || ''}, you don't have any saved LTI apps...`}
                    onRefresh={doFetch}
                    classes={classes}
                  />
                </TabPanel>

                {/* TabPanel 3: LTI Submissions */}
                <TabPanel value={value} index={3}>
                  <CircuitListSection
                    circuits={saves.filter(x => x.is_submission != null)}
                    emptyMessage={`Hey ${auth.user?.username || ''}, you don't have any saved submissions...`}
                    onRefresh={doFetch}
                    classes={classes}
                  />
                </TabPanel>
              </Grid>
            )}
          </>
        )}
      </Grid>

      {/* Create Project Bundle Dialog */}
      <Dialog
        open={projectDialogOpen}
        onClose={handleCloseProjectDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Project Bundle</DialogTitle>
        <DialogContent dividers>
          {projectError && (
            <Box mb={2}>
              <Alert severity="error">{projectError}</Alert>
            </Box>
          )}

          <TextField
            autoFocus
            margin="dense"
            label="Project Title"
            type="text"
            fullWidth
            variant="outlined"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            style={{ marginBottom: '16px' }}
          />

          <TextField
            margin="dense"
            label="Project Description"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            style={{ marginBottom: '20px' }}
          />

          <Typography variant="subtitle2" gutterBottom style={{ fontWeight: 600 }}>
            Select Saved Circuits to Bundle:
          </Typography>

          <Box style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '4px', padding: '8px' }}>
            {saves.filter(x => x.lti_id == null && x.is_submission == null).length === 0 ? (
              <Typography variant="body2" color="textSecondary" style={{ textAlign: 'center', padding: '16px 0' }}>
                No saved circuits available.
              </Typography>
            ) : (
              <FormGroup>
                {saves.filter(x => x.lti_id == null && x.is_submission == null).map((sch) => (
                  <FormControlLabel
                    key={sch.save_id}
                    control={
                      <Checkbox
                        checked={selectedCircuitIds.includes(sch.save_id)}
                        onChange={() => handleToggleCircuitSelection(sch.save_id)}
                        color="primary"
                      />
                    }
                    label={sch.name || String(sch.save_id).slice(0, 8)}
                  />
                ))}
              </FormGroup>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseProjectDialog} color="default" disabled={isSubmittingProject}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            color="primary"
            variant="contained"
            disabled={isSubmittingProject}
          >
            {isSubmittingProject ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog
        open={editProjectDialogOpen}
        onClose={handleCloseEditProjectDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Project Details</DialogTitle>
        <DialogContent dividers>
          {editProjectError && (
            <Box mb={2}>
              <Alert severity="error">{editProjectError}</Alert>
            </Box>
          )}

          <TextField
            autoFocus
            margin="dense"
            label="Project Title"
            type="text"
            fullWidth
            variant="outlined"
            value={editProjectTitle}
            onChange={(e) => setEditProjectTitle(e.target.value)}
            style={{ marginBottom: '16px' }}
          />

          <TextField
            margin="dense"
            label="Project Description"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={editProjectDescription}
            onChange={(e) => setEditProjectDescription(e.target.value)}
            style={{ marginBottom: '20px' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditProjectDialog} color="default" disabled={isSubmittingEditProject}>
            Cancel
          </Button>
          <Button
            onClick={handleEditProject}
            color="primary"
            variant="contained"
            disabled={isSubmittingEditProject}
          >
            {isSubmittingEditProject ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Schematic Dialog */}
      <Dialog
        open={addSchematicDialogOpen}
        onClose={handleCloseAddSchematicDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Schematics to Project</DialogTitle>
        <DialogContent dividers>
          {addCircuitError && (
            <Box mb={2}>
              <Alert severity="error">{addCircuitError}</Alert>
            </Box>
          )}

          <Typography variant="subtitle2" gutterBottom style={{ fontWeight: 600 }}>
            Select Saved Circuits to Add:
          </Typography>

          <Box style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '4px', padding: '8px' }}>
            {saves.filter(x => x.lti_id == null && x.is_submission == null && x.project_id !== activeProjectId).length === 0 ? (
              <Typography variant="body2" color="textSecondary" style={{ textAlign: 'center', padding: '16px 0' }}>
                No additional saved circuits available.
              </Typography>
            ) : (
              <FormGroup>
                {saves.filter(x => x.lti_id == null && x.is_submission == null && x.project_id !== activeProjectId).map((sch) => (
                  <FormControlLabel
                    key={sch.save_id}
                    control={
                      <Checkbox
                        checked={selectedAddCircuitIds.includes(sch.save_id)}
                        onChange={() => handleToggleAddCircuitSelection(sch.save_id)}
                        color="primary"
                      />
                    }
                    label={sch.name || String(sch.save_id).slice(0, 8)}
                  />
                ))}
              </FormGroup>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddSchematicDialog} color="default" disabled={isSubmittingAddCircuit}>
            Cancel
          </Button>
          <Button
            onClick={handleAddSchematics}
            color="primary"
            variant="contained"
            disabled={isSubmittingAddCircuit}
          >
            {isSubmittingAddCircuit ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

SchematicsList.propTypes = {
  ltiDetails: PropTypes.string
}
