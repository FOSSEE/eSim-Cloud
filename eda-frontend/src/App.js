/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react'
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom'
import CircularProgress from '@material-ui/core/CircularProgress'

import Navbar from './components/Shared/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import PageNotFound from './pages/PageNotFound'
import SchematicEditor from './pages/SchematiEditor'
import ModelBuilder from './components/ModelBuilder/ModelBuilder'
import SubcircuitBuilder from './components/ModelBuilder/SubcircuitBuilder'
import CustomComponentLauncher from './components/ModelBuilder/CustomComponentLauncher'

import Simulator from './pages/Simulator'
import Gallery from './pages/Gallery'
import PublicProjects from './pages/Projects'
import Dashboard from './pages/Dashboard'
import SignUp from './pages/signUp'
import ResetPassword from './pages/ResetPassword/Initiation'
import ResetPasswordConfirm from './pages/ResetPassword/Confirmation'
import ChangePassword from './pages/Account/ChangePassword'
import Submissions from './pages/SubmissionPage'
import LTISetup from './pages/LTISetup'
import { useSelector, useDispatch } from 'react-redux'
import { loadUser } from './redux/actions/index'
import ProjectPage from './pages/ProjectPage'

// Controls Private routes, this are accessible for authenticated users.  [ e.g : dashboard ]
// and restricted routes disabled for authenticated users. [ e.g : login , signup ]
function PrivateRoute ({ component: Component, ...rest }) {
  const auth = useSelector(state => state.authReducer)
  const [count, setcount] = useState(0)
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(loadUser())
  }, [dispatch])

  if (count === 0) {
    setcount(1)
    dispatch(loadUser())
  }

  return <Route {...rest} render={props => {
    if (auth.isLoading) {
      return <CircularProgress style={{ margin: '50vh 50vw' }} />
    } else if (!auth.isAuthenticated) {
      return <Redirect to="/login" />
    } else {
      return <Component {...props} />
    }
  }} />
}

// Public routes accessible to all users. [ e.g. editor, gallery ]
function PublicRoute ({ component: Component, restricted, nav, ...rest }) {
  const auth = useSelector(state => state.authReducer)
  const dispatch = useDispatch()

  useEffect(() => dispatch(loadUser()), [dispatch])

  return <Route {...rest} render={props => {
    if (auth.isLoading) {
      return <CircularProgress style={{ margin: '50vh 50vw' }} />
    } else if (auth.isAuthenticated && restricted) {
      return <Redirect to="/dashboard" />
    } else if (nav) {
      return (<><Navbar /><Component {...props} /></>)
    } else {
      return <Component {...props} />
    }
  }} />
}

function App () {
  return (
    // Handles Routing for an application
    <HashRouter>
      <Switch>
        <PublicRoute exact path="/login" restricted={true} nav={false} component={Login} />
        <PublicRoute exact path="/signup" restricted={true} nav={false} component={SignUp} />
        <PublicRoute exact path="/reset-password" restricted={true} nav={false} component={ResetPassword} />
        <PublicRoute exact path="/password/reset/confirm/:id/:token" restricted={true} nav={false} component={ResetPasswordConfirm} />
        <PublicRoute exact path="/" restricted={false} nav={true} component={Home} />
        {localStorage.getItem('esim_token') !== null
          ? <PublicRoute exact path="/editor" restricted={false} nav={false} component={SchematicEditor} />
          : <Route path="/editor" component={SchematicEditor} />
        }
        <PublicRoute exact path="/project" restricted={false} nav={true} component={ProjectPage} />
        <PublicRoute exact path="/simulator/ngspice" restricted={false} nav={true} component={Simulator} />
        <PublicRoute exact path="/gallery" restricted={false} nav={true} component={Gallery} />
        <PublicRoute exact path="/projects" restricted={false} nav={true} component={PublicProjects} />
        <PrivateRoute path="/dashboard" component={Dashboard} />
        <PrivateRoute path="/submission" component={Submissions} />
        <PrivateRoute path="/lti" component = {LTISetup} />
        <PrivateRoute path="/account/change_password" component={ChangePassword} />
        {/* Catch-all route for unmatched URLs - should be last */}
        <PublicRoute exact path="/model-builder" restricted={false} nav={true} component={ModelBuilder} />
        <PublicRoute exact path="/subcircuit-builder" restricted={false} nav={true} component={SubcircuitBuilder} />
        <PublicRoute exact path="/custom-components" restricted={false} nav={true} component={CustomComponentLauncher} />
        <Route path="*" component={PageNotFound} />
      </Switch>
    </HashRouter>
  )
}

export default App
