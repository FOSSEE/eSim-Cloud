import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { makeStyles } from '@material-ui/core/styles'
import {
  Avatar,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  TextField,
  Typography,
  Snackbar
} from '@material-ui/core'
import MuiAlert from '@material-ui/lab/Alert'
import api from '../../utils/Api'

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3)
  },
  card: {
    maxWidth: 620,
    margin: '0 auto',
    marginTop: theme.spacing(4)
  },
  avatar: {
    width: theme.spacing(10),
    height: theme.spacing(10),
    margin: '0 auto',
    marginBottom: theme.spacing(2),
    backgroundColor: theme.palette.primary.main,
    fontSize: '2rem'
  },
  center: {
    textAlign: 'center'
  },
  chip: {
    margin: theme.spacing(0.5)
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(3),
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1)
  },
  statBox: {
    textAlign: 'center',
    padding: theme.spacing(1.5, 3),
    backgroundColor: theme.palette.grey[100],
    borderRadius: theme.shape.borderRadius
  },
  statNumber: {
    fontSize: '1.8rem',
    fontWeight: 'bold',
    color: theme.palette.primary.main
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(2),
    marginTop: theme.spacing(1)
  },
  field: {
    marginBottom: theme.spacing(2)
  },
  btnRow: {
    display: 'flex',
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
    justifyContent: 'flex-end'
  }
}))

function formatDate (dateStr) {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function UserProfile () {
  const classes = useStyles()
  const auth = useSelector(state => state.authReducer)

  const [profile, setProfile] = useState(null)
  const [schematicCount, setSchematicCount] = useState(0)
  const [simulationCount] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({
    username: '', email: '', first_name: '', last_name: ''
  })
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })
  const [passwordDialog, setPasswordDialog] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', re_new_password: '' })
  const [passwordErrors, setPasswordErrors] = useState({})

  const getConfig = () => {
    const token = localStorage.getItem('esim_auth_token')
    const config = { headers: { 'Content-Type': 'application/json' } }
    if (token) config.headers.Authorization = `Token ${token}`
    return config
  }

  useEffect(() => {
    const config = getConfig()
    api.get('auth/user/profile/', config)
      .then(res => {
        setProfile(prev => ({ ...prev, ...res.data }))
        setFormData({
          username: res.data.username || '',
          email: res.data.email || '',
          first_name: res.data.first_name || '',
          last_name: res.data.last_name || ''
        })
      })
      .catch(err => console.log(err))

    api.get('save/list', config)
      .then(res => setSchematicCount(res.data.length))
      .catch(err => console.log(err))
  }, [])

  const handleSave = () => {
    const config = getConfig()
    api.patch('auth/user/profile/', formData, config)
      .then(res => {
        setProfile(prev => ({ ...prev, ...res.data }))
        setEditMode(false)
        setSnackbar({ open: true, message: 'Profile updated successfully', severity: 'success' })
      })
      .catch(() => {
        setSnackbar({ open: true, message: 'Failed to update profile', severity: 'error' })
      })
  }

  if (!auth.user || !profile) {
    return (
      <div className={classes.root}>
        <Typography variant="h6">Loading profile...</Typography>
      </div>
    )
  }

  return (
    <div className={classes.root}>
      <Card className={classes.card}>
        <CardContent>

          {/* Avatar and name */}
          <div className={classes.center}>
            <Avatar className={classes.avatar}>
              {profile.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h5">
              {profile.first_name || profile.last_name
                ? `${profile.first_name} ${profile.last_name}`.trim()
                : profile.username}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {profile.email || 'No email set'}
            </Typography>
            {auth.roles && (
              <div style={{ marginTop: 8 }}>
                {auth.roles.is_type_contributor && (
                  <Chip label="Contributor" color="primary" size="small" className={classes.chip} />
                )}
                {auth.roles.is_type_reviewer && (
                  <Chip label="Reviewer" color="secondary" size="small" className={classes.chip} />
                )}
              </div>
            )}
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* Stats */}
          <div className={classes.statsRow}>
            <div className={classes.statBox}>
              <div className={classes.statNumber}>{schematicCount}</div>
              <Typography variant="caption" color="textSecondary">Schematics</Typography>
            </div>
            <div className={classes.statBox}>
              <div className={classes.statNumber}>{simulationCount}</div>
              <Typography variant="caption" color="textSecondary">Simulations</Typography>
            </div>
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* Account info */}
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Account Information
          </Typography>

          {!editMode ? (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">Username</Typography>
                <Typography variant="body1">{profile.username}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">Email</Typography>
                <Typography variant="body1">{profile.email || 'Not set'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">First Name</Typography>
                <Typography variant="body1">{profile.first_name || 'Not set'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">Last Name</Typography>
                <Typography variant="body1">{profile.last_name || 'Not set'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">Member Since</Typography>
                <Typography variant="body1">{formatDate(profile.date_joined)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary">Last Login</Typography>
                <Typography variant="body1">{formatDate(profile.last_login)}</Typography>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Username"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  fullWidth size="small" variant="outlined"
                  className={classes.field}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  fullWidth size="small" variant="outlined"
                  className={classes.field}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="First Name"
                  value={formData.first_name}
                  onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  fullWidth size="small" variant="outlined"
                  className={classes.field}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Last Name"
                  value={formData.last_name}
                  onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  fullWidth size="small" variant="outlined"
                  className={classes.field}
                />
              </Grid>
            </Grid>
          )}

          <div className={classes.btnRow}>
            {!editMode ? (
              <>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => setPasswordDialog(true)}
                >
                  Change Password
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setEditMode(true)}
                >
                  Edit Profile
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outlined"
                  onClick={() => setEditMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                >
                  Save Changes
                </Button>
              </>
            )}
          </div>

        </CardContent>
      </Card>
      
      
      
      <Dialog open={passwordDialog} onClose={() => setPasswordDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <TextField
            label="Current Password"
            type="password"
            autoComplete="new-password"
            fullWidth
            variant="outlined"
            size="small"
            margin="normal"
            value={passwordForm.current_password}
            onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
            error={!!passwordErrors.current_password}
            helperText={passwordErrors.current_password}
          />
          <TextField
            label="New Password"
            type="password"
            autoComplete="new-password"
            fullWidth
            variant="outlined"
            size="small"
            margin="normal"
            value={passwordForm.new_password}
            onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
            error={!!passwordErrors.new_password}
            helperText={passwordErrors.new_password}
          />
          <TextField
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            fullWidth
            variant="outlined"
            size="small"
            margin="normal"
            value={passwordForm.re_new_password}
            onChange={e => setPasswordForm({ ...passwordForm, re_new_password: e.target.value })}
            error={!!passwordErrors.re_new_password}
            helperText={passwordErrors.re_new_password}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPasswordDialog(false); setPasswordForm({ current_password: '', new_password: '', re_new_password: '' }); setPasswordErrors({}) }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              const config = getConfig()
              api.post('auth/users/set_password/', passwordForm, config)
                .then(() => {
                  setPasswordDialog(false)
                  setPasswordForm({ current_password: '', new_password: '', re_new_password: '' })
                  setPasswordErrors({})
                  setSnackbar({ open: true, message: 'Password changed successfully', severity: 'success' })
                })
                .catch(err => {
                  if (err.response && err.response.data) {
                    setPasswordErrors(err.response.data)
                  } else {
                    setSnackbar({ open: true, message: 'Failed to change password', severity: 'error' })
                  }
                })
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <MuiAlert severity={snackbar.severity} elevation={6} variant="filled">
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </div>
  )
}
