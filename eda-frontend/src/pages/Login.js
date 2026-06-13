// User Login / Sign In page.
/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react'

import {
  Container,
  Grid,
  Button,
  Typography,
  Link,
  Checkbox,
  FormControlLabel,
  TextField,
  Card,
  Avatar,
  InputAdornment,
  IconButton,
  Box
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import LockOutlinedIcon from '@material-ui/icons/LockOutlined'
import Visibility from '@material-ui/icons/Visibility'
import VisibilityOff from '@material-ui/icons/VisibilityOff'
import { Link as RouterLink } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { login, authDefault, googleLogin } from '../redux/actions/index'
import google from '../static/google.png'

const useStyles = makeStyles((theme) => ({
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(3)
  },
  paper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: theme.spacing(4),
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  avatar: {
    margin: theme.spacing(1),
    backgroundColor: theme.palette.primary.main,
    width: theme.spacing(6),
    height: theme.spacing(6)
  },
  title: {
    fontWeight: 600,
    color: '#333',
    marginBottom: theme.spacing(1)
  },
  form: {
    width: '100%',
    marginTop: theme.spacing(2)
  },
  submit: {
    margin: theme.spacing(3, 0, 2),
    padding: theme.spacing(1.2),
    borderRadius: '8px',
    background: 'linear-gradient(to right, #667eea, #764ba2)',
    color: 'white',
    fontWeight: 'bold',
    transition: 'transform 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 20px rgba(118, 75, 162, 0.4)'
    }
  },
  googleBtn: {
    margin: theme.spacing(0, 0, 2),
    padding: theme.spacing(1),
    borderRadius: '8px',
    backgroundColor: 'white',
    color: '#555',
    fontWeight: 600,
    border: '1px solid #ddd',
    textTransform: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: '#f9f9f9',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
    }
  },
  textField: {
    '& .MuiOutlinedInput-root': {
      borderRadius: '8px'
    }
  },
  link: {
    fontWeight: 500,
    color: '#667eea'
  }
}))

var url = ''

export default function SignIn (props) {
  const classes = useStyles()
  const auth = useSelector(state => state.authReducer)
  const [close, setClose] = useState(false)

  const dispatch = useDispatch()

  useEffect(() => {
    const query = new URLSearchParams(props.location.search)
    if (query.get('logout')) {
      localStorage.removeItem('esim_auth_token')
    }
  // eslint-disable-next-line
  }, [])

  useEffect(() => {
    dispatch(authDefault())
    document.title = 'Login | eSim'

    const user = localStorage.getItem('username')
    if (user && user !== '') {
      setUsername(user)
      setRemember(true)
    }

    const query = new URLSearchParams(props.location.search)
    if (query.get('close')) {
      setClose(true)
    }

    const ardUrl = localStorage.getItem('ard_redurl')
    if (ardUrl && ardUrl !== '') {
      url = ardUrl
    } else if (props.location.search !== '') {
      url = query.get('url')
      localStorage.setItem('ard_redurl', url)
    } else {
      url = ''
    }
  }, [dispatch, props.location.search, close])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const handleClickShowPassword = () => setShowPassword(!showPassword)
  const handleMouseDownPassword = () => setShowPassword(!showPassword)

  // Function call for normal user login.
  const handleLogin = (event) => {
    event.preventDefault()
    if (remember) {
      localStorage.setItem('username', username)
    } else if (username === localStorage.getItem('username')) {
      localStorage.setItem('username', '')
    }
    if (!close) {
      dispatch(login(username, password, url))
    }
    if (close) {
      dispatch(login(username, password, 'close'))
    }
    localStorage.removeItem('ard_redurl')
  }

  // Function call for google oAuth login.
  const handleGoogleLogin = () => {
    var host = window.location.protocol + '//' + window.location.host
    dispatch(googleLogin(host))
  }

  return (
    <Box className={classes.root}>
      <Container component="main" maxWidth="xs">
        <Card className={classes.paper} elevation={0}>
          <Avatar className={classes.avatar}>
            <LockOutlinedIcon fontSize="large" style={{ color: 'white' }} />
          </Avatar>

          <Typography component="h1" variant="h5" className={classes.title}>
            Welcome Back
          </Typography>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: '16px' }}>
            Sign in to continue to eSim
          </Typography>

          {/* Display's error messages while logging in */}
          {auth.errors && (
            <Typography variant="body2" align="center" style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#ffebee', borderRadius: '4px', width: '100%' }} color="error">
              {auth.errors}
            </Typography>
          )}

          <form className={classes.form} onSubmit={handleLogin} noValidate>
            <TextField
              className={classes.textField}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label="Username"
              name="email"
              autoComplete="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <TextField
              className={classes.textField}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={handleClickShowPassword}
                      onMouseDown={handleMouseDownPassword}
                      edge="end"
                    >
                      {showPassword ? <Visibility /> : <VisibilityOff />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <Grid container alignItems="center" justify="space-between">
              <Grid item>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={remember}
                      color="primary"
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                  }
                  label={<Typography variant="body2">Remember me</Typography>}
                />
              </Grid>
              <Grid item>
                <Link component={RouterLink} to="/reset-password" variant="body2" className={classes.link}>
                  Forgot password?
                </Link>
              </Grid>
            </Grid>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              className={classes.submit}
            >
              Sign In
            </Button>

            <Button
              fullWidth
              variant="outlined"
              className={classes.googleBtn}
              onClick={handleGoogleLogin}
              startIcon={<img src={google} alt="google logo" style={{ width: '20px', height: '20px' }} />}
            >
              Sign in with Google
            </Button>

            <Grid container justify="center" style={{ marginTop: '8px' }}>
              <Grid item>
                <Typography variant="body2" color="textSecondary">
                  Don&apos;t have an account?{' '}
                  <Link component={RouterLink} to="/signup" className={classes.link}>
                    Sign Up
                  </Link>
                </Typography>
              </Grid>
            </Grid>
          </form>
        </Card>
      </Container>
    </Box>
  )
}
