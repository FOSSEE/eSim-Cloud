// Landing page: hero, quick actions, feature grid, workflow and CTA.
import React, { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Button,
  Card,
  CardActionArea,
  Container,
  Grid,
  Typography
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import CreateIcon from '@material-ui/icons/Create'
import TimelineIcon from '@material-ui/icons/Timeline'
import CollectionsIcon from '@material-ui/icons/Collections'
import FolderSharedIcon from '@material-ui/icons/FolderShared'
import DashboardIcon from '@material-ui/icons/Dashboard'
import MemoryIcon from '@material-ui/icons/Memory'
import CloudDoneIcon from '@material-ui/icons/CloudDone'
import ShareIcon from '@material-ui/icons/Share'
import SchoolIcon from '@material-ui/icons/School'
import ArrowForwardIcon from '@material-ui/icons/ArrowForward'
import Footer from '../components/Shared/Footer'

const useStyles = makeStyles((theme) => ({
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'calc(100vh - 60px)',
    backgroundColor: theme.palette.background.default
  },
  hero: {
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(12, 0, 10),
    textAlign: 'center'
  },
  heroBadge: {
    display: 'inline-block',
    padding: theme.spacing(0.5, 1.5),
    marginBottom: theme.spacing(3),
    borderRadius: 999,
    border: '1px solid #bfdbfe',
    backgroundColor: '#eff6ff',
    color: theme.palette.primary.main,
    fontSize: '0.8125rem',
    fontWeight: 600
  },
  heroTitle: {
    fontSize: '3rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down('xs')]: {
      fontSize: '2.125rem'
    }
  },
  heroSubtitle: {
    maxWidth: 620,
    margin: '0 auto',
    marginBottom: theme.spacing(4),
    color: theme.palette.text.secondary,
    fontSize: '1.125rem',
    lineHeight: 1.6
  },
  heroActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(2),
    flexWrap: 'wrap'
  },
  section: {
    padding: theme.spacing(8, 0)
  },
  sectionTitle: {
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: theme.spacing(1)
  },
  sectionSubtitle: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(4)
  },
  quickCard: {
    height: '100%'
  },
  quickCardArea: {
    height: '100%',
    padding: theme.spacing(3),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5)
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    color: theme.palette.primary.main
  },
  quickTitle: {
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75)
  },
  quickArrow: {
    fontSize: '1rem',
    opacity: 0,
    transition: 'opacity 120ms ease, transform 120ms ease',
    '$quickCardArea:hover &': {
      opacity: 1,
      transform: 'translateX(2px)'
    }
  },
  featureItem: {
    display: 'flex',
    gap: theme.spacing(2)
  },
  featureIcon: {
    color: theme.palette.primary.main,
    marginTop: 2
  },
  workflow: {
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.common.white,
    fontWeight: 700,
    fontSize: '0.8125rem',
    marginBottom: theme.spacing(1.5)
  },
  cta: {
    textAlign: 'center',
    padding: theme.spacing(10, 0)
  }
}))

const quickActions = [
  {
    title: 'Schematic Editor',
    description: 'Draw circuits on a grid canvas with a full component library.',
    to: '/editor',
    icon: <CreateIcon />
  },
  {
    title: 'Circuit Simulator',
    description: 'Run DC, AC and transient analyses powered by Ngspice.',
    to: '/simulator/ngspice',
    icon: <TimelineIcon />
  },
  {
    title: 'Gallery',
    description: 'Start from curated example circuits and reference designs.',
    to: '/gallery',
    icon: <CollectionsIcon />
  },
  {
    title: 'Public Projects',
    description: 'Browse circuits published by the eSim community.',
    to: '/projects',
    icon: <FolderSharedIcon />
  },
  {
    title: 'My Dashboard',
    description: 'Pick up your saved schematics and project submissions.',
    to: '/dashboard',
    icon: <DashboardIcon />,
    authOnly: true
  }
]

const features = [
  {
    title: 'Nothing to install',
    description: 'The complete schematic-to-simulation workflow runs in the browser. Open a tab and start designing.',
    icon: <CloudDoneIcon />
  },
  {
    title: 'Ngspice under the hood',
    description: 'Simulations run on the industry-standard open-source engine, with plotted waveforms and netlist preview.',
    icon: <MemoryIcon />
  },
  {
    title: 'Share and publish',
    description: 'Save circuits to the cloud, version them, and publish to the public gallery for others to reuse.',
    icon: <ShareIcon />
  },
  {
    title: 'Built for classrooms',
    description: 'LTI integration lets instructors embed circuits in LMS coursework and review student submissions.',
    icon: <SchoolIcon />
  }
]

const workflow = [
  {
    title: 'Design',
    description: 'Place components from the library and wire them on the schematic canvas.'
  },
  {
    title: 'Simulate',
    description: 'Configure an analysis, run it in the cloud and inspect the waveforms.'
  },
  {
    title: 'Share',
    description: 'Save to your dashboard, export the netlist or publish to the gallery.'
  }
]

export default function Home () {
  const classes = useStyles()
  const auth = useSelector(state => state.authReducer)

  useEffect(() => {
    document.title = 'eSim Cloud — Online Circuit Design and Simulation'
  })

  const visibleActions = quickActions.filter(a => !a.authOnly || auth.isAuthenticated)

  return (
    <div className={classes.page}>
      {/* Hero */}
      <section className={classes.hero}>
        <Container maxWidth="md">
          <span className={classes.heroBadge}>Free and open source — FOSSEE, IIT Bombay</span>
          <Typography component="h1" className={classes.heroTitle}>
            Design and simulate circuits, right in your browser
          </Typography>
          <Typography component="p" className={classes.heroSubtitle}>
            eSim Cloud is an end-to-end EDA workbench: draw schematics, run
            Ngspice simulations and share your designs — no installation required.
          </Typography>
          <div className={classes.heroActions}>
            <Button
              component={RouterLink}
              to="/editor"
              variant="contained"
              color="primary"
              size="large"
              disableElevation
              endIcon={<ArrowForwardIcon />}
            >
              Open Schematic Editor
            </Button>
            <Button
              component={RouterLink}
              to="/gallery"
              variant="outlined"
              color="primary"
              size="large"
            >
              Explore the Gallery
            </Button>
          </div>
        </Container>
      </section>

      {/* Quick actions */}
      <section className={classes.section}>
        <Container maxWidth="lg">
          <Typography variant="h5" className={classes.sectionTitle}>
            Jump in
          </Typography>
          <Typography variant="body1" className={classes.sectionSubtitle}>
            Everything in eSim Cloud, one click away.
          </Typography>
          <Grid container spacing={3}>
            {visibleActions.map((action) => (
              <Grid item xs={12} sm={6} md={4} key={action.to}>
                <Card variant="outlined" className={classes.quickCard}>
                  <CardActionArea
                    component={RouterLink}
                    to={action.to}
                    className={classes.quickCardArea}
                  >
                    <div className={classes.quickIcon}>{action.icon}</div>
                    <Typography variant="subtitle1" className={classes.quickTitle}>
                      {action.title}
                      <ArrowForwardIcon className={classes.quickArrow} />
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {action.description}
                    </Typography>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </section>

      {/* Workflow */}
      <section className={`${classes.section} ${classes.workflow}`}>
        <Container maxWidth="lg">
          <Typography variant="h5" className={classes.sectionTitle}>
            From idea to waveform in three steps
          </Typography>
          <Typography variant="body1" className={classes.sectionSubtitle}>
            A single workflow that follows your circuit from first wire to final plot.
          </Typography>
          <Grid container spacing={4}>
            {workflow.map((step, i) => (
              <Grid item xs={12} md={4} key={step.title}>
                <div className={classes.stepNumber}>{i + 1}</div>
                <Typography variant="subtitle1" style={{ fontWeight: 600 }} gutterBottom>
                  {step.title}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {step.description}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </section>

      {/* Features */}
      <section className={classes.section}>
        <Container maxWidth="lg">
          <Typography variant="h5" className={classes.sectionTitle}>
            Why eSim Cloud
          </Typography>
          <Typography variant="body1" className={classes.sectionSubtitle}>
            A serious EDA toolchain with the convenience of the web.
          </Typography>
          <Grid container spacing={4}>
            {features.map((feature) => (
              <Grid item xs={12} sm={6} key={feature.title}>
                <div className={classes.featureItem}>
                  <div className={classes.featureIcon}>{feature.icon}</div>
                  <div>
                    <Typography variant="subtitle1" style={{ fontWeight: 600 }} gutterBottom>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {feature.description}
                    </Typography>
                  </div>
                </div>
              </Grid>
            ))}
          </Grid>
        </Container>
      </section>

      {/* CTA */}
      <section className={classes.cta}>
        <Container maxWidth="sm">
          <Typography variant="h4" className={classes.sectionTitle} gutterBottom>
            Start your first circuit
          </Typography>
          <Typography variant="body1" className={classes.sectionSubtitle}>
            No account needed to try the editor. Sign up to save and share your work.
          </Typography>
          <div className={classes.heroActions}>
            <Button
              component={RouterLink}
              to="/editor"
              variant="contained"
              color="primary"
              size="large"
              disableElevation
            >
              Launch Editor
            </Button>
            {!auth.isAuthenticated && (
              <Button
                component={RouterLink}
                to="/signup"
                variant="outlined"
                color="primary"
                size="large"
              >
                Create free account
              </Button>
            )}
          </div>
        </Container>
      </section>

      <Footer />
    </div>
  )
}
