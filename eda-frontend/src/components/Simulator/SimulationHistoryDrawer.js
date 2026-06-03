/**
 * SimulationHistoryDrawer
 *
 * A MUI v4 Drawer (anchored right, width 380 px) that lists past simulation
 * runs stored locally in localStorage via utils/simulationHistory.js.
 *
 * ── Design decisions ────────────────────────────────────────────────────────
 *  • No backend API calls — works for ALL users without login.
 *  • No auth check — no "Login to view history" message ever shown.
 *  • History is read from localStorage on every open so it is always fresh.
 *  • "Clear History" button at the bottom empties both localStorage and state.
 *
 * Props:
 *   open           {boolean}  — controls drawer visibility
 *   onClose        {function} — called to close the drawer
 *   onSelectResult {function} — called with the full history entry on row click
 */
import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Drawer from '@material-ui/core/Drawer'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import Typography from '@material-ui/core/Typography'
import IconButton from '@material-ui/core/IconButton'
import Button from '@material-ui/core/Button'
import Divider from '@material-ui/core/Divider'
import CloseIcon from '@material-ui/icons/Close'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import ErrorIcon from '@material-ui/icons/Error'
import HistoryIcon from '@material-ui/icons/History'
import { makeStyles } from '@material-ui/core/styles'
import { getSimulationHistory, clearSimulationHistory } from '../../utils/simulationHistory'

// ── Constants ────────────────────────────────────────────────────────────────
const DRAWER_WIDTH = 380

// ── Styles ───────────────────────────────────────────────────────────────────
const useStyles = makeStyles((theme) => ({
  drawerPaper: {
    width: DRAWER_WIDTH,
    [theme.breakpoints.down('xs')]: {
      width: '100vw'
    },
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    flexShrink: 0
  },

  headerTitle: {
    display: 'flex',
    alignItems: 'center'
  },

  headerIcon: {
    marginRight: theme.spacing(0.75),
    verticalAlign: 'middle'
  },

  body: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(1)
  },

  emptyBox: {
    padding: theme.spacing(4, 2),
    textAlign: 'center'
  },

  listItem: {
    borderRadius: theme.shape.borderRadius,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover
    }
  },

  successIcon: {
    color: theme.palette.success
      ? theme.palette.success.main
      : theme.palette.primary.main
  },

  failureIcon: {
    color: theme.palette.error.main
  },

  simType: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic'
  },

  footer: {
    borderTop: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1, 2),
    flexShrink: 0
  }
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable date/time string.
 * Example: "28 May 2026, 3:42 PM"
 */
function formatDateTime (isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  } catch (_) {
    return isoString
  }
}

/**
 * Maps the raw simulationType string to a readable label.
 */
function formatSimType (simType) {
  const map = {
    DcSolver: 'DC Solver',
    DcSweep: 'DC Sweep',
    Transient: 'Transient',
    Ac: 'AC Analysis',
    tfAnalysis: 'Transfer Function',
    noiseAnalysis: 'Noise Analysis',
    NgSpiceSimulator: 'NgSpice'
  }
  return (simType && map[simType]) ? map[simType] : (simType || 'Unknown')
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SimulationHistoryDrawer ({ open, onClose, onSelectResult }) {
  const classes = useStyles()

  /** Local copy of localStorage history — refreshed on every open. */
  const [history, setHistory] = useState([])

  // Reload history from localStorage every time the drawer opens.
  useEffect(() => {
    if (open) {
      setHistory(getSimulationHistory())
    }
  }, [open])

  /** Clear all history from localStorage and reset local state. */
  const handleClearHistory = () => {
    clearSimulationHistory()
    setHistory([])
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      ModalProps={{ keepMounted: true }}
      classes={{ paper: classes.drawerPaper }}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className={classes.header}>
        <div className={classes.headerTitle}>
          <HistoryIcon className={classes.headerIcon} fontSize="small" />
          <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
            Simulation History
          </Typography>
        </div>
        <IconButton
          aria-label="Close simulation history drawer"
          onClick={onClose}
          size="small"
          style={{ color: 'inherit' }}
        >
          <CloseIcon />
        </IconButton>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className={classes.body}>
        {history.length === 0
          ? (
            <div className={classes.emptyBox}>
              <Typography variant="body2" color="textSecondary">
                No simulation history yet. Run a simulation to see it here.
              </Typography>
            </div>
            )
          : (
            <List disablePadding>
              {history.map((entry, idx) => (
                <React.Fragment key={entry.id || idx}>
                  <ListItem
                    className={classes.listItem}
                    button
                    onClick={() => {
                      if (typeof onSelectResult === 'function') {
                        onSelectResult(entry)
                      }
                      onClose()
                    }}
                    aria-label={`Simulation run on ${formatDateTime(entry.timestamp)}`}
                  >
                    {/* Success / failure icon */}
                    <ListItemIcon>
                      {entry.success
                        ? (
                          <CheckCircleIcon
                            className={classes.successIcon}
                            titleAccess="Simulation succeeded"
                          />
                          )
                        : (
                          <ErrorIcon
                            className={classes.failureIcon}
                            titleAccess="Simulation failed"
                          />
                          )}
                    </ListItemIcon>

                    {/* Date + simulation type */}
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          {formatDateTime(entry.timestamp)}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" className={classes.simType}>
                          {formatSimType(entry.simulationType)}
                          {!entry.success ? ' — failed' : ''}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {idx < history.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
            )}
      </div>

      {/* ── Footer — Clear History ─────────────────────────────────────── */}
      {history.length > 0 && (
        <div className={classes.footer}>
          <Button
            id="sim-history-clear-btn"
            variant="outlined"
            color="secondary"
            size="small"
            fullWidth
            onClick={handleClearHistory}
          >
            Clear History
          </Button>
        </div>
      )}
    </Drawer>
  )
}

SimulationHistoryDrawer.propTypes = {
  /** Controls whether the drawer is open. */
  open: PropTypes.bool.isRequired,
  /** Called to request that the drawer be closed. */
  onClose: PropTypes.func.isRequired,
  /**
   * Called with the full history entry object when the user clicks a row.
   * Entry shape: { id, timestamp, success, simulationType, result, errorHelp, netlist }
   */
  onSelectResult: PropTypes.func
}

SimulationHistoryDrawer.defaultProps = {
  onSelectResult: null
}
