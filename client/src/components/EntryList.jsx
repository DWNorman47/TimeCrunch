import React from 'react';
import api from '../api';

function formatHours(start, end) {
  const s = new Date(`1970-01-01T${start}`);
  const e = new Date(`1970-01-01T${end}`);
  const h = (e - s) / 3600000;
  return h.toFixed(2) + 'h';
}

function formatDate(dateStr) {
  const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

export default function EntryList({ entries, onDeleted }) {
  const handleDelete = async id => {
    if (!confirm('Delete this entry?')) return;
    try {
      await api.delete(`/time-entries/${id}`);
      onDeleted(id);
    } catch {
      alert('Failed to delete entry');
    }
  };

  if (entries.length === 0) {
    return <div style={styles.empty}>No entries yet. Log your first time entry above.</div>;
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Your Entries</h2>
      <div style={styles.list}>
        {entries.map(e => (
          <div key={e.id} style={styles.entry}>
            <div style={styles.entryMain}>
              <span style={styles.project}>{e.project_name}</span>
              <span style={styles.date}>{formatDate(e.work_date)}</span>
            </div>
            <div style={styles.entryDetail}>
              <span>{formatTime(e.start_time)} – {formatTime(e.end_time)} ({formatHours(e.start_time, e.end_time)})</span>
              <span style={{ ...styles.badge, background: e.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                {e.wage_type}
              </span>
            </div>
            {e.notes && <div style={styles.notes}>{e.notes}</div>}
            <button style={styles.deleteBtn} onClick={() => handleDelete(e.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  heading: { marginBottom: 16, fontSize: 18, fontWeight: 700 },
  empty: { textAlign: 'center', color: '#888', padding: 32 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  entry: { border: '1px solid #eee', borderRadius: 8, padding: 14, position: 'relative' },
  entryMain: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  project: { fontWeight: 700, fontSize: 15 },
  date: { color: '#666', fontSize: 13 },
  entryDetail: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#555' },
  badge: { color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 },
  notes: { marginTop: 6, fontSize: 12, color: '#888', fontStyle: 'italic' },
  deleteBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#ccc', fontSize: 12, cursor: 'pointer' },
};
