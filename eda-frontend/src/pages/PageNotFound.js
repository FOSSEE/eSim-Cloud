import React, { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Container, Typography, Button } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(8, 0, 6),
    textAlign: 'center'
  },
  button: {
    marginTop: theme.spacing(4)
  }
}))

export default function PageNotFound () {
  const classes = useStyles()

  useEffect(() => {
    document.title = '404 — Page Not Found'
  }, [])

  return (
    <Container maxWidth="md" className={classes.root}>
      <Typography variant="h2" gutterBottom>
        404 — Page Not Found
      </Typography>
      <Typography variant="h5" color="textSecondary" gutterBottom>
        The page you are looking for doesn't exist or has been moved.
      </Typography>
      <Button
        variant="contained"
        color="primary"
        className={classes.button}
        component={RouterLink}
        to={'/'}
      >
        Go to Home
      </Button>
    </Container>
  )
}
