import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Container, Link, Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import logo from '../../static/logo.png'

const useStyles = makeStyles((theme) => ({
  footer: {
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    marginTop: 'auto'
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(3)
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1)
  },
  logo: {
    width: 20,
    height: 20
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3)
  },
  link: {
    fontSize: '0.8125rem',
    color: theme.palette.text.secondary,
    '&:hover': {
      color: theme.palette.text.primary,
      textDecoration: 'none'
    }
  }
}))

export default function Footer () {
  const classes = useStyles()

  return (
    <footer className={classes.footer}>
      <Container maxWidth="lg" className={classes.inner}>
        <div className={classes.brand}>
          <img src={logo} alt="" className={classes.logo} />
          <Typography variant="body2" color="textSecondary">
            eSim Cloud — an FOSSEE, IIT Bombay initiative
          </Typography>
        </div>
        <nav className={classes.links}>
          <Link component={RouterLink} to="/editor" className={classes.link}>
            Schematic Editor
          </Link>
          <Link component={RouterLink} to="/simulator/ngspice" className={classes.link}>
            Simulator
          </Link>
          <Link component={RouterLink} to="/gallery" className={classes.link}>
            Gallery
          </Link>
          <Link href="https://esim.fossee.in/" target="_blank" rel="noopener" className={classes.link}>
            About eSim
          </Link>
        </nav>
      </Container>
    </footer>
  )
}
