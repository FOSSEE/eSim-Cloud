import React, { useEffect } from 'react'
import {
  Typography,
  Grid,
  Paper,
  Button,
  CircularProgress
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import ArrowBackIcon from '@material-ui/icons/ArrowBack'
import { Bar, Line } from 'react-chartjs-2'
import queryString from 'query-string'
import api from '../../utils/Api'

const useStyles = makeStyles((theme) => ({
  statPaper: {
    padding: theme.spacing(3),
    textAlign: 'center'
  },
  statValue: {
    fontSize: 36,
    fontWeight: 600
  },
  statLabel: {
    fontSize: 14,
    color: '#888'
  },
  chartPaper: {
    padding: theme.spacing(3),
    marginTop: theme.spacing(3)
  },
  root: {
    padding: theme.spacing(3)
  }
}))

export default function AnalyticsDashboard () {
  const classes = useStyles()
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  useEffect(() => {
    var url = queryString.parse(window.location.href.split('analytics')[1])
    const token = localStorage.getItem('esim_auth_token')
    const config = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }
    api.get(`/lti/analytics/${url.id}/`, config)
      .then((res) => {
        setData(res.data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setError('Could not load analytics for this assignment')
        setLoading(false)
      })
  }, [])

  const handleBack = () => {
    var url = queryString.parse(window.location.href.split('analytics')[1])
    window.location.href = `/eda/#/lti?id=${url.id}`
  }

  if (loading) {
    return (
      <div className={classes.root} style={{ textAlign: 'center' }}>
        <CircularProgress />
      </div>
    )
  }

  if (error) {
    return (
      <div className={classes.root}>
        <Typography color="error">{error}</Typography>
      </div>
    )
  }

  const distributionChartData = {
    labels: data.score_distribution.map((d) => d.range),
    datasets: [{
      label: 'Number of students',
      data: data.score_distribution.map((d) => d.count),
      backgroundColor: 'rgba(63, 81, 181, 0.7)'
    }]
  }

  const failuresChartData = {
    labels: data.common_failures.map((f) => f.parameter),
    datasets: [{
      label: 'Times incorrect',
      data: data.common_failures.map((f) => f.count),
      backgroundColor: 'rgba(220, 53, 69, 0.7)'
    }]
  }

  const timeChartData = {
    labels: data.submissions_over_time.map((t) => t.date),
    datasets: [{
      label: 'Submissions',
      data: data.submissions_over_time.map((t) => t.count),
      borderColor: 'rgba(76, 175, 80, 1)',
      backgroundColor: 'rgba(76, 175, 80, 0.2)',
      fill: true
    }]
  }

  const handleExportCSV = () => {
    var rows = [['Metric', 'Value']]
    rows.push(['Total Submissions', data.total_submissions])
    rows.push(['Average Score', data.average_score])
    rows.push(['Median Score', data.median_score])
    rows.push([])
    rows.push(['Score Range', 'Count'])
    data.score_distribution.forEach((d) => {
      rows.push([d.range, d.count])
    })
    rows.push([])
    rows.push(['Parameter', 'Times Incorrect'])
    data.common_failures.forEach((f) => {
      rows.push([f.parameter, f.count])
    })
    rows.push([])
    rows.push(['Date', 'Submissions'])
    data.submissions_over_time.forEach((t) => {
      rows.push([t.date, t.count])
    })
    var csvContent = rows.map((r) => r.join(',')).join('\n')
    var blob = new Blob([csvContent], { type: 'text/csv' })
    var link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'assignment_analytics.csv'
    link.click()
  }

  return (
    <div className={classes.root}>
      <Button
        variant="contained"
        color="primary"
        startIcon={<ArrowBackIcon />}
        onClick={handleBack}
      >
        Return to LTI App
      </Button>
      <Button
        variant="contained"
        color="primary"
        style={{ marginLeft: 8 }}
        onClick={handleExportCSV}
      >
        Export CSV
      </Button>
      <Typography variant="h5" style={{ margin: '24px 0' }}>
        Assignment Analytics
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={4}>
          <Paper className={classes.statPaper}>
            <div className={classes.statValue}>
              {data.total_submissions}
            </div>
            <div className={classes.statLabel}>Total Submissions</div>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper className={classes.statPaper}>
            <div className={classes.statValue}>
              {data.average_score !== null
                ? (data.average_score * 100).toFixed(1) + '%'
                : 'N/A'}
            </div>
            <div className={classes.statLabel}>Average Score</div>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper className={classes.statPaper}>
            <div className={classes.statValue}>
              {data.median_score !== null
                ? (data.median_score * 100).toFixed(1) + '%'
                : 'N/A'}
            </div>
            <div className={classes.statLabel}>Median Score</div>
          </Paper>
        </Grid>
      </Grid>

      <Paper className={classes.chartPaper}>
        <Typography variant="h6">Score Distribution</Typography>
        {data.total_submissions > 0
          ? <div style={{ height: 300 }}>
              <Bar
                data={distributionChartData}
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    yAxes: [{
                      ticks: { beginAtZero: true, precision: 0 }
                    }]
                  }
                }}
              />
            </div>
          : <Typography color="textSecondary">
              No submissions yet
            </Typography>}
      </Paper>

      <Paper className={classes.chartPaper}>
        <Typography variant="h6">Most Common Mistakes</Typography>
        {data.common_failures.length > 0
          ? <div style={{ height: 300 }}>
              <Bar
                data={failuresChartData}
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    yAxes: [{
                      ticks: { beginAtZero: true, precision: 0 }
                    }]
                  }
                }}
              />
            </div>
          : <Typography color="textSecondary">
              No failure data available yet
            </Typography>}
      </Paper>

      <Paper className={classes.chartPaper}>
        <Typography variant="h6">Submissions Over Time</Typography>
        {data.submissions_over_time.length > 0
          ? <div style={{ height: 300 }}>
              <Line
                data={timeChartData}
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    yAxes: [{
                      ticks: { beginAtZero: true, precision: 0 }
                    }]
                  }
                }}
              />
            </div>
          : <Typography color="textSecondary">
              No submission history yet
            </Typography>}
      </Paper>
    </div>
  )
}
