// User Sign Up / Register page.
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
  IconButton
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import LockOutlinedIcon from '@material-ui/icons/LockOutlined'
import Visibility from '@material-ui/icons/Visibility'
import VisibilityOff from '@material-ui/icons/VisibilityOff'
import { Link as RouterLink, useHistory } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { signUp, authDefault, googleLogin, verifyOtp } from '../redux/actions/index'
import google from '../static/google.png'

const useStyles = makeStyles((theme) => ({
  paper: {
    marginTop: theme.spacing(10),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: theme.spacing(4, 5),
    border: `1px solid ${theme.palette.divider}`
  },
  title: {
    fontWeight: 700,
    letterSpacing: '-0.02em'
  },
  avatar: {
    margin: theme.spacing(1),
    backgroundColor: theme.palette.primary.main
  },
  form: {
    width: '100%', // Fix IE 11 issue.
    marginTop: theme.spacing(1)
  },
  submit: {
    margin: theme.spacing(1.5, 0)
  }
}))

export default function SignUp () {
  const classes = useStyles()

  const auth = useSelector(state => state.authReducer)

  const dispatch = useDispatch()
  var homeURL = `${window.location.protocol}\\\\${window.location.host}/`

  useEffect(() => {
    dispatch(authDefault())
    document.title = 'Sign Up - eSim '
  }, [dispatch])

  const history = useHistory()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [showOtpForm, setShowOtpForm] = useState(false)
  const [accept, setAccept] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const handleClickShowPassword = () => setShowPassword(!showPassword)
  const handleMouseDownPassword = () => setShowPassword(!showPassword)

  useEffect(() => {
    if (auth.isRegistered && auth.regErrors && !auth.regErrors.includes('verified') && !auth.regErrors.includes('Redirecting')) {
      setShowOtpForm(true)
    }
  }, [auth.isRegistered, auth.regErrors])

  // Function call for google oAuth sign up.
  const handleGoogleSignup = () => {
    var host = window.location.protocol + '//' + window.location.host
    dispatch(googleLogin(host))
  }

  const handleSignup = (event) => {
    event.preventDefault()
    dispatch(signUp(email, username, password, history))
  }

  const handleVerifyOtp = (event) => {
    event.preventDefault()
    dispatch(verifyOtp(email, otp, history))
  }

  return (
    <Container component="main" maxWidth="xs">
      <Card className={classes.paper} elevation={0}>
        <Avatar className={classes.avatar}>
          <LockOutlinedIcon />
        </Avatar>

        <Typography component="h1" variant="h5" className={classes.title}>
          {showOtpForm ? 'Verify email' : 'Create your account'}
        </Typography>

        {/* Display's error messages while signing in */}
        <Typography variant="body1" align="center" style={{ marginTop: '10px' }} color={(auth.isRegistered && !auth.regErrors.includes('Invalid')) ? 'secondary' : 'error'}>
          {auth.regErrors}
          { (auth.isRegistered && !showOtpForm) &&
            <>
              <br />
              <Link component={RouterLink} to="/login">
                {'Back to Login'}
              </Link>
            </>
          }
        </Typography>

        {!showOtpForm ? (
          <form className={classes.form} onSubmit={handleSignup} noValidate>
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="toggle password visibility"
                      onClick={handleClickShowPassword}
                      onMouseDown={handleMouseDownPassword}
                    >
                      {showPassword ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />} {/* handle password visibility */}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <FormControlLabel
              control={<Checkbox checked={accept} onChange={e => setAccept(e.target.checked)} color="primary" />}
              label="I accept the Terms of Use & Privacy Policy"
            />
            <Button
              fullWidth
              variant="contained"
              color="primary"
              type="submit"
              disableElevation
              className={classes.submit}
              disabled={!accept}
            >
              Sign Up
            </Button>
            <Typography variant="body2" color="textSecondary" align="center" >Or</Typography>

            {/* Google oAuth Sign Up option */}
            <Button
              fullWidth
              variant="outlined"
              color="primary"
              onClick={handleGoogleSignup}
              className={classes.submit}
            >
              <img alt="G" src={google} height="20" />&emsp; Sign Up With Google
            </Button>
          </form>
        ) : (
          <form className={classes.form} onSubmit={handleVerifyOtp} noValidate>
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="otp"
              label="Enter 6-Digit OTP"
              name="otp"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              autoFocus
            />
            <Button
              fullWidth
              variant="contained"
              color="primary"
              type="submit"
              className={classes.submit}
            >
              Verify OTP & Register
            </Button>
            <Button
              fullWidth
              onClick={() => setShowOtpForm(false)}
              color="default"
              className={classes.submit}
            >
              Back to Sign Up
            </Button>
          </form>
        )}

        <Grid container>
          <Grid item style={{ margin: 'auto' }} >
            <Link component={RouterLink} to="/login" variant="body2">
              {'Already have account? Login'}
            </Link>
          </Grid>
        </Grid>
      </Card>
      <Button
        fullWidth
        onClick={() => { window.open(homeURL, '_self') }}
        color="default"
        className={classes.submit}
      >
        Back to home
      </Button>
    </Container>
  )
}
