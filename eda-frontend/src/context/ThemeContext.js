import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@material-ui/core'
import getTheme from '../theme'
import {
  applyDocumentTheme,
  getInitialDarkMode,
  setStoredDarkMode
} from '../themeStorage'

const ThemeContext = createContext({
  darkMode: false,
  toggleDarkMode: () => {}
})

export function ThemeContextProvider ({ children }) {
  const [darkMode, setDarkMode] = useState(() => getInitialDarkMode())

  useEffect(() => {
    setStoredDarkMode(darkMode)
    applyDocumentTheme(darkMode)
  }, [darkMode])

  const theme = useMemo(() => getTheme(darkMode), [darkMode])

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev)
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

export function useThemeMode () {
  return useContext(ThemeContext)
}
