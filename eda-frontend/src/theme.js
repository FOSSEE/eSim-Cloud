import { red } from '@material-ui/core/colors'
import { createMuiTheme } from '@material-ui/core/styles'

const shared = {
  palette: {
    primary: {
      main: '#556cd6'
    },
    secondary: {
      main: '#19857b'
    },
    error: {
      main: red.A400
    }
  }
}

const getTheme = (darkMode = false) => {
  const descriptionColor = darkMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.65)'

  return createMuiTheme({
    ...shared,
    palette: {
      ...shared.palette,
      type: darkMode ? 'dark' : 'light',
      background: darkMode
        ? {
            default: '#121212',
            paper: '#1e1e1e'
          }
        : {
            default: '#f4f6f8',
            paper: '#ffffff'
          },
      text: darkMode
        ? {
            primary: '#ffffff',
            secondary: descriptionColor
          }
        : {
            primary: 'rgba(0, 0, 0, 0.87)',
            secondary: descriptionColor
          }
    },
    overrides: {
      MuiAppBar: {
        colorDefault: {
          backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
          color: darkMode ? '#ffffff' : 'rgba(0, 0, 0, 0.87)'
        }
      },
      MuiDrawer: {
        paper: {
          backgroundColor: darkMode ? '#1e1e1e' : '#ffffff'
        }
      },
      MuiCard: {
        root: {
          '& a.MuiButtonBase-root': {
            color: 'inherit',
            textDecoration: 'none'
          }
        }
      },
      MuiListItemText: {
        secondary: {
          color: descriptionColor
        }
      },
      MuiTypography: {
        colorTextSecondary: {
          color: descriptionColor
        }
      }
    }
  })
}

export default getTheme
