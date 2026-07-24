import React from 'react'
import { Box, Paper, Typography, Button, ExpansionPanel, ExpansionPanelSummary, ExpansionPanelDetails } from '@material-ui/core'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'

class ErrorBoundary extends React.Component {
  constructor (props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError (error) {
    return { hasError: true, error }
  }

  componentDidCatch (error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState(prevState => ({ ...prevState, errorInfo }))
  }

  render () {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%" p={1} style={{ color: 'red', overflow: 'hidden' }}>
            <Typography variant="caption" align="center" style={{ wordBreak: 'break-word' }}>
              Error
            </Typography>
            <Button size="small" color="secondary" onClick={() => window.location.reload()} style={{ minWidth: 'auto', padding: '2px 4px', marginTop: '4px' }}>
              Reload
            </Button>
          </Box>
        )
      }

      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%" minHeight="400px" p={3} style={{ boxSizing: 'border-box', overflow: 'hidden' }}>
          <Paper elevation={3} style={{ padding: '32px', maxWidth: '600px', textAlign: 'center', overflow: 'hidden' }}>
            <Typography variant="h5" gutterBottom>
              {this.props.fallbackTitle || 'The editor encountered an unexpected error'}
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ marginBottom: '24px' }}>
              This is usually caused by a component issue or a network error. Your circuit data may still be saved.
            </Typography>
            <Button variant="contained" color="primary" onClick={() => window.location.reload()} style={{ marginBottom: '24px' }}>
              Reload Editor
            </Button>
            <ExpansionPanel style={{ textAlign: 'left', boxShadow: 'none', border: '1px solid #e0e0e0' }}>
              <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Technical details</Typography>
              </ExpansionPanelSummary>
              <ExpansionPanelDetails>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: '12px' }}>
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </ExpansionPanelDetails>
            </ExpansionPanel>
          </Paper>
        </Box>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
