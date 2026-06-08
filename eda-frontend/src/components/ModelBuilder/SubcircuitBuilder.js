import React, { useState, useMemo } from 'react'
import { Paper, Typography, TextField } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import AceEditor from 'react-ace'
import 'brace/theme/monokai'
import { generateSubcircuit } from '../../utils/spiceEmitter'

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

  // "in out gnd" -> ['in', 'out', 'gnd']
  const ports = useMemo(
    () => portsText.trim().split(/\s+/).filter((p) => p.length > 0),
    [portsText]
  )

  const preview = useMemo(
    () => generateSubcircuit({ name, ports, body }),
    [name, ports, body]
  )

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
      </Paper>
    </div>
  )
}