import React, { useEffect, useState, useCallback } from 'react'
import { ListItem, ListItemText, Collapse, CircularProgress, Typography } from '@material-ui/core'
import ExpandLess from '@material-ui/icons/ExpandLess'
import ExpandMore from '@material-ui/icons/ExpandMore'
import api from '../../utils/Api'

// Lists the current user's saved custom SPICE models/subcircuits in the
// schematic-editor sidebar. Reads from Parth's #539 endpoint:
//   GET /api/simulation/models/   (Authorization: Token <token>)
// Pass a `refreshKey` that changes whenever a new model is saved, so the
// list re-fetches (e.g. bump it when the builder drawer closes).
export default function MyComponents ({ refreshKey }) {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(true)

  const fetchModels = useCallback(() => {
    const token = localStorage.getItem('esim_token')
    if (!token) { setModels([]); return }
    setLoading(true)
    api.get('simulation/models/', { headers: { Authorization: `Token ${token}` } })
      .then((res) => {
        const data = res.data
        // Handle a plain array OR DRF pagination ({ results: [...] })
        setModels(Array.isArray(data) ? data : (data.results || []))
      })
      .catch((err) => console.error('Failed to load custom components:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels, refreshKey])

  return (
    <>
      <ListItem button onClick={() => setOpen(!open)} divider>
        <span style={{ marginRight: 'auto' }}>My Components</span>
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItem>
      <Collapse in={open} timeout="auto" unmountOnExit>
        {loading &&
          <ListItem><CircularProgress size={20} /></ListItem>}
        {!loading && models.length === 0 &&
          <ListItem>
            <Typography variant="body2" color="textSecondary">None yet.</Typography>
          </ListItem>}
        {models.map((m) => (
          <ListItem key={m.id} dense divider>
            <ListItemText primary={m.name} secondary={m.model_type} />
          </ListItem>
        ))}
      </Collapse>
    </>
  )
}