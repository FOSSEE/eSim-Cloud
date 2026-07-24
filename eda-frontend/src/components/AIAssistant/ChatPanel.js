// Manual test checklist:
// 1. Open/close the drawer
// 2. Send a message while logged out
// 3. Send a message while logged in
// 4. Trigger and recover from an error via Retry
// 5. Verify mobile width behavior (full width < 600px)
// 6. Verify circuit context included vs. excluded
// 7. Verify Ollama down -> clear error message
// 8. Verify slow response -> loading state holds correctly throughout

import React, { useState, useRef, useEffect } from 'react';
import { Drawer, Fab, Typography, makeStyles, IconButton, CircularProgress, Button } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import ChatIcon from '@material-ui/icons/Chat';
import CloseIcon from '@material-ui/icons/Close';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import useChat from './useChat';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import { getEditorGraph } from '../SchematicEditor/Helper/ComponentDrag';
import { buildEditorContext } from './contextBuilder';
import { useSelector } from 'react-redux';
import { buildNetlistFromGraph } from '../SchematicEditor/Helper/NetlistExporter';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import EmptyState from '../Shared/EmptyState';

const drawerWidth = 360;

const useStyles = makeStyles((theme) => ({
  fab: {
    position: 'fixed',
    bottom: theme.spacing(3),
    right: theme.spacing(3),
    zIndex: 1300,
  },
  drawerPaper: {
    width: '100%',
    [theme.breakpoints.up('sm')]: {
      width: drawerWidth,
    },
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1250, // Chosen to float above the mxGraph canvas/toolbar (<1000) but not permanently block RightSidebar layout.
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
  },
  closeButton: {
    color: theme.palette.text.secondary,
  },
}));

export default function ChatPanel() {
  const classes = useStyles();
  const lastSimulationError = useSelector(state => state.simulationReducer?.lastSimulationError || null);
  const [open, setOpen] = useState(false);
  const [includeCircuit, setIncludeCircuit] = useState(true);
  const [prefillMessage, setPrefillMessage] = useState('');
  const endOfMessagesRef = useRef(null);
  const inputRef = useRef(null);

  const { messages, loading, error, sendMessage, retryLastMessage } = useChat();

  const handleSend = (text) => {
    if (includeCircuit) {
      const graph = getEditorGraph();
      let netlistSnippet = null;
      if (graph) {
        try {
          const netlistData = buildNetlistFromGraph(graph);
          if (netlistData && netlistData.main) {
            netlistSnippet = (netlistData.models ? netlistData.models + '\n' : '') + netlistData.main;
          }
        } catch (e) {
          console.log("Could not build netlist snippet for context", e);
        }
      }
      const editorCtx = buildEditorContext(graph, lastSimulationError, netlistSnippet);
      
      // Enforce 8KB limit (7500 chars roughly to be safe)
      if (JSON.stringify(editorCtx).length > 7500) {
        editorCtx.components = [];
        editorCtx.analysisHints = {};
      }
      
      sendMessage(text, { page: 'editor', ...editorCtx });
    } else {
      sendMessage(text);
    }
  };

  const toggleDrawer = () => setOpen(!open);

  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, error, open]);

  useEffect(() => {
    const handleOpenChatWithPrompt = (e) => {
      setOpen(true);
      if (e.detail && e.detail.message) {
        setPrefillMessage(e.detail.message);
      }
      if (e.detail && e.detail.includeContext) {
        setIncludeCircuit(true);
      }
    };
    window.addEventListener('esim-open-chat-with-prompt', handleOpenChatWithPrompt);
    return () => window.removeEventListener('esim-open-chat-with-prompt', handleOpenChatWithPrompt);
  }, []);

  // The Escape key handler has been moved to the Drawer's onKeyDown prop.

  useEffect(() => {
    if (open && !loading && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [open, loading]);

  return (
    <>
      {!open && (
        <Fab 
          color="primary" 
          className={classes.fab} 
          onClick={toggleDrawer}
          aria-label="open chat"
        >
          <ChatIcon />
        </Fab>
      )}

      <Drawer
        anchor="right"
        open={open}
        onClose={toggleDrawer}
        variant="persistent"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        classes={{
          paper: classes.drawerPaper,
        }}
      >
        <div className={classes.header}>
          <Typography variant="h6">AI Assistant</Typography>
          <IconButton onClick={toggleDrawer} className={classes.closeButton} size="small" aria-label="close chat">
            <CloseIcon />
          </IconButton>
        </div>
        
        <div className={classes.messagesContainer}>
          {messages.length === 0 && (
            <EmptyState
              icon={<ChatBubbleOutlineIcon />}
              title="How can I help you?"
              description="Ask about components, simulation, or eSim usage."
              minHeight="200px"
            />
          )}
          {messages.map((msg) => (
            <ChatMessage 
              key={msg.id} 
              message={msg.text || ''} 
              isUser={msg.sender === 'user'} 
              sources={msg.sources || []} 
            />
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, paddingLeft: 10 }}>
              <CircularProgress size={16} style={{ color: '#aaa', marginRight: 10 }} />
              <Typography variant="body2" style={{ color: '#aaa' }}>Thinking...</Typography>
            </div>
          )}
          {error && (
            <Alert 
              severity="error" 
              style={{ marginTop: 10 }}
              action={
                <Button color="inherit" size="small" onClick={retryLastMessage}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          <div ref={endOfMessagesRef} />
        </div>

        <div style={{ padding: '0 16px', borderTop: '1px solid #555' }}>
          <FormControlLabel
            control={
              <Checkbox 
                checked={includeCircuit} 
                onChange={(e) => setIncludeCircuit(e.target.checked)} 
                color="primary" 
                size="small" 
                style={{ color: '#aaa' }}
              />
            }
            label={<Typography variant="caption" style={{ color: '#aaa' }}>Include current circuit</Typography>}
          />
        </div>

        <ChatInput 
          onSend={handleSend} 
          disabled={loading} 
          inputRef={inputRef} 
          prefillMessage={prefillMessage} 
          onPrefillClear={() => setPrefillMessage('')} 
        />
      </Drawer>
    </>
  );
}
