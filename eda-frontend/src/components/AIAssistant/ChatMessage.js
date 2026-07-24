import React from 'react';
import { Paper, Typography, makeStyles, ExpansionPanel, ExpansionPanelSummary, ExpansionPanelDetails, List, ListItem, Link } from '@material-ui/core';
import LinkIcon from '@material-ui/icons/Link';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import PropTypes from 'prop-types';

const useStyles = makeStyles((theme) => ({
  messageRow: {
    display: 'flex',
    width: '100%',
    marginBottom: theme.spacing(2),
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    padding: theme.spacing(1, 2),
    maxWidth: '85%',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  userBubble: {
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
  },
  assistantBubble: {
    backgroundColor: theme.palette.grey[100],
    color: theme.palette.text.primary,
  },
  sourcesAccordion: {
    marginTop: theme.spacing(1),
    backgroundColor: theme.palette.grey[50],
    color: theme.palette.text.secondary,
  },
  sourcesSummary: {
    minHeight: 36,
    '& .MuiExpansionPanelSummary-content': {
      margin: '8px 0',
      alignItems: 'center',
    },
  },
  sourcesDetails: {
    padding: theme.spacing(0, 1, 1, 1),
    display: 'flex',
    flexDirection: 'column',
  },
  sourceItem: {
    padding: theme.spacing(0.5, 1),
  },
  sourceLink: {
    color: theme.palette.primary.main,
    wordBreak: 'break-word',
  },
  sourceText: {
    wordBreak: 'break-word',
  }
}));

export default function ChatMessage({ message, isUser, sources }) {
  const classes = useStyles();

  return (
    <div className={`${classes.messageRow} ${isUser ? classes.userRow : classes.assistantRow}`}>
      <Paper className={`${classes.bubble} ${isUser ? classes.userBubble : classes.assistantBubble}`}>
        <Typography variant="body2">
          {message}
        </Typography>
        {!isUser && sources && sources.length > 0 && (
          <ExpansionPanel className={classes.sourcesAccordion}>
            <ExpansionPanelSummary expandIcon={<ExpandMoreIcon style={{color: '#ddd'}}/>} className={classes.sourcesSummary}>
              <LinkIcon fontSize="small" style={{ marginRight: 8 }} />
              <Typography variant="caption">Sources</Typography>
            </ExpansionPanelSummary>
            <ExpansionPanelDetails className={classes.sourcesDetails}>
              <List disablePadding>
                {(sources || []).map((source, idx) => (
                  <ListItem key={idx} className={classes.sourceItem} disableGutters>
                    {source.url && (source.url.startsWith('http://') || source.url.startsWith('https://')) ? (
                      <Link href={source.url} target="_blank" rel="noopener noreferrer" className={classes.sourceLink} variant="caption">
                        {source.title}
                      </Link>
                    ) : (
                      <span className={classes.sourceText}>
                        <Typography variant="caption" style={{ color: '#ddd' }}>
                          {source.title || 'eSim Documentation'}
                        </Typography>
                      </span>
                    )}
                  </ListItem>
                ))}
              </List>
            </ExpansionPanelDetails>
          </ExpansionPanel>
        )}
      </Paper>
    </div>
  );
}

ChatMessage.propTypes = {
  message: PropTypes.string.isRequired,
  isUser: PropTypes.bool.isRequired,
  sources: PropTypes.arrayOf(PropTypes.shape({
    title: PropTypes.string,
    url: PropTypes.string
  }))
};

ChatMessage.defaultProps = {
  sources: []
};
