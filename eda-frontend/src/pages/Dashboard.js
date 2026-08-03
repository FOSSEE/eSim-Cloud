// Main Layout for user dashboard.
import React, { useEffect } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'
import { CssBaseline } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Header } from '../components/Shared/Navbar'
import Layout from '../components/Shared/Layout'
import LayoutMain from '../components/Shared/LayoutMain'
import SchematicsList from '../components/Dashboard/SchematicsList'
import DashboardOtherProjects from '../components/Dashboard/DashboardOtherProjects'
import api from '../utils/Api'

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    minHeight: '100vh'
  },
  toolbar: {
    minHeight: '40px'
  }
}))

export default function Dashboard () {
  const classes = useStyles()
  const [ltiDetails, setLtiDetails] = React.useState(null)

  useEffect(() => {
    document.title = 'Dashboard - eSim '
  })

  useEffect(() => {
    const token = localStorage.getItem('esim_auth_token')
    const config = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }
    api.get('lti/exists', config)
      .then(res => {
        setLtiDetails(res.data)
      }).catch(err => {
        console.log(err)
        setLtiDetails(false)
      })
  }, [])

  return (
    <div className={classes.root}>
      <CssBaseline />

      <Layout resToolbar={<Header />} />

      <LayoutMain>
        <div className={classes.toolbar} />

        {/* Subroutes under dashboard section */}
        {ltiDetails !== null && <Switch>
          <Route exact path="/dashboard" component={() => <SchematicsList ltiDetails={ltiDetails}/>} />
          <Route exact path="/dashboard/schematics"><Redirect to="/dashboard" /></Route>
          <Route
            exact
            path="/dashboard/review_projects"
            component={DashboardOtherProjects}
          />
        </Switch>}
      </LayoutMain>
    </div>
  )
}
