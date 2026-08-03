// Page to display Page Not Found (i.e. 404) error.
import React, { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, Container, Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(14, 0),
    textAlign: 'center'
  },
  code: {
    fontSize: '5rem',
    fontWeight: 800,
    letterSpacing: '-0.04em',
    color: theme.palette.primary.main,
    lineHeight: 1
  },
  title: {
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: theme.spacing(2, 0, 1)
  },
  subtitle: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(4)
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(2),
    flexWrap: 'wrap'
  }
}))

export default function NotFound () {
  const classes = useStyles()

  useEffect(() => {
    document.title = 'Not Found - eSim'
  })

  return (
    <Container maxWidth="sm" className={classes.root}>
      <Typography className={classes.code}>404</Typography>
      <Typography variant="h4" component="h1" className={classes.title}>
        Page not found
      </Typography>
      <Typography variant="body1" className={classes.subtitle}>
        The page you are looking for doesn&apos;t exist or has been moved.
      </Typography>
      <div className={classes.actions}>
        <Button
          component={RouterLink}
          to="/"
          variant="contained"
          color="primary"
          disableElevation
        >
          Back to home
        </Button>
        <Button
          component={RouterLink}
          to="/editor"
          variant="outlined"
          color="primary"
        >
          Open the editor
        </Button>
      </div>
    </Container>
  )
}
