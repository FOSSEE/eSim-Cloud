/**
 * @file TemplateWizard.js
 * @description A MUI v4 Dialog that lets the user pick a starting circuit template
 * when they open the Schematic Editor without an existing save ID in the URL.
 *
 * Template loading strategy:
 *   PATH A — gallery_save_id is non-null:
 *     Dispatch fetchGallerySchematic(id), which calls `save/gallery/<id>` and
 *     passes data_dump to renderGalleryXML, populating the mxGraph canvas.
 *
 *   PATH B — gallery_save_id is null (ALL templates as of this writing):
 *     1. Dispatch setNetlist(fallback_netlist) so the Netlist Preview panel in
 *        the right sidebar immediately shows the circuit netlist to the user.
 *        This is the VISIBLE effect — the user sees the netlist in the panel.
 *     2. Store the netlist in localStorage('esim_pending_netlist') as a bridge
 *        for any future netlist-to-mxGraph importer.
 *     3. Fire CustomEvent('esim_load_netlist') for any future listener.
 *
 * NOTE: No netlist-to-mxGraph importer exists in the codebase. renderGalleryXML
 * expects mxGraph XML, not raw ngspice netlists. The visual canvas stays blank
 * for fallback templates. The Netlist Preview panel IS populated (Path B step 1).
 */

import React, { useState, useRef, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Slide from '@material-ui/core/Slide'

// ── MUI v4 imports (NOT @mui/material) ────────────────────────────────────────
import Dialog from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'
import DialogContent from '@material-ui/core/DialogContent'
import DialogActions from '@material-ui/core/DialogActions'
import Button from '@material-ui/core/Button'
import Card from '@material-ui/core/Card'
import CardHeader from '@material-ui/core/CardHeader'
import CardContent from '@material-ui/core/CardContent'
import CardActions from '@material-ui/core/CardActions'
import Grid from '@material-ui/core/Grid'
import Typography from '@material-ui/core/Typography'
import Avatar from '@material-ui/core/Avatar'
import CircularProgress from '@material-ui/core/CircularProgress'
import Snackbar from '@material-ui/core/Snackbar'
import SnackbarContent from '@material-ui/core/SnackbarContent'
import { makeStyles } from '@material-ui/core/styles'

// ── MUI v4 Icons ───────────────────────────────────────────────────────────────
import MemoryIcon from '@material-ui/icons/Memory'
import FilterListIcon from '@material-ui/icons/FilterList'
import FlashOnIcon from '@material-ui/icons/FlashOn'
import OfflineBoltIcon from '@material-ui/icons/OfflineBolt'
import LensIcon from '@material-ui/icons/Lens'
import DeviceHubIcon from '@material-ui/icons/DeviceHub'
import ErrorIcon from '@material-ui/icons/Error'

// ── Redux actions ──────────────────────────────────────────────────────────────
import { fetchGallerySchematic } from '../../redux/actions/index'
import { setNetlist } from '../../redux/actions/netlistActions'

// ── Template config ────────────────────────────────────────────────────────────
import templates from '../../config/templates.json'

// ── Slide-up transition — matches all other Dialogs in ToolbarExtension.js ────
const Transition = React.forwardRef(function Transition (props, ref) {
  return <Slide direction='up' ref={ref} {...props} />
})

// ── Category colour map ────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Basic: '#4CAF50',
  Filter: '#2196F3',
  Amplifier: '#9C27B0',
  Power: '#FF9800'
}

/**
 * Picks a suitable MUI Icon component for a given template id.
 * @param {string} id - Template id from templates.json
 * @returns {React.ComponentType} - A MUI v4 icon component
 */
function iconForTemplate (id) {
  const map = {
    'rc-filter': FilterListIcon,
    'voltage-divider': FlashOnIcon,
    'common-emitter-amplifier': MemoryIcon,
    'half-wave-rectifier': OfflineBoltIcon,
    'led-current-limiting': LensIcon,
    'rl-circuit': DeviceHubIcon
  }
  return map[id] || MemoryIcon
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const useStyles = makeStyles((theme) => ({
  dialogTitle: {
    paddingBottom: theme.spacing(0.5)
  },
  subtitle: {
    paddingLeft: theme.spacing(3),
    paddingBottom: theme.spacing(2),
    color: theme.palette.text.secondary
  },
  // dialogContent gets overflowY:auto so tall card lists scroll inside the dialog
  // instead of the dialog overflowing the viewport on small screens.
  dialogContent: {
    overflowY: 'auto'
  },
  cardRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    '&:hover': {
      transform: 'scale(1.03)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)'
    },
    // Keyboard focus ring — important for tabIndex={0} + role="button" cards
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2
    }
  },
  cardDisabled: {
    opacity: 0.55,
    pointerEvents: 'none'
  },
  avatarWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: theme.spacing(2.5),
    paddingBottom: theme.spacing(0.5)
  },
  avatar: {
    width: 56,
    height: 56
  },
  cardHeader: {
    paddingTop: theme.spacing(1),
    paddingBottom: 0,
    '& .MuiCardHeader-title': {
      fontSize: '0.95rem',
      fontWeight: 600
    }
  },
  // flex: 1 ensures all cards in a row stretch to equal height regardless of
  // description text length (Task 3 — equal height requirement).
  cardContent: {
    flexGrow: 1,
    flex: 1,
    paddingTop: theme.spacing(0.5)
  },
  descriptionText: {
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.4
  },
  categoryChip: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    borderRadius: 4,
    color: '#fff',
    display: 'inline-block'
  },
  cardActions: {
    justifyContent: 'flex-end',
    padding: theme.spacing(1, 2, 1.5)
  },
  loadingButton: {
    position: 'relative'
  },
  buttonProgress: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -12
  },
  errorSnackbar: {
    backgroundColor: theme.palette.error.dark
  },
  errorIcon: {
    marginRight: theme.spacing(1),
    verticalAlign: 'middle'
  },
  errorMessage: {
    display: 'flex',
    alignItems: 'center'
  },
  skipButton: {
    marginRight: theme.spacing(1)
  }
}))

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * TemplateWizard — full-width MUI v4 Dialog showing 6 circuit template cards.
 *
 * @param {object}   props
 * @param {boolean}  props.open             - Whether the dialog is visible.
 * @param {Function} props.onClose          - Called when the user dismisses the
 *                                            dialog (Skip) or after an error.
 *                                            Always sets the localStorage flag.
 * @param {Function} props.onTemplateSelect - Called with the full template object
 *                                            after the template has been loaded.
 * @param {boolean}  [props.clearCanvasFirst=false] - Passed through by
 *                                            SchematiEditor; not used internally
 *                                            by this component — handled by parent.
 * @returns {JSX.Element}
 */
export default function TemplateWizard ({ open, onClose, onTemplateSelect }) {
  const classes = useStyles()
  const dispatch = useDispatch()

  /** Id of the template currently being loaded, or null if none. */
  const [loadingId, setLoadingId] = useState(null)

  /** Controls the error snackbar visibility. */
  const [snackOpen, setSnackOpen] = useState(false)

  // ── Mounted guard — prevents setState on unmounted component ─────────────────
  // The 350ms spinner delay in PATH B means onClose() unmounts this component
  // before the finally block runs. Without this guard React warns:
  // "Can't perform a React state update on an unmounted component".
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /**
   * PATH B: fallback_netlist loading.
   *
   * What the user SEES:
   *   - The Netlist Preview panel in the right sidebar is immediately populated
   *     via Redux (setNetlist dispatch). The user can copy/download/simulate it.
   *   - The mxGraph canvas stays blank — no netlist-to-mxGraph importer exists.
   *
   * Additional side effects (for future importers):
   *   - localStorage['esim_pending_netlist'] stores the raw netlist text.
   *   - window CustomEvent 'esim_load_netlist' is fired for any future listener.
   *
   * @param {string} netlist - Raw ngspice netlist string from templates.json.
   */
  function loadFallbackNetlist (netlist) {
    console.log('[TemplateWizard] loadFallbackNetlist called with netlist:', netlist?.substring(0, 50))
    // PRIMARY: populate the Netlist Preview panel immediately via Redux
    dispatch(setNetlist(netlist))
    console.log('[TemplateWizard] dispatch(setNetlist) completed')

    // SECONDARY: bridge for future netlist-to-canvas importer
    localStorage.setItem('esim_pending_netlist', netlist)
    window.dispatchEvent(new CustomEvent('esim_load_netlist', {
      detail: { netlist }
    }))
  }

  /**
   * Handles "Use Template" click.
   * PATH A — gallery_save_id set: await fetchGallerySchematic (renders canvas).
   * PATH B — gallery_save_id null: loadFallbackNetlist (populates Netlist panel).
   *
   * @param {object} template - A single template object from templates.json.
   */
  async function handleTemplateClick (template) {
    console.log('[TemplateWizard] handleTemplateClick called for:', template.title)
    setLoadingId(template.id)

    try {
      let loaded = false

      // ── PATH A: gallery API ────────────────────────────────────────────────
      if (template.gallery_save_id !== null) {
        try {
          await new Promise((resolve, reject) => {
            try {
              const result = dispatch(fetchGallerySchematic(template.gallery_save_id))
              if (result && typeof result.then === 'function') {
                result.then(resolve).catch(reject)
              } else {
                resolve()
              }
            } catch (err) {
              reject(err)
            }
          })
          loaded = true
        } catch (galleryErr) {
          console.warn(
            '[TemplateWizard] Gallery fetch failed, falling back to netlist:',
            galleryErr
          )
        }
      }

      // ── PATH B: fallback_netlist ───────────────────────────────────────────
      // All 6 templates currently have gallery_save_id = null, so this always runs.
      // After this call the Netlist Preview panel is populated via Redux.
      if (!loaded) {
        // Minimum visible delay so the loading spinner is actually seen by the user.
        // Without this delay, the synchronous fallback path runs so fast that React
        // never paints the loading state before the finally block resets it.
        await new Promise((resolve) => setTimeout(resolve, 350))
        loadFallbackNetlist(template.fallback_netlist)
      }

      // Notify parent, then close.  Order matters: parent's handleTemplateSelect
      // may call ClearGrid() before handleWizardClose() — do not flip.
      onTemplateSelect(template)
      onClose()
    } catch (err) {
      console.error('[TemplateWizard] ERROR in handleTemplateClick:', err)
      if (isMountedRef.current) { setSnackOpen(true) }
      onClose()
    } finally {
      // Always clears the spinner — runs after both success and error paths.
      // Guard required: onClose() above unmounts the component before finally runs
      // (PATH B has a 350ms delay, so the component is already gone by this point).
      if (isMountedRef.current) { setLoadingId(null) }
    }
  }

  /**
   * Keyboard handler for card elements (role="button", tabIndex={0}).
   * Enter or Space activates the same action as clicking "Use Template".
   */
  function handleCardKeyDown (event, template) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!anyLoading) {
        handleTemplateClick(template)
      }
    }
  }

  function handleSnackClose () {
    setSnackOpen(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const anyLoading = loadingId !== null

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth='md'
        fullWidth
        TransitionComponent={Transition}
        keepMounted={false}
        disableScrollLock
        disableEnforceFocus
        aria-labelledby='template-wizard-title'
      >
        {/* ── Dialog header ─────────────────────────────────────────────────── */}
        <DialogTitle id='template-wizard-title' className={classes.dialogTitle}>
          Start from a template
        </DialogTitle>
        <Typography variant='body2' className={classes.subtitle}>
          Pick a starting point for your circuit, or skip to start blank
        </Typography>

        {/* ── Template card grid ────────────────────────────────────────────── */}
        {/* overflowY:auto prevents dialog overflow on small viewports (Task 3) */}
        <DialogContent dividers className={classes.dialogContent}>
          <Grid container spacing={2}>
            {templates.map((template) => {
              const IconComponent = iconForTemplate(template.id)
              const avatarColor = CATEGORY_COLORS[template.category] || '#607D8B'
              const isThisLoading = loadingId === template.id

              return (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={4}
                  key={template.id}
                >
                  {/*
                   * role="button" + tabIndex={0}: keyboard users can Tab to each
                   * card and press Enter/Space to select it (Task 2).
                   * The card's focus style is set in cardRoot['&:focus'] above.
                   */}
                  <Card
                    variant='outlined'
                    role='button'
                    tabIndex={anyLoading && !isThisLoading ? -1 : 0}
                    aria-label={`Use template: ${template.title}`}
                    aria-disabled={anyLoading && !isThisLoading}
                    className={[
                      classes.cardRoot,
                      anyLoading && !isThisLoading ? classes.cardDisabled : ''
                    ].join(' ')}
                    onKeyDown={(e) => handleCardKeyDown(e, template)}
                  >
                    {/* Coloured icon area */}
                    <div className={classes.avatarWrapper}>
                      <Avatar
                        className={classes.avatar}
                        style={{ backgroundColor: avatarColor }}
                      >
                        <IconComponent style={{ fontSize: 30 }} />
                      </Avatar>
                    </div>

                    {/* Category badge */}
                    <div style={{ paddingLeft: 16, paddingTop: 8 }}>
                      <span
                        className={classes.categoryChip}
                        style={{ backgroundColor: avatarColor }}
                      >
                        {template.category}
                      </span>
                    </div>

                    {/* Title */}
                    <CardHeader
                      className={classes.cardHeader}
                      title={template.title}
                      disableTypography={false}
                    />

                    {/* Description — flex:1 ensures equal card height in a row */}
                    <CardContent className={classes.cardContent}>
                      <Typography
                        variant='body2'
                        className={classes.descriptionText}
                      >
                        {template.description}
                      </Typography>
                    </CardContent>

                    {/* "Use Template" button */}
                    <CardActions className={classes.cardActions}>
                      <div className={classes.loadingButton}>
                        <Button
                          size='small'
                          variant='contained'
                          color='primary'
                          disabled={anyLoading}
                          onClick={() => handleTemplateClick(template)}
                          aria-label={`Load template: ${template.title}`}
                        >
                          {isThisLoading ? 'Loading…' : 'Use Template'}
                        </Button>
                        {isThisLoading && (
                          <CircularProgress
                            size={24}
                            className={classes.buttonProgress}
                          />
                        )}
                      </div>
                    </CardActions>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        </DialogContent>

        {/* ── Skip button ───────────────────────────────────────────────────── */}
        {/*
         * autoFocus: when the dialog opens, Skip receives focus first so keyboard
         * users immediately have a visible way to dismiss without selecting a
         * template (Task 2 — "Skip must be the first focusable element").
         */}
        <DialogActions>
          <Button
            autoFocus
            onClick={onClose}
            color='default'
            className={classes.skipButton}
            disabled={anyLoading}
          >
            Skip — Start Blank
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Error snackbar ────────────────────────────────────────────────────── */}
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={snackOpen}
        autoHideDuration={5000}
        onClose={handleSnackClose}
      >
        <SnackbarContent
          className={classes.errorSnackbar}
          message={
            <span className={classes.errorMessage}>
              <ErrorIcon className={classes.errorIcon} fontSize='small' />
              Failed to load template. Starting blank instead.
            </span>
          }
        />
      </Snackbar>
    </>
  )
}
