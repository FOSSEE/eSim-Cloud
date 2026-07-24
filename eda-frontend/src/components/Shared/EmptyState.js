import React from 'react'
import PropTypes from 'prop-types'
import { Typography, Button, Box } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(4),
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box'
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: '50%',
    backgroundColor: theme.palette.type === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    '& > svg': {
      fontSize: 40
    }
  },
  title: {
    fontWeight: 600,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(1)
  },
  description: {
    color: theme.palette.text.secondary,
    maxWidth: 400,
    marginBottom: theme.spacing(3),
    lineHeight: 1.5
  },
  actionButton: {
    textTransform: 'none',
    fontWeight: 600,
    padding: theme.spacing(1, 3),
    borderRadius: 8
  }
}))

export default function EmptyState ({ 
  icon, 
  title, 
  description, 
  actionLabel, 
  onAction, 
  actionIcon, 
  minHeight = '300px' 
}) {
  const classes = useStyles()

  return (
    <Box className={classes.root} style={{ minHeight }}>
      {React.isValidElement(icon) && (
        <div className={classes.iconContainer}>
          {icon}
        </div>
      )}
      <Typography variant="h6" className={classes.title}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" className={classes.description}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button
          variant="contained"
          color="primary"
          onClick={() => typeof onAction === 'function' && onAction()}
          startIcon={actionIcon}
          className={classes.actionButton}
          disableElevation
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  )
}

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
  actionIcon: PropTypes.node,
  minHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}
