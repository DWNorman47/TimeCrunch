import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function formatTime(str) {
  return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Worker view — shows their own private thread with admin
function WorkerChat({ userId }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const load = () =>
    api.get('/chat').then(r => setMessages(r.data)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(pollRef.current); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
        <span style={styles.title}>💬 Messages with Admin</span>
        <span style={styles.sub}>Private — only you and your manager can see this</span>
      </div>
      <Thread messages={messages} loading={loading} currentUserId={user?.id} bottomRef={bottomRef} />
      <ChatForm body={body} setBody={setBody} sending={sending} onSubmit={send} />
    </div>
  );
}

// Admin view — worker picker + thread
function AdminChat({ workers }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [threads, setThreads] = useState([]); // workers with recent messages
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  // Load worker thread list
  useEffect(() => {
    api.get('/chat').then(r => setThreads(r.data)).catch(() => {});
  }, []);

  // Load selected worker's thread
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setLoading(true);
    clearInterval(pollRef.current);
    const fetch = () => api.get(`/chat?worker_id=${selectedId}`).then(r => setMessages(r.data)).catch(() => {}).finally(() => setLoading(false));
    fetch();
    pollRef.current = setInterval(fetch, 30000);
    return () => clearInterval(pollRef.current);
  }, [selectedId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async e => {
    e.preventDefault();
    if (!body.trim() || !selectedId) return;
    setSending(true);
    try {
      const r = await api.post('/chat', { body, worker_id: selectedId });
      setMessages(prev => [...prev, r.data]);
      setBody('');
    } finally { setSending(false); }
  };

  const workerHasThread = id => threads.some(t => String(t.worker_id) === String(id));

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>💬 Worker Messages</span>
        <span style={styles.sub}>Private — visible only to you and the selected worker</span>
      </div>
      <div style={styles.workerPicker}>
        <select style={styles.pickerSelect} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Select a worker...</option>
          {workers.filter(w => w.role !== 'admin').map(w => (
            <option key={w.id} value={w.id}>
              {w.full_name}{workerHasThread(w.id) ? ' 💬' : ''}
            </option>
          ))}
        </select>
      </div>
      {selectedId ? (
        <>
          <Thread messages={messages} loading={loading} currentUserId={user?.id} bottomRef={bottomRef} />
          <ChatForm body={body} setBody={setBody} sending={sending} onSubmit={send} />
        </>
      ) : (
        <p style={styles.hint}>Select a worker above to view or start a conversation.</p>
      )}
    </div>
  );
}

function Thread({ messages, loading, currentUserId, bottomRef }) {
  return (
    <div style={styles.thread}>
      {loading ? (
        <p style={styles.hintCenter}>Loading...</p>
      ) : messages.length === 0 ? (
        <p style={styles.hintCenter}>No messages yet.</p>
      ) : (
        messages.map(m => {
          const isMine = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ ...styles.bubbleWrap, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...styles.bubble, ...(isMine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                <div style={styles.meta}>
                  <span style={styles.sender}>
                    {isMine ? 'You' : m.sender_name}
                    {m.sender_role === 'admin' && !isMine && <span style={styles.adminBadge}> Admin</span>}
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
  );
}

function ChatForm({ body, setBody, sending, onSubmit }) {
  return (
    <form onSubmit={onSubmit} style={styles.form}>
      <input
        style={styles.input}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Type a message..."
        maxLength={1000}
        disabled={sending}
      />
      <button style={styles.sendBtn} type="submit" disabled={sending || !body.trim()}>
        {sending ? '...' : 'Send'}
      </button>
    </form>
  );
}

export default function CompanyChat({ workers }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <AdminChat workers={workers || []} />;
  return <WorkerChat userId={user.id} />;
}

const styles = {
  wrap: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontWeight: 700, fontSize: 15, color: '#1a1a1a' },
  sub: { fontSize: 11, color: '#9ca3af' },
  workerPicker: { padding: '10px 14px', borderBottom: '1px solid #f0f0f0' },
  pickerSelect: { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, color: '#374151' },
  thread: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 340, background: '#fafafa' },
  hint: { padding: '16px', color: '#9ca3af', fontSize: 13 },
  hintCenter: { color: '#9ca3af', fontSize: 13, textAlign: 'center', margin: 'auto' },
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
