import React from 'react'
import PropTypes from 'prop-types'
import { Drawer, Hidden, IconButton } from '@material-ui/core'
import HighlightOffIcon from '@material-ui/icons/HighlightOff'
import ResizerHandle from '../Shared/ResizerHandle'
import { makeStyles } from '@material-ui/core/styles'

const drawerWidth = 250

const useStyles = makeStyles((theme) => ({
  drawer: {
    [theme.breakpoints.up('lg')]: {
      flexShrink: 0
    }
  },
  drawerPaper: {
    height: '100vh',
    overflowY: 'auto'
  }
}))

// Editor right side pane to display grid and component properties.
export default function RightSidebar ({ window, mobileOpen, mobileClose, children }) {
  const classes = useStyles()
  const [width, setWidth] = React.useState(drawerWidth)
  const isResizing = React.useRef(false)

  const handleMouseDown = (e) => {
    e.preventDefault()
    isResizing.current = true
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = React.useCallback((e) => {
    if (!isResizing.current) return
    // Calculate new width: window.innerWidth - mouse X position
    let newWidth = document.body.clientWidth - e.clientX
    if (newWidth < 150) newWidth = 150
    if (newWidth > 600) newWidth = 600
    setWidth(newWidth)
  }, [])

  const handleMouseUp = React.useCallback(() => {
    isResizing.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const container =
    window !== undefined ? () => window().document.body : undefined

  return (
    <>
      <nav className={classes.drawer} style={{ width: width }} aria-label="mailbox folders">
        <Hidden xlUp implementation="css">
          <Drawer
            container={container}
            variant="temporary"
            open={mobileOpen}
            anchor="right"
            onClose={mobileClose}
            classes={{
              paper: classes.drawerPaper
            }}
            PaperProps={{ style: { width: width } }}
            ModalProps={{
              keepMounted: true // Better open performance on mobile.
            }}
          >
            <IconButton
              onClick={mobileClose}
              color="inherit"
              style={{ marginRight: '190px' }}
            >
              <HighlightOffIcon />
            </IconButton>
            {children}
          </Drawer>
        </Hidden>

        <Hidden mdDown implementation="css">
          <Drawer
            classes={{
              paper: classes.drawerPaper
            }}
            PaperProps={{ style: { width: width } }}
            anchor="right"
            variant="permanent"
            open
          >
            <ResizerHandle onMouseDown={handleMouseDown} position="left" />
            {children}
          </Drawer>
        </Hidden>
      </nav>
    </>
  )
}

RightSidebar.propTypes = {
  window: PropTypes.object,
  mobileOpen: PropTypes.bool.isRequired,
  mobileClose: PropTypes.func.isRequired,
  children: PropTypes.element
}
