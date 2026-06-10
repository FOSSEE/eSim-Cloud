import React from 'react'
import { IconButton, Tooltip, useTheme } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import Brightness4Icon from '@material-ui/icons/Brightness4'
import Brightness7Icon from '@material-ui/icons/Brightness7'
import { useThemeMode } from '../../context/ThemeContext'

const useStyles = makeStyles((theme) => ({
  button: {
    marginRight: theme.spacing(1),
    color: theme.palette.text.primary
  },
  floating: {
    position: 'fixed',
    top: theme.spacing(2),
    right: theme.spacing(2),
    zIndex: theme.zIndex.tooltip + 1,
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    boxShadow: theme.shadows[2],
    '&:hover': {
      backgroundColor: theme.palette.action.hover
    }
  }
}))

export default function DarkModeToggle ({ floating = false }) {
  const classes = useStyles()
  const theme = useTheme()
  const { darkMode, toggleDarkMode } = useThemeMode()

  return (
    <Tooltip title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        onClick={toggleDarkMode}
        aria-label="toggle dark mode"
        className={floating ? classes.floating : classes.button}
        size="small"
        style={{ color: theme.palette.text.primary }}
      >
        {darkMode ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
      </IconButton>
    </Tooltip>
  )
}
