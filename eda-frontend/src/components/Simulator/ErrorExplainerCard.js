/**
 * @fileoverview ErrorExplainerCard — displays a friendly breakdown of a failed
 * ngspice simulation error: a one-line summary, actionable hints, and
 * collapsible technical details (raw error codes). Optionally surfaces an
 * "Ask AI About This Error" button that triggers the AI chat panel via a
 * window CustomEvent.
 */
import React from 'react'
import PropTypes from 'prop-types'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import Typography from '@material-ui/core/Typography'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import Button from '@material-ui/core/Button'
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline'
import {
  ExpansionPanel,
  ExpansionPanelSummary,
  ExpansionPanelDetails
} from '@material-ui/core'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles((theme) => ({
  /** The outer card has a 4px solid left border using the error palette colour. */
  card: {
    borderLeft: `4px solid ${theme.palette.error.main}`,
    marginBottom: theme.spacing(2),
    backgroundColor: theme.palette.background.paper
  },
  /** Bold summary line at the top of the card. */
  summary: {
    fontWeight: theme.typography.fontWeightBold,
    color: theme.palette.error.dark
  },
  /** Compact list of hints rendered as bullet points. */
  hintList: {
    paddingTop: 0,
    paddingBottom: 0
  },
  /** Each hint entry — tight padding so the list stays compact. */
  hintItem: {
    paddingTop: theme.spacing(0.25),
    paddingBottom: theme.spacing(0.25)
  },
  /** Monospace style for the technical error codes inside the accordion. */
  codeText: {
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '0.8rem'
  },
  /** Expansion panel for technical details — no extra chrome. */
  accordion: {
    boxShadow: 'none',
    backgroundColor: 'transparent',
    '&:before': {
      display: 'none'
    }
  },
  /** Tight padding inside the expanded panel. */
  accordionDetails: {
    display: 'block',
    paddingTop: 0
  },
  /** Container for the "Ask AI" button — aligned to the right. */
  askAiRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: theme.spacing(1)
  }
}))

/**
 * ErrorExplainerCard
 *
 * A Material-UI v4 card that presents a structured breakdown of a failed
 * ngspice simulation.  The backend's `error_help` object is mapped directly
 * to the three props below.
 *
 * @param {object}   props
 * @param {object}   props.errorDetails  — Simulation result object from the backend
 * @param {Function} [props.onAskAI]     — Called when the user clicks "Ask AI About
 *                                         This Error".  If omitted the button is hidden.
 */
export default function ErrorExplainerCard ({ errorDetails, onAskAI }) {
  const classes = useStyles()

  // Gracefully extract error help and raw string
  const errorHelp = errorDetails && errorDetails.error_help
  const summary = errorHelp ? errorHelp.summary : "Simulation failed"
  const hints = errorHelp ? errorHelp.hints : []
  
  // Use raw stderr for technical details if available
  const rawStderr = errorDetails && errorDetails.fail 
    ? errorDetails.fail.replace(/^b'|'$/g, '') 
    : "No technical details available."

  return (
    <Card className={classes.card} variant="outlined">
      <CardContent>
        {/* ── Summary ────────────────────────────────────────────────── */}
        <Typography variant="subtitle1" className={classes.summary} gutterBottom>
          {summary}
        </Typography>

        {/* ── Hints ──────────────────────────────────────────────────── */}
        {hints && hints.length > 0 && (
          <List dense disablePadding className={classes.hintList}>
            {hints.map((hint, idx) => (
              <ListItem key={idx} className={classes.hintItem} disableGutters>
                {/* Unicode bullet prefix keeps dependency count at zero. */}
                <ListItemText primary={`• ${hint}`} />
              </ListItem>
            ))}
          </List>
        )}

        {/* ── Technical details (collapsible) ────────────────────────── */}
        <ExpansionPanel className={classes.accordion} elevation={0}>
          <ExpansionPanelSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="error-technical-details-content"
            id="error-technical-details-header"
          >
            <Typography variant="body2" color="textSecondary">
              Technical Details
            </Typography>
          </ExpansionPanelSummary>
          <ExpansionPanelDetails className={classes.accordionDetails}>
            <Typography
              variant="body2"
              className={classes.codeText}
            >
              {rawStderr}
            </Typography>
          </ExpansionPanelDetails>
        </ExpansionPanel>

        {/* ── Ask AI button (only when callback is provided) ─────────── */}
        {typeof onAskAI === 'function' && (
          <div className={classes.askAiRow}>
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={onAskAI}
            >
              Ask AI About This Error
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

ErrorExplainerCard.propTypes = {
  /** Simulation result object */
  errorDetails: PropTypes.object,
  /**
   * Optional callback fired when the user clicks "Ask AI About This Error".
   * When omitted the button is not rendered at all.
   */
  onAskAI: PropTypes.func
}

ErrorExplainerCard.defaultProps = {
  errorDetails: null
}

