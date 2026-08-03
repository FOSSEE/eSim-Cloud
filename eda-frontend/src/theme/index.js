// Application MUI theme, built from the design tokens in ./tokens.js.
// Light enterprise palette: white surfaces, slate text, blue accent.
import { createMuiTheme } from '@material-ui/core/styles'
import { color, font, radius, shadow } from './tokens'

const theme = createMuiTheme({
  palette: {
    type: 'light',
    primary: {
      main: color.accent,
      dark: color.accentHover,
      light: color.accentSubtle,
      contrastText: color.textInverse
    },
    secondary: {
      main: color.textSecondary,
      contrastText: color.textInverse
    },
    error: {
      main: color.danger
    },
    warning: {
      main: color.warning
    },
    success: {
      main: color.success
    },
    info: {
      main: color.info
    },
    background: {
      default: color.canvas,
      paper: color.surface
    },
    text: {
      primary: color.textPrimary,
      secondary: color.textSecondary,
      hint: color.textTertiary
    },
    divider: color.border
  },
  typography: {
    fontFamily: font.sans,
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    button: { fontWeight: 600, textTransform: 'none' }
  },
  shape: {
    borderRadius: radius.md
  },
  props: {
    MuiButtonBase: {
      disableRipple: false
    },
    MuiPaper: {
      elevation: 0
    }
  },
  overrides: {
    MuiCssBaseline: {
      '@global': {
        body: {
          backgroundColor: color.canvas
        }
      }
    },
    MuiButton: {
      root: {
        borderRadius: radius.md,
        padding: '6px 16px'
      },
      contained: {
        boxShadow: shadow.xs,
        '&:hover': {
          boxShadow: shadow.sm
        },
        '&:active': {
          boxShadow: 'none'
        }
      },
      containedPrimary: {
        '&:hover': {
          backgroundColor: color.accentHover
        }
      },
      outlined: {
        borderColor: color.border,
        '&:hover': {
          borderColor: color.borderStrong,
          backgroundColor: color.surfaceMuted
        }
      },
      outlinedPrimary: {
        borderColor: color.accentBorder,
        '&:hover': {
          borderColor: color.accent,
          backgroundColor: color.accentSubtle
        }
      }
    },
    MuiPaper: {
      outlined: {
        borderColor: color.border
      },
      rounded: {
        borderRadius: radius.lg
      }
    },
    MuiCard: {
      root: {
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.xs
      }
    },
    MuiAppBar: {
      colorDefault: {
        backgroundColor: color.surface
      }
    },
    MuiTooltip: {
      tooltip: {
        backgroundColor: color.textPrimary,
        fontSize: '0.75rem',
        borderRadius: radius.sm
      }
    },
    MuiMenu: {
      paper: {
        border: `1px solid ${color.border}`,
        boxShadow: shadow.md,
        borderRadius: radius.lg
      }
    },
    MuiListItem: {
      button: {
        '&:hover': {
          backgroundColor: color.surfaceMuted
        }
      }
    },
    MuiOutlinedInput: {
      root: {
        borderRadius: radius.md,
        '& $notchedOutline': {
          borderColor: color.border
        },
        '&:hover $notchedOutline': {
          borderColor: color.borderStrong
        }
      }
    },
    MuiDialog: {
      paper: {
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        boxShadow: shadow.lg
      }
    },
    MuiChip: {
      root: {
        borderRadius: radius.sm,
        fontWeight: 500
      }
    },
    MuiTab: {
      root: {
        textTransform: 'none',
        fontWeight: 500
      }
    },
    MuiTableCell: {
      root: {
        borderBottomColor: color.border
      }
    }
  }
})

export default theme
