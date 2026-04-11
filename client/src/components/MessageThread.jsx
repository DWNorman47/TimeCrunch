import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

export default function MessageThread({ entryId, currentUserId, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get(`/time-entries/${entryId}/messages`)
      .then(r => { setMessages(r.data); if (onUnreadChange) onUnreadChange(); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entryId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async e => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const r = await api.post(`/time-entries/${entryId}/messages`, { body });
      setMessages(prev => [...prev, r.data]);
      setBody('');
    } finally { setSending(false); }
  };

  const formatTime = str => new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div style={styles.wrap}>
      {loading ? (
        <p style={styles.loading}>Loading...</p>
      ) : messages.length === 0 ? (
        <p style={styles.empty}>No messages yet. Send one to flag an issue or ask a question.</p>
      ) : (
        <div style={styles.thread}>
          {messages.map(m => {
            const isMine = m.sender_id === currentUserId;
            return (
              <div key={m.id} style={{ ...styles.bubble, ...(isMine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                <div style={styles.bubbleMeta}>
                  <span style={styles.sender}>{isMine ? 'You' : m.sender_name}</span>
                  <span style={styles.time}>{formatTime(m.created_at)}</span>
                </div>
                <div style={styles.bubbleBody}>{m.body}</div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
      <form onSubmit={send} style={styles.form}>
        <input
          style={styles.input}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a message..."
          disabled={sending}
        />
        <button style={{ ...styles.sendBtn, ...((sending || !body.trim()) ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} type="submit" disabled={sending || !body.trim()}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: { marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
  loading: { padding: '10px 12px', color: '#9ca3af', fontSize: 13, margin: 0 },
  empty: { padding: '10px 12px', color: '#9ca3af', fontSize: 12, fontStyle: 'italic', margin: 0 },
  thread: { maxHeight: 200, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' },
  bubble: { maxWidth: '80%', padding: '7px 10px', borderRadius: 8, fontSize: 13 },
  bubbleMine: { alignSelf: 'flex-end', background: '#dbeafe', color: '#1e3a5f' },
  bubbleTheirs: { alignSelf: 'flex-start', background: '#fff', border: '1px solid #e5e7eb', color: '#374151' },
  bubbleMeta: { display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 },
  sender: { fontSize: 11, fontWeight: 700, color: '#6b7280' },
  time: { fontSize: 10, color: '#9ca3af' },
  bubbleBody: { lineHeight: 1.5 },
  form: { display: 'flex', borderTop: '1px solid #e5e7eb' },
  input: { flex: 1, padding: '8px 12px', border: 'none', fontSize: 13, outline: 'none', background: '#fff' },
  sendBtn: { padding: '8px 14px', background: '#1a56db', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
};
