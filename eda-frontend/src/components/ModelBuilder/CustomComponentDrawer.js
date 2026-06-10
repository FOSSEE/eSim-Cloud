import React, { useState } from 'react'
import { Drawer, Tabs, Tab, IconButton, Typography, Divider } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import CloseIcon from '@material-ui/icons/Close'
import ModelBuilder from './ModelBuilder'
import SubcircuitBuilder from './SubcircuitBuilder'

const useStyles = makeStyles((theme) => ({
  drawerPaper: { width: 600, maxWidth: '100vw' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2)
  }
}))

export default function CustomComponentDrawer ({ open, onClose }) {
  const classes = useStyles()
  const [tab, setTab] = useState(0)

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      classes={{ paper: classes.drawerPaper }}
    >
      <div className={classes.header}>
        <Typography variant="h6">New Custom Component</Typography>
        <IconButton onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </div>
      <Divider />

      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        indicatorColor="primary"
        textColor="primary"
        variant="fullWidth"
      >
        <Tab label="Model" />
        <Tab label="Subcircuit" />
      </Tabs>

      {tab === 0 ? <ModelBuilder /> : <SubcircuitBuilder />}
    </Drawer>
  )
}