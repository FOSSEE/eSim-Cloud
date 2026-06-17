import React, { useEffect, useState, useCallback } from 'react'
import { ListItem, ListItemText, Collapse, CircularProgress, Typography } from '@material-ui/core'
import ExpandLess from '@material-ui/icons/ExpandLess'
import ExpandMore from '@material-ui/icons/ExpandMore'
import api from '../../utils/Api'
import CustomSideComp from './CustomSideComp'
import { parsePins, symbolPrefixFor, makeSymbolUrl } from './symbolGenerator'

// Lists the user's saved custom SPICE models/subcircuits in the schematic
// sidebar AND makes each one draggable onto the canvas (via a generated SVG
// symbol). Reads from the #539 endpoint: GET /api/simulation/models/
// Pass a `refreshKey` that changes when a new model is saved, to re-fetch.
export default function MyComponents ({ refreshKey }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(true)

  // Get the SPICE text for an item, fetching detail only if the list row
  // didn't already include it.
  const getContent = useCallback(async (item, token) => {
    const inline = item.sanitized_content || item.raw_content || item.content
    if (inline) return inline
    try {
      const res = await api.get(`simulation/models/${item.id}`, {
        headers: { Authorization: `Token ${token}` }
      })
      const d = res.data || {}
      return d.sanitized_content || d.raw_content || d.content || ''
    } catch (e) {
      return ''
    }
  }, [])

  const fetchModels = useCallback(async () => {
    const token = localStorage.getItem('esim_token')
    if (!token) { setItems([]); return }
    setLoading(true)
    try {
      const res = await api.get('simulation/models/', {
        headers: { Authorization: `Token ${token}` }
      })
      const data = res.data
      const list = Array.isArray(data) ? data : (data.results || [])

      const built = await Promise.all(list.map(async (m) => {
        const content = await getContent(m, token)
        const pins = parsePins(content, m.model_type)
        const symbolPrefix = symbolPrefixFor(content, m.model_type)
        const svgPath = makeSymbolUrl({ name: m.name, pins, symbolPrefix })
        // Component object shaped like a built-in component for the placement flow
        return {
          id: m.id,
          customModelId: m.id, // for the future custom_model_ids simulate step
          name: m.name,
          model_type: m.model_type,
          svg_path: svgPath,
          symbol_prefix: symbolPrefix,
          full_name: m.name,
          description: '',
          keyword: '',
          data_link: ''
        }
      }))
      setItems(built)
    } catch (err) {
      console.error('Failed to load custom components:', err)
    } finally {
      setLoading(false)
    }
  }, [getContent])

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
        {!loading && items.length === 0 &&
          <ListItem>
            <Typography variant="body2" color="textSecondary">None yet.</Typography>
          </ListItem>}
        {items.map((c) => (
          <ListItem key={c.id} dense divider>
            <CustomSideComp component={c} />
            <ListItemText primary={c.name} secondary={c.model_type} style={{ marginLeft: 12 }} />
          </ListItem>
        ))}
      </Collapse>
    </>
  )
}