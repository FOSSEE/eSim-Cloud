import React, { useEffect } from 'react'
import { useHistory, useLocation, Link as RouterLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  AppBar,
  Avatar,
  Button,
  Divider,
  Fade,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import logo from '../../static/logo.png'
import store from '../../redux/store'
import { authDefault, loadUser, logout } from '../../redux/actions/index'

const useStyles = makeStyles((theme) => ({
  appBar: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper
  },
  toolbar: {
    minHeight: 60,
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3)
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    color: theme.palette.text.primary,
    marginRight: theme.spacing(4)
  },
  brandLogo: {
    width: 28,
    height: 28,
    marginRight: theme.spacing(1.25)
  },
  brandName: {
    fontWeight: 700,
    fontSize: '1.05rem',
    letterSpacing: '-0.01em'
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    gap: theme.spacing(0.5),
    overflowX: 'auto'
  },
  navLink: {
    padding: theme.spacing(0.75, 1.5),
    borderRadius: theme.shape.borderRadius,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: theme.palette.text.secondary,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background-color 120ms ease, color 120ms ease',
    '&:hover': {
      color: theme.palette.text.primary,
      backgroundColor: '#f1f5f9',
      textDecoration: 'none'
    }
  },
  navLinkActive: {
    color: theme.palette.primary.main,
    backgroundColor: '#eff6ff',
    '&:hover': {
      color: theme.palette.primary.main,
      backgroundColor: '#eff6ff'
    }
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5)
  },
  avatar: {
    width: 32,
    height: 32,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: theme.palette.common.white,
    backgroundColor: theme.palette.primary.main
  },
  menuHeader: {
    pointerEvents: 'none'
  }
}))

const navItems = [
  { label: 'Editor', to: '/editor' },
  { label: 'Simulator', to: '/simulator/ngspice' },
  { label: 'HDL Simulator', to: '/simulator/hdl' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Projects', to: '/projects' }
]

// Common navbar for Dashboard, Home, Simulator, Gallery, etc.
export function Header () {
  const history = useHistory()
  const location = useLocation()
  const classes = useStyles()
  const [anchorEl, setAnchorEl] = React.useState(null)
  const auth = useSelector(state => state.authReducer)
  const dispatch = useDispatch()

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  useEffect(() => {
    function checkUserData () {
      const userToken = localStorage.getItem('esim_auth_token')
      if (userToken && userToken !== '') {
        dispatch(loadUser())
      } else {
        dispatch(authDefault())
      }
    }

    window.addEventListener('storage', checkUserData)

    return () => {
      window.removeEventListener('storage', checkUserData)
    }
  }, [dispatch, history])

  const items = auth.isAuthenticated
    ? [...navItems, { label: 'Dashboard', to: '/dashboard' }]
    : navItems

  return (
    <>
      <RouterLink to="/" className={classes.brand}>
        <img src={logo} alt="eSim logo" className={classes.brandLogo} />
        <Typography component="span" className={classes.brandName}>
          eSim Cloud
        </Typography>
      </RouterLink>

      <nav className={classes.nav}>
        {items.map((item) => (
          <RouterLink
            key={item.to}
            to={item.to}
            className={
              location.pathname.startsWith(item.to)
                ? `${classes.navLink} ${classes.navLinkActive}`
                : classes.navLink
            }
          >
            {item.label}
          </RouterLink>
        ))}
      </nav>

      {/* Display login option or user menu as per authenticated status */}
      <div className={classes.actions}>
        {!auth.isAuthenticated
          ? (<>
            <Button
              size="small"
              component={RouterLink}
              to="/login?close=close"
              color="primary"
              target="_blank"
            >
              Sign in
            </Button>
            <Button
              size="small"
              component={RouterLink}
              to="/signup"
              color="primary"
              variant="contained"
              disableElevation
            >
              Get started
            </Button>
          </>)
          : (<>
            <IconButton
              size="small"
              aria-controls="user-menu"
              aria-haspopup="true"
              onClick={handleClick}
            >
              <Avatar className={classes.avatar}>
                {auth.user && auth.user.username ? auth.user.username.charAt(0).toUpperCase() : ''}
              </Avatar>
            </IconButton>
            <Menu
              id="user-menu"
              anchorEl={anchorEl}
              keepMounted
              open={Boolean(anchorEl)}
              onClose={handleClose}
              TransitionComponent={Fade}
              getContentAnchorEl={null}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem className={classes.menuHeader}>
                <ListItemText
                  primary={auth.user ? auth.user.username : ''}
                  secondary={auth.user ? auth.user.email : ''}
                />
              </MenuItem>
              <Divider />
              <MenuItem
                component={RouterLink}
                to="/dashboard"
                onClick={handleClose}
              >
                Dashboard
              </MenuItem>
              <MenuItem
                component={RouterLink}
                to="/account/change_password"
                onClick={handleClose}
              >
                Change password
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => {
                store.dispatch(logout(history))
              }}>
                Sign out
              </MenuItem>
            </Menu>
          </>)
        }
      </div>
    </>
  )
}

export default function Navbar () {
  const classes = useStyles()

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      className={classes.appBar}
    >
      <Toolbar variant="dense" className={classes.toolbar}>
        <Header />
      </Toolbar>
    </AppBar>
  )
}
