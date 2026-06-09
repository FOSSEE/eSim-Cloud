import React, { useState, useMemo } from 'react'
import { Paper, Typography, TextField, Button } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import AceEditor from 'react-ace'
import 'brace/theme/monokai'
import { generateSubcircuit } from '../../utils/spiceEmitter'
import { saveCustomModel } from './saveModel'

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(3), maxWidth: 720, margin: '24px auto' },
  paper: { padding: theme.spacing(3) },
  field: { marginBottom: theme.spacing(2) },
  editorLabel: { marginTop: theme.spacing(1), marginBottom: theme.spacing(1) },
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

export default function SubcircuitBuilder () {
  const classes = useStyles()
  const [name, setName] = useState('')
  const [portsText, setPortsText] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // { ok: bool, msg: string }

  // "in out gnd" -> ['in', 'out', 'gnd']
  const ports = useMemo(
    () => portsText.trim().split(/\s+/).filter((p) => p.length > 0),
    [portsText]
  )

  const preview = useMemo(
    () => generateSubcircuit({ name, ports, body }),
    [name, ports, body]
  )

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const saved = await saveCustomModel({ name, modelType: 'subckt', spiceText: preview })
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
        <Typography variant="h5" gutterBottom>Subcircuit Builder</Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Define a reusable .subckt block.
        </Typography>

        <TextField
          className={classes.field}
          label="Subcircuit name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. RCFilter"
        />

        <TextField
          className={classes.field}
          label="Ports (space-separated)"
          fullWidth
          value={portsText}
          onChange={(e) => setPortsText(e.target.value)}
          placeholder="e.g. in out gnd"
        />

        <Typography variant="subtitle2" className={classes.editorLabel}>
          Internal netlist
        </Typography>
        <AceEditor
          style={{ width: '100%' }}
          theme="monokai"
          name="subcircuit-netlist"
          value={body}
          onChange={setBody}
          height="160px"
          fontSize={16}
          showPrintMargin={false}
          editorProps={{ $blockScrolling: true }}
          setOptions={{ useWorker: false, tabSize: 2 }}
        />

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
          {saving ? 'Saving…' : 'Save subcircuit'}
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