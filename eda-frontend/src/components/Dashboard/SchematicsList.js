/**
 * @file SchematicsList.js
 * @description User's "My Schematics" dashboard page.
 *
 * Redesigned to show:
 *   1. Quick Actions header bar — New Circuit, Open Gallery, Open Simulator
 *   2. Pinned section  — circuits with pinned === true (always visible)
 *   3. Recent section  — all circuits in save_time desc order (as returned by API)
 *   4. Existing tabbed view (Schematics / Projects / LTI Apps / LTI Submissions)
 *      preserved below the new sections so nothing is removed.
 *
 * All existing Redux connections, props, and auth state are kept.
 */
import React, { useCallback, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  Card,
  Grid,
  Button,
  Typography,
  CardActions,
  CardContent,
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
  Paper
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Link as RouterLink } from 'react-router-dom'
import SchematicCard from './SchematicCard'
import CircuitCard from './CircuitCard'
import { useDispatch, useSelector } from 'react-redux'
import { fetchSchematics } from '../../redux/actions/index'
import FilterListIcon from '@material-ui/icons/FilterList'
import AddIcon from '@material-ui/icons/Add'
import AppsIcon from '@material-ui/icons/Apps'
import PlayCircleOutlineIcon from '@material-ui/icons/PlayCircleOutline'
import { Alert } from '@material-ui/lab'

const useStyles = makeStyles((theme) => ({
  mainHead: {
    width: '100%',
    backgroundColor: '#404040',
    color: '#fff'
  },
  title: {
    fontSize: 14,
    color: '#80ff80'
  },
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
    marginBottom: theme.spacing(1.5)
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
    padding: theme.spacing(1.5, 0)
  },
  // ── Loading / error states ─────────────────────────────────────────────────
  centeredSpinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 180
  },
  errorBox: {
    padding: theme.spacing(2),
    backgroundColor: '#fdecea',
    border: '1px solid #f44336',
    borderRadius: 8,
    color: '#c62828',
    fontSize: '0.875rem',
    marginBottom: theme.spacing(2)
  }
}))

function TabPanel (props) {
  const { children, value, index } = props
  return (
    <React.Fragment>
      {value === index && (
        <>{children}</>
      )}
    </React.Fragment>
  )
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
}

// ── Header card (unchanged from original) ─────────────────────────────────────
function MainCard () {
  const classes = useStyles()
  return (
    <Card className={classes.mainHead}>
      <CardContent>
        <Typography className={classes.title} gutterBottom>
          All schematics are Listed Below
        </Typography>
        <Typography variant='h5' component='h2'>
          My Schematics
        </Typography>
      </CardContent>
      <CardActions>
        <Button
          target='_blank'
          component={RouterLink}
          to='/editor'
          size='small'
          color='primary'
        >
          Create New
        </Button>
        <Button size='small' color='secondary'>
          Load More
        </Button>
      </CardActions>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SchematicsList ({ ltiDetails = null }) {
  const classes = useStyles()
  const auth = useSelector(state => state.authReducer)
  const schematics = useSelector(state => state.dashboardReducer.schematics)
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

  // ── Fetch helper — also used as onRefresh callback for CircuitCard ─────────
  const doFetch = useCallback(() => {
    const hasToken = auth.token || localStorage.getItem('esim_token')
    if (!hasToken) {
      return
    }

    setIsLoading(true)
    setFetchError(null)
    Promise.resolve(dispatch(fetchSchematics()))
      .catch((err) => {
        if (err.response && err.response.status === 401) {
          localStorage.removeItem('esim_token')
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

  // ── Derive pinned and recent lists from Redux schematics ───────────────────
  // Treat missing pinned field as false (backwards-compat with old records)
  const pinnedCircuits = schematics.filter(s => s.pinned === true)
  // Recent = all circuits that are NOT pinned
  const recentCircuits = schematics.filter(s => s.pinned !== true)

  // ── Search / sort (unchanged from original) ────────────────────────────────
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
    if (order === 'ascending') {
      if (sorting === 'name') {
        setSaves(saves.sort((a, b) => (a.name > b.name) ? 1 : -1))
      } else if (sorting === 'created_at') {
        setSaves(saves.sort((a, b) => (a.create_time > b.create_time) ? 1 : -1))
      } else if (sorting === 'updated_at') {
        setSaves(saves.sort((a, b) => (a.save_time < b.save_time) ? 1 : -1))
      }
    } else {
      if (sorting === 'name') {
        setSaves(saves.sort((a, b) => (a.name < b.name) ? 1 : -1))
      } else if (sorting === 'created_at') {
        setSaves(saves.sort((a, b) => (a.create_time < b.create_time) ? 1 : -1))
      } else if (sorting === 'updated_at') {
        setSaves(saves.sort((a, b) => (a.save_time > b.save_time) ? 1 : -1))
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
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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
        {/* ── Quick Actions bar ─────────────────────────────────────────────── */}
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

        {!(auth.token || localStorage.getItem('esim_token')) ? (
          <Grid item xs={12}>
            <Alert severity="info">Login to view your saved circuits.</Alert>
          </Grid>
        ) : (
          <>
            {/* ── Error state ───────────────────────────────────────────────────── */}
            {fetchError && (
              <Grid item xs={12}>
                <Alert severity="error">{fetchError}</Alert>
              </Grid>
            )}

            {/* ── Loading state ─────────────────────────────────────────────────── */}
            {isLoading
              ? (
                <Grid item xs={12}>
                  <Box className={classes.centeredSpinner}>
                    <CircularProgress />
                  </Box>
                </Grid>
              )
              : (
                <>
                  {/* ── PINNED section ─────────────────────────────────────────────── */}
                  <Grid item xs={12}>
                    <div className={classes.sectionHeader}>
                      <Typography className={classes.sectionTitle} variant='h6'>
                  ★ Pinned
                      </Typography>
                      <Typography variant='body2' color='textSecondary'>
                  ({pinnedCircuits.length})
                      </Typography>
                    </div>

                    {pinnedCircuits.length === 0
                      ? (
                        <Typography className={classes.emptyText}>
                  No pinned circuits yet. Click <strong>Pin</strong> on any circuit card to pin it here.
                        </Typography>
                      )
                      : (
                        <Grid container spacing={2}>
                          {pinnedCircuits.map((sch) => (
                            <Grid item xs={12} sm={6} md={4} key={sch.save_id}>
                              <CircuitCard sch={sch} onRefresh={doFetch} />
                            </Grid>
                          ))}
                        </Grid>
                      )}
                  </Grid>

                  <Grid item xs={12}>
                    <Divider className={classes.sectionDivider} />
                  </Grid>

                  {/* ── RECENT section ─────────────────────────────────────────────── */}
                  <Grid item xs={12}>
                    <div className={classes.sectionHeader}>
                      <Typography className={classes.sectionTitle} variant='h6'>
                  🕒 Recent
                      </Typography>
                      <Typography variant='body2' color='textSecondary'>
                  ({recentCircuits.length} total)
                      </Typography>
                    </div>

                    {recentCircuits.length === 0
                      ? (
                        <Typography className={classes.emptyText}>
                  No saved circuits yet. Create your first circuit above!
                        </Typography>
                      )
                      : (
                        <Grid container spacing={2}>
                          {recentCircuits.map((sch) => (
                            <Grid item xs={12} sm={6} md={4} key={sch.save_id}>
                              <CircuitCard sch={sch} onRefresh={doFetch} />
                            </Grid>
                          ))}
                        </Grid>
                      )}
                  </Grid>
                </>
              )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            Everything below this line is the ORIGINAL SchematicsList content,
            preserved exactly as it was — no existing functionality removed.
            ════════════════════════════════════════════════════════════════════ */}

        {/* User Dashboard My Schematic Header */}
        <Grid item xs={12}>
          <Divider />
          <Box mt={3}>
            <MainCard />
          </Box>
        </Grid>

        <Grid item xs={12}>
          {schematics && <IconButton onClick={handleFilterOpen} style={{ float: 'right' }}><FilterListIcon /></IconButton>}
          {schematics && <Input style={{ float: 'right' }} onChange={(e) => onSearch(e)} placeholder='Search' />}
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
            <FormControl style={{ width: ' 200px', padding: '2%' }}>
              <InputLabel>Select Sort</InputLabel>
              <Select className={classes.popover} value={sort} onChange={handleSort}>
                <MenuItem key='name' value='name'>Name</MenuItem>
                <MenuItem key='created_at' value='created_at'>Created</MenuItem>
                <MenuItem key='updated_at' value='updated_at'>Updated</MenuItem>
              </Select>
            </FormControl>
            <FormControl style={{ width: ' 200px', padding: '2%' }}>
              <InputLabel>Select Order</InputLabel>
              <Select className={classes.popover} value={order} onChange={handleOrder}>
                <MenuItem key='ascending' value='ascending'>Ascending</MenuItem>
                <MenuItem key='descending' value='descending'>Descending</MenuItem>
              </Select>
            </FormControl>
          </Popover>
        </Grid>

        <AppBar position='static'>
          <Tabs value={value} onChange={handleChange}>
            <Tab label='Schematics' />
            <Tab label='Projects' />
            <Tab label='LTI Apps' />
            <Tab label='LTI Submissions' />
          </Tabs>
        </AppBar>

        <TabPanel style={{ width: '100%' }} value={value} index={0}>
          {saves.filter(x => { return (x.project_id == null && x.lti_id == null && x.is_submission == null) }).length !== 0
            ? <>
              {saves.filter(x => { return (x.project_id == null && x.lti_id == null && x.is_submission == null) }).map(
                (sch) => {
                  return (
                    <Grid item xs={12} sm={6} lg={3} key={sch.save_id}>
                      <SchematicCard sch={sch} />
                    </Grid>
                  )
                }
              )}
            </>
            : <Grid item xs={12}>
              <Card style={{ padding: '7px 15px' }} className={classes.mainHead}>
                <Typography variant='subtitle1' gutterBottom>
                  Hey {auth.user.username} , You dont have any saved schematics...
                </Typography>
              </Card>
            </Grid>
          }
        </TabPanel>

        <TabPanel style={{ width: '100%' }} value={value} index={1}>
          {saves.filter(x => { return x.project_id }).length !== 0
            ? <>
              {saves.filter(x => { return x.project_id }).map(
                (sch) => {
                  return (
                    <Grid item xs={12} sm={6} lg={3} key={sch.save_id}>
                      <SchematicCard sch={sch} />
                    </Grid>
                  )
                }
              )}
            </>
            : <Grid item xs={12}>
              <Card style={{ padding: '7px 15px' }} className={classes.mainHead}>
                <Typography variant='subtitle1' gutterBottom>
                  Hey {auth.user.username} , You dont have any saved projects...
                </Typography>
              </Card>
            </Grid>
          }
        </TabPanel>

        <TabPanel style={{ width: '100%' }} value={value} index={2}>
          {saves.filter(x => { return x.lti_id }).length !== 0
            ? <>
              {saves.filter(x => { return x.lti_id }).map(
                (sch) => {
                  return (
                    <Grid item xs={12} sm={6} lg={3} key={sch.save_id}>
                      <SchematicCard sch={sch} />
                    </Grid>
                  )
                }
              )}
            </>
            : <Grid item xs={12}>
              <Card style={{ padding: '7px 15px' }} className={classes.mainHead}>
                <Typography variant='subtitle1' gutterBottom>
                  Hey {auth.user.username} , You dont have any saved projects...
                </Typography>
              </Card>
            </Grid>
          }
        </TabPanel>

        <TabPanel style={{ width: '100%' }} value={value} index={3}>
          {saves.filter(x => { return x.is_submission }).length !== 0
            ? <>
              {saves.filter(x => { return x.is_submission }).map(
                (sch) => {
                  return (
                    <Grid item xs={12} sm={6} lg={3} key={sch.save_id}>
                      <SchematicCard sch={sch} />
                    </Grid>
                  )
                }
              )}
            </>
            : <Grid item xs={12}>
              <Card style={{ padding: '7px 15px' }} className={classes.mainHead}>
                <Typography variant='subtitle1' gutterBottom>
                  Hey {auth.user.username} , You dont have any saved projects...
                </Typography>
              </Card>
            </Grid>
          }
        </TabPanel>

      </Grid>
    </>
  )
}

SchematicsList.propTypes = {
  ltiDetails: PropTypes.string
}
