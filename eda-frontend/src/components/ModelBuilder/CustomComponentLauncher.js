import React, { useState } from 'react'
import { Button } from '@material-ui/core'
import AddIcon from '@material-ui/icons/Add'
import CustomComponentDrawer from './CustomComponentDrawer'

export default function CustomComponentLauncher () {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding: 24 }}>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<AddIcon />}
        onClick={() => setOpen(true)}
      >
        Add Component
      </Button>
      <CustomComponentDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  )
}