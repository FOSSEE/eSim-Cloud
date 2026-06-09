import React, { useState, useMemo } from 'react'
import { Grid, Paper, Typography, TextField, MenuItem, Button } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { generateModelCard } from '../../utils/spiceEmitter'
import { DEVICE_TYPES, DEVICE_PARAMS } from './deviceParams'
import { saveCustomModel } from './saveModel'

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(3), maxWidth: 720, margin: '24px auto' },
  paper: { padding: theme.spacing(3) },
  field: { marginBottom: theme.spacing(2) },
  previewLabel: { marginTop: theme.spacing(2) },
  preview: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(2),
    backgroundColor: '#1e1e1e',
    color: '#9feaf9',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    borderRadius: 4,
    minHeight: 24
  }
}))

export default function ModelBuilder () {
  const classes = useStyles()
  const [name, setName] = useState('')
  const [deviceType, setDeviceType] = useState('D')
  const [params, setParams] = useState({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // { ok: bool, msg: string }

  const paramDefs = DEVICE_PARAMS[deviceType] || []

  const handleDeviceChange = (e) => {
    setDeviceType(e.target.value)
    setParams({}) // params differ per device, so reset on switch
  }

  const handleParamChange = (key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  // Recompute the SPICE line only when something it depends on changes.
  const preview = useMemo(
    () => generateModelCard({ name, deviceType, params }),
    [name, deviceType, params]
  )

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const saved = await saveCustomModel({ name, modelType: 'model', spiceText: preview })
      setStatus({ ok: true, msg: `Saved "${saved.name}".` })
    } catch (err) {
      const data = err.response && err.response.data
      const msg = (data && (data.name || data.detail || JSON.stringify(data))) || err.message
      setStatus({ ok: false, msg: String(msg) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={classes.root}>
      <Paper className={classes.paper}>
        <Typography variant="h5" gutterBottom>Model Builder</Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Create a custom SPICE .model card.
        </Typography>

        <TextField
          className={classes.field}
          label="Model name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. MyDiode"
        />

        <TextField
          className={classes.field}
          select
          label="Device type"
          fullWidth
          value={deviceType}
          onChange={handleDeviceChange}
        >
          {DEVICE_TYPES.map((d) => (
            <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
          ))}
        </TextField>

        <Grid container spacing={2}>
          {paramDefs.map((p) => (
            <Grid item xs={12} sm={6} key={p.key}>
              <TextField
                label={p.label}
                fullWidth
                value={params[p.key] || ''}
                onChange={(e) => handleParamChange(p.key, e.target.value)}
                placeholder={p.placeholder}
              />
            </Grid>
          ))}
        </Grid>

        <Typography variant="subtitle2" className={classes.previewLabel}>
          Live preview
        </Typography>
        <div className={classes.preview}>{preview}</div>

        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ marginTop: 16 }}
        >
          {saving ? 'Saving…' : 'Save model'}
        </Button>
        {status && (
          <Typography
            variant="body2"
            style={{ marginTop: 8, color: status.ok ? 'green' : '#c62828' }}
          >
            {status.msg}
          </Typography>
        )}
      </Paper>
    </div>
  )
}