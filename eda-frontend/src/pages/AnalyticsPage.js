// Main Layout for Analytics Page
import React, { useEffect } from 'react'
import { CssBaseline } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import { Header } from '../components/Shared/Navbar'
import Layout from '../components/Shared/Layout'
import LayoutMain from '../components/Shared/LayoutMain'
import DashboardSidebar from '../components/Dashboard/DashboardSidebar'
import AnalyticsDashboard from '../components/LTI/AnalyticsDashboard'

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    minHeight: '100vh'
  },
  toolbar: {
    minHeight: '40px'
  }
}))

export default function Analytics () {
  const classes = useStyles()
  useEffect(() => {
    document.title = 'Analytics - eSim'
    // eslint-disable-next-line
  }, [])
  return (
    <div className={classes.root}>
      <CssBaseline />
      <Layout resToolbar={<Header />} sidebar={<DashboardSidebar />} />
      <LayoutMain>
        <div className={classes.toolbar} />
        <AnalyticsDashboard />
      </LayoutMain>
    </div>
  )
}
