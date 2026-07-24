import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  List, ListItemText, Tooltip, Popover,
  Button, Snackbar, IconButton
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import CloseIcon from '@material-ui/icons/Close'
import StarIcon from '@material-ui/icons/Star'
import StarBorderIcon from '@material-ui/icons/StarBorder'

import './Helper/SchematicEditor.css'
import { AddComponent } from './Helper/SideBar.js'
import { prefetchSvg } from './Helper/SvgParser.js'
import { addFavourite, removeFavourite, isFavourite } from '../../utils/favouritesStorage'

const useStyles = makeStyles((theme) => ({
  popupInfo: {
    margin: theme.spacing(1.5),
    padding: theme.spacing(1.5),
    border: '1px solid blue',
    borderRadius: '5px'
  },
  compWrapper: {
    position: 'relative',
    display: 'inline-block'
  },
  starBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 2,
    zIndex: 2,
    background: 'rgba(255,255,255,0.75)',
    borderRadius: '50%',
    '&:hover': {
      background: 'rgba(255,255,255,0.95)'
    }
  },
  starIconOn: {
    fontSize: 14,
    color: '#f4b400'
  },
  starIconOff: {
    fontSize: 14,
    color: '#9e9e9e'
  }
}))

// ─── localStorage-backed favourites — no auth required ───────────────────────
export default function SideComp ({ favourite, setFavourite, component }) {
  const classes = useStyles()
  const imageRef = useRef(null)

  const [anchorEl, setAnchorEl] = React.useState(null)
  const [snackbar, setSnackbar] = React.useState({ open: false, message: '' })

  // Local starred state so the star icon updates immediately on click
  // without waiting for a parent re-render cycle.
  const [starred, setStarred] = useState(() => isFavourite(component.id))

  // Keep local starred state in sync when the parent `favourite` array changes
  // (e.g. another SideComp instance adds/removes a favourite).
  useEffect(() => {
    if (favourite && Array.isArray(favourite)) {
      setStarred(favourite.some((fav) => fav.id === component.id))
    } else {
      setStarred(isFavourite(component.id))
    }
  // eslint-disable-next-line
  }, [favourite])

  const showSnackbar = (message) => setSnackbar({ open: true, message })
  const closeSnackbar = (_, reason) => {
    if (reason === 'clickaway') return
    setSnackbar((s) => ({ ...s, open: false }))
  }

  const handleClick = (event) => setAnchorEl(event.currentTarget)
  const handleClose = () => setAnchorEl(null)

  const open = Boolean(anchorEl)
  const id = open ? 'simple-popover' : undefined

  useEffect(() => {
    // Pre-fetch SVG data so first drag is instant (no network wait)
    prefetchSvg(component)
    // Make component thumbnail draggable onto the mxGraph canvas
    AddComponent(component, imageRef.current)
    // eslint-disable-next-line
  }, [])

  // ── localStorage-backed add — no backend API, no auth required ──────────────
  const handleAddFavourite = () => {
    const updated = addFavourite(component)
    setStarred(true)                    // update local icon immediately
    if (setFavourite) setFavourite(updated)  // update parent state if available
    showSnackbar('Added to favourites')
    setAnchorEl(null)
  }

  // ── localStorage-backed remove — no backend API, no auth required ────────────
  const handleRemoveFavourite = () => {
    const updated = removeFavourite(component.id)
    setStarred(false)                   // update local icon immediately
    if (setFavourite) setFavourite(updated)  // update parent state if available
    showSnackbar('Removed from favourites')
    setAnchorEl(null)
  }

  // One-click star toggle — works for ALL users, no auth check needed.
  const handleStarToggle = (e) => {
    e.stopPropagation()
    if (starred) {
      handleRemoveFavourite()
    } else {
      handleAddFavourite()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {/* Wrapper gives the star IconButton an absolute-position anchor */}
        <div className={classes.compWrapper}>
          <Tooltip title={component.full_name + ' : ' + component.description} arrow>
            {/* Display Image thumbnail; also the drag source registered by AddComponent */}
            <img
              ref={imageRef}
              className='compImage'
              src={'../' + (component.svg_path || '')}
              alt={component.name || 'component'}
              aria-describedby={id}
              onClick={handleClick}
              onError={(e) => { e.target.style.visibility = 'hidden' }}
            />
          </Tooltip>

          {/* Star icon overlay — shown for ALL users, no auth required */}
          <Tooltip title={starred ? 'Remove from favourites' : 'Add to favourites'} arrow>
            <IconButton
              className={classes.starBtn}
              size="small"
              onClick={handleStarToggle}
              aria-label={
                starred
                  ? `Remove ${component.name} from favourites`
                  : `Add ${component.name} to favourites`
              }
            >
              {starred
                ? <StarIcon className={classes.starIconOn} />
                : <StarBorderIcon className={classes.starIconOff} />}
            </IconButton>
          </Tooltip>
        </div>

        <span style={{ fontSize: '11px', textAlign: 'center', marginTop: '4px', color: '#555', wordBreak: 'break-word', lineHeight: '1.2' }}>
          {component.name}
        </span>
      </div>

      {/* Popover — shows component details on thumbnail click */}
      <Popover
        id={id}
        open={open}
        className={classes.popup}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <List component="div" className={classes.popupInfo} disablePadding dense>
          <ListItemText>
            <b>Component Name:</b> {component.name}
          </ListItemText>

          {component.description !== '' &&
            <ListItemText>
              <b>Description:</b> {component.description}
            </ListItemText>
          }

          {component.keyword !== '' &&
            <ListItemText>
              <b>Keywords:</b> {component.keyword}
            </ListItemText>
          }

          {component.data_link !== '' &&
            <ListItemText>
              <b>Datasheet:</b>{' '}
              <a href={component.data_link} rel="noopener noreferrer" target="_blank">
                {component.data_link}
              </a>
            </ListItemText>
          }

          {/* Add / Remove from Favourites buttons — no auth required */}
          {!starred &&
            <ListItemText>
              <Button onClick={handleAddFavourite}>
                Add to Favourites
              </Button>
            </ListItemText>
          }

          {starred &&
            <ListItemText>
              <Button onClick={handleRemoveFavourite}>
                Remove from Favourites
              </Button>
            </ListItemText>
          }
        </List>
      </Popover>

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
    </div>
  )
}

SideComp.propTypes = {
  component: PropTypes.object.isRequired,
  setFavourite: PropTypes.func,
  favourite: PropTypes.array
}
