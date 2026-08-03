// Main Layout for LTI Setup Page
import React, { useEffect } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'
import { CssBaseline } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

import { Header } from '../components/Shared/Navbar'
import Layout from '../components/Shared/Layout'
import LayoutMain from '../components/Shared/LayoutMain'
import SchematicsList from '../components/Dashboard/SchematicsList'
import LTIConfig from '../components/LTI/LTI'

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    minHeight: '100vh'
  },
  toolbar: {
    minHeight: '40px'
  }
}))

export default function LTISetup () {
  const classes = useStyles()
  // var auth = useSelector(state => state.authReducer)

  useEffect(() => {
    document.title = 'LTI - eSim'
    // eslint-disable-next-line
  }, [])

  return (
    <div className={classes.root}>
      <CssBaseline />

      <Layout resToolbar={<Header />} />

      <LayoutMain>
        <div className={classes.toolbar} />
        <Switch>
          <Route exact path="/dashboard" component={SchematicsList} />
          <Route exact path="/dashboard/schematics"><Redirect to="/dashboard" /></Route>
        </Switch>
        <LTIConfig />
      </LayoutMain>
    </div>
  )
}
