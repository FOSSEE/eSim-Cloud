import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../utils/Api';
import store from '../../redux/store';

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const conversationIdRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const sendMessage = useCallback(async (text, context = { page: 'editor' }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg = { id: Date.now(), sender: 'user', text: trimmed, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    try {
      const token = store.getState().authReducer?.token || localStorage.getItem('esim_auth_token');
      const config = {};
      if (token) {
        config.headers = { Authorization: 'Token ' + token };
      }

      const payload = {
        message: trimmed,
        context: context,
      };

      if (conversationIdRef.current) {
        payload.conversation_id = conversationIdRef.current;
      }

      const response = await api.post('chat/message/', payload, config);

      if (isMounted.current) {
        if (response.data.conversation_id) {
          conversationIdRef.current = response.data.conversation_id;
        }
        const reply = response.data.reply || response.data.message || '';
        const sources = response.data.sources || [];
        const aiMsg = { id: Date.now() + 1, sender: 'assistant', text: reply, timestamp: new Date(), sources: sources };
        setMessages((prev) => [...prev, aiMsg]);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted.current) {
        setLoading(false);
        let errMsg = 'Something went wrong, please try again.';
        if (err.response && err.response.data) {
          if (err.response.data.error) {
            if (err.response.data.error === 'LLM unavailable') {
              errMsg = 'The AI assistant is temporarily unavailable. Please try again in a moment.';
            } else {
              errMsg = err.response.data.error;
            }
          } else if (err.response.data.detail) {
            errMsg = err.response.data.detail;
          } else if (typeof err.response.data === 'string') {
            errMsg = err.response.data;
          } else {
             errMsg = JSON.stringify(err.response.data);
          }
        }
        setError(errMsg);
      }
    }
  }, [loading]);

  const retryLastMessage = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find(m => m.sender === 'user');
    if (lastUserMessage) {
      sendMessage(lastUserMessage.text);
    }
  }, [messages, sendMessage]);

  return { messages, loading, error, sendMessage, retryLastMessage };
}
