/**
 * @file CircuitCard.js
 * @description A MUI v4 Card that displays a single saved circuit from the
 * /api/save/list response. Provides Open, Pin/Unpin, and Delete actions.
 *
 * Props:
 *   sch        {object}   - A single save object from state.dashboardReducer.schematics
 *   onRefresh  {Function} - Called after any mutating action (pin, delete) to
 *                           trigger a re-fetch in the parent.
 *
 * All MUI imports use v4 (@material-ui/core / @material-ui/icons).
 * No sx prop — makeStyles only, consistent with the rest of the project.
 */
import React from 'react'
import PropTypes from 'prop-types'
import {
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Typography,
  Button,
  Chip,
  Tooltip,
  Snackbar
} from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import { makeStyles } from '@material-ui/core/styles'
import DeleteIcon from '@material-ui/icons/Delete'
import StarIcon from '@material-ui/icons/Star'
import StarBorderIcon from '@material-ui/icons/StarBorder'
import OpenInBrowserIcon from '@material-ui/icons/OpenInBrowser'
import { Link as RouterLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { deleteSchematic, togglePinSave } from '../../redux/actions/index'

// ── Styles ────────────────────────────────────────────────────────────────────
const useStyles = makeStyles((theme) => ({
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    borderRadius: 8,
    transition: 'box-shadow 0.2s ease',
    '&:hover': {
      boxShadow: '0 6px 20px rgba(0,0,0,0.15)'
    }
  },
  // Thumbnail — 16:9 aspect ratio. Grey background shown when image is absent.
  mediaWrapper: {
    position: 'relative'
  },
  media: {
    height: 0,
    paddingTop: '56.25%', // 16:9
    backgroundColor: '#bdbdbd'
  },
  pinnedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.palette.primary.main,
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 4,
    pointerEvents: 'none'
  },
  cardContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing(1)
  },
  name: {
    fontWeight: 600,
    fontSize: '0.95rem',
    marginBottom: theme.spacing(0.5),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  meta: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.25)
  },
  tagsRow: {
    marginTop: theme.spacing(0.5),
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px'
  },
  cardActions: {
    justifyContent: 'flex-start',
    padding: theme.spacing(0.5, 1, 1),
    flexWrap: 'wrap',
    gap: '4px'
  },
  deleteBtn: {
    color: theme.palette.error.main,
    borderColor: theme.palette.error.light,
    marginLeft: 'auto'
  }
}))

// ── Relative-time helper ──────────────────────────────────────────────────────
// Pure JS, no extra package. Copied from SchematicCard.js for consistency.
function timeSince (jsonDate) {
  const date = new Date(jsonDate)
  const seconds = Math.floor((new Date() - date) / 1000)
  let interval = Math.floor(seconds / 31536000)
  if (interval > 1) return interval + ' years'
  interval = Math.floor(seconds / 2592000)
  if (interval > 1) return interval + ' months'
  interval = Math.floor(seconds / 86400)
  if (interval > 1) return interval + ' days'
  interval = Math.floor(seconds / 3600)
  if (interval > 1) return interval + ' hours'
  interval = Math.floor(seconds / 60)
  if (interval > 1) return interval + ' minutes'
  return Math.floor(seconds) + ' seconds'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CircuitCard ({ sch, onRefresh }) {
  const classes = useStyles()
  const dispatch = useDispatch()
  const auth = useSelector(state => state.authReducer)
  const [snackOpen, setSnackOpen] = React.useState(false)

  // Treat missing / null pinned as false (backwards-compat with old records)
  const isPinned = sch.pinned === true

  // Editor URL — exact same pattern as SchematicCard.js
  const editorPath = sch.lti_id
    ? `/editor?id=${sch.save_id}&version=${sch.version}&lti_id=${sch.lti_id}&branch=${sch.branch}`
    : `/editor?id=${sch.save_id}&version=${sch.version}&branch=${sch.branch}`

  // ── Action handlers ───────────────────────────────────────────────────────

  const hasToken = () => auth.token || localStorage.getItem('esim_auth_token')

  const handlePin = () => {
    if (!hasToken()) {
      setSnackOpen(true)
      return
    }
    Promise.resolve(dispatch(togglePinSave(sch.save_id, sch.version, sch.branch, !isPinned)))
      .then(() => { if (onRefresh) onRefresh() })
      .catch((err) => console.error(err))
  }

  const handleDelete = () => {
    if (!hasToken()) {
      setSnackOpen(true)
      return
    }
    if (window.confirm(`Delete "${sch.name || sch.save_id}"? This cannot be undone.`)) {
      Promise.resolve(dispatch(deleteSchematic(sch.save_id)))
        .then(() => { if (onRefresh) onRefresh() })
        .catch((err) => console.error(err))
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className={classes.card} variant='outlined'>

      {/* Thumbnail — grey box fallback when base64_image is null/empty */}
      <div className={classes.mediaWrapper}>
        <CardMedia
          className={classes.media}
          image={(sch.base64_image && !sch.base64_image.endsWith('.None')) ? sch.base64_image : undefined}
          title={sch.name || 'Circuit'}
        />
        {isPinned && (
          <span className={classes.pinnedBadge}>★ Pinned</span>
        )}
      </div>

      {/* Card body */}
      <CardContent className={classes.cardContent}>
        <Typography
          className={classes.name}
          title={sch.name || String(sch.save_id)}
        >
          {sch.name || String(sch.save_id).slice(0, 8) + '…'}
        </Typography>

        {/* Branch / version */}
        {(sch.branch || sch.version) && (
          <Typography className={classes.meta}>
            {[sch.branch, sch.version].filter(Boolean).join(' · ')}
          </Typography>
        )}

        {/* Last modified — relative time, no package */}
        <Typography className={classes.meta}>
          Updated {timeSince(sch.save_time)} ago
        </Typography>

        {/* Tags */}
        <div className={classes.tagsRow}>
          {sch.shared && (
            <Chip size='small' label='Shared' color='primary' variant='outlined' />
          )}
          {sch.project_id && (
            <Chip size='small' label='Project' variant='outlined' />
          )}
          {sch.lti_id && (
            <Chip size='small' label='LTI' variant='outlined' />
          )}
        </div>
      </CardContent>

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <CardActions className={classes.cardActions} disableSpacing>

        {/* Open — navigates to the editor with this circuit loaded */}
        <Tooltip title='Open in editor' arrow>
          <Button
            size='small'
            variant='contained'
            color='primary'
            startIcon={<OpenInBrowserIcon />}
            component={RouterLink}
            to={editorPath}
          >
            Open
          </Button>
        </Tooltip>

        {/* Pin / Unpin */}
        <Tooltip title={isPinned ? 'Unpin from top' : 'Pin to top'} arrow>
          <Button
            size='small'
            variant='outlined'
            color={isPinned ? 'primary' : 'default'}
            startIcon={isPinned ? <StarIcon /> : <StarBorderIcon />}
            onClick={handlePin}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </Button>
        </Tooltip>

        {/* Delete */}
        <Tooltip title='Delete circuit' arrow>
          <Button
            className={classes.deleteBtn}
            size='small'
            variant='outlined'
            startIcon={<DeleteIcon />}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Tooltip>

      </CardActions>

      {/* ── Snackbar for auth warning ──────────────────────────────────────── */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackOpen(false)} severity="warning">
          Login required to manage circuits.
        </Alert>
      </Snackbar>
    </Card>
  )
}

CircuitCard.propTypes = {
  /** A single schematic object from state.dashboardReducer.schematics */
  sch: PropTypes.object.isRequired,
  /**
   * Callback invoked after a pin/unpin or delete action.
   * The parent uses this to re-fetch the circuit list.
   */
  onRefresh: PropTypes.func
}
