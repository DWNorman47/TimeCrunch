import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function formatTime(str) {
  return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CompanyChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const load = () =>
    api.get('/chat')
      .then(r => setMessages(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 15000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async e => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const r = await api.post('/chat', { body });
      setMessages(prev => [...prev, r.data]);
      setBody('');
    } finally { setSending(false); }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>💬 Team Chat</span>
        <span style={styles.sub}>Messages visible to all workers & admin</span>
      </div>

      <div style={styles.thread}>
        {loading ? (
          <p style={styles.hint}>Loading...</p>
        ) : messages.length === 0 ? (
          <p style={styles.hint}>No messages yet. Send one to get started.</p>
        ) : (
          messages.map(m => {
            const isMine = m.sender_id === user?.id;
            return (
              <div key={m.id} style={{ ...styles.bubbleWrap, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...styles.bubble, ...(isMine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                  <div style={styles.meta}>
                    <span style={styles.sender}>
                      {isMine ? 'You' : m.sender_name}
                      {m.sender_role === 'admin' && <span style={styles.adminBadge}> Admin</span>}
                    </span>
                    <span style={styles.time}>{formatTime(m.created_at)}</span>
                  </div>
                  <div style={styles.msgBody}>{m.body}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={styles.form}>
        <input
          style={styles.input}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Send a message to the team..."
          disabled={sending}
        />
        <button style={styles.sendBtn} type="submit" disabled={sending || !body.trim()}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  title: { fontWeight: 700, fontSize: 15, color: '#1a1a1a' },
  sub: { fontSize: 11, color: '#9ca3af' },
  thread: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 340, background: '#fafafa' },
  hint: { color: '#9ca3af', fontSize: 13, textAlign: 'center', margin: 'auto' },
  bubbleWrap: { display: 'flex' },
  bubble: { maxWidth: '80%', padding: '8px 12px', borderRadius: 10, fontSize: 13 },
  bubbleMine: { background: '#dbeafe', color: '#1e3a5f', borderBottomRightRadius: 3 },
  bubbleTheirs: { background: '#fff', border: '1px solid #e5e7eb', color: '#374151', borderBottomLeftRadius: 3 },
  meta: { display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 },
  sender: { fontSize: 11, fontWeight: 700, color: '#6b7280' },
  adminBadge: { background: '#1a56db', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, marginLeft: 4 },
  time: { fontSize: 10, color: '#9ca3af' },
  msgBody: { lineHeight: 1.5 },
  form: { display: 'flex', borderTop: '1px solid #e5e7eb' },
  input: { flex: 1, padding: '10px 14px', border: 'none', fontSize: 13, outline: 'none', background: '#fff' },
  sendBtn: { padding: '10px 18px', background: '#1a56db', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
};
