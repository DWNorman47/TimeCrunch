import React, { useState } from 'react';
import { fmtHours } from '../utils';
import EntryPanel from './EntryPanel';

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateKey(date) {
  return date.toISOString().substring(0, 10);
}

function formatMonthDay(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekDay(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m}${hour < 12 ? 'a' : 'p'}`;
}

function netHours(start, end, breakMinutes) {
  const s = new Date(`1970-01-01T${start}`);
  let e = new Date(`1970-01-01T${end}`);
  if (e <= s) e = new Date(`1970-01-02T${end}`); // midnight-crossing
  return (e - s) / 3600000 - (breakMinutes || 0) / 60;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimesheetView({ entries, language, projects = [], onRefresh }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEntry, setSelectedEntry] = useState(null);

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = toDateKey(new Date());

  // Group entries by date
  const byDate = {};
  entries.forEach(e => {
    const key = e.work_date.substring(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });

  const weekLabel = `${formatMonthDay(days[0])} \u2013 ${formatMonthDay(days[6])}, ${days[6].getFullYear()}`;

  const weekTotalHours = days.reduce((sum, d) => {
    const key = toDateKey(d);
    return sum + (byDate[key] || []).reduce((s, e) => s + netHours(e.start_time, e.end_time, e.break_minutes), 0);
  }, 0);

  const weekTotalMiles = days.reduce((sum, d) => {
    const key = toDateKey(d);
    return sum + (byDate[key] || []).reduce((s, e) => s + (parseFloat(e.mileage) || 0), 0);
  }, 0);

  return (
    <div style={styles.card} className="mobile-card">
      <div style={styles.header}>
        <div style={styles.navGroup}>
          <button style={styles.navBtn} onClick={prevWeek}>\u2039</button>
          <span style={styles.weekLabel}>{weekLabel}</span>
          <button style={styles.navBtn} onClick={nextWeek}>\u203a</button>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.weekTotal}>{fmtHours(weekTotalHours)}</span>
          {weekTotalMiles > 0 && <span style={styles.weekMiles}>\uD83D\uDE97 {weekTotalMiles.toFixed(1)} mi</span>}
          <button style={styles.todayBtn} onClick={goToday}>Today</button>
        </div>
      </div>

      <div style={styles.grid}>
        {days.map(day => {
          const key = toDateKey(day);
          const dayEntries = byDate[key] || [];
          const dayHours = dayEntries.reduce((s, e) => s + netHours(e.start_time, e.end_time, e.break_minutes), 0);
          const dayMiles = dayEntries.reduce((s, e) => s + (parseFloat(e.mileage) || 0), 0);
          const isToday = key === todayKey;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <div
              key={key}
              style={{
                ...styles.dayCol,
                background: isToday ? '#eff6ff' : isWeekend ? '#fafafa' : '#fff',
                borderTop: isToday ? '3px solid #1a56db' : '3px solid transparent',
              }}
            >
              <div style={styles.dayHeader}>
                <span style={{ ...styles.dayName, color: isToday ? '#1a56db' : '#6b7280' }}>
                  {formatWeekDay(day)}
                </span>
                <span style={{ ...styles.dayNum, fontWeight: isToday ? 700 : 400, color: isToday ? '#1a56db' : '#374151' }}>
                  {day.getDate()}
                </span>
              </div>

              <div style={styles.entriesArea}>
                {dayEntries.length === 0 ? (
                  <div style={styles.emptyDay} />
                ) : (
                  dayEntries.map(e => (
                    <div
                      key={e.id}
                      style={{
                        ...styles.entryPill,
                        borderLeft: `3px solid ${e.wage_type === 'prevailing' ? '#d97706' : '#1a56db'}`,
                        cursor: 'pointer',
                        outline: selectedEntry?.id === e.id ? '2px solid #1a56db' : 'none',
                      }}
                      onClick={() => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}
                    >
                      <div style={styles.pillProject}>{e.project_name}</div>
                      <div style={styles.pillTimes}>{formatTime(e.start_time)}\u2013{formatTime(e.end_time)}</div>
                      <div style={styles.pillHours}>{fmtHours(netHours(e.start_time, e.end_time, e.break_minutes))}</div>
                      {e.break_minutes > 0 && <div style={styles.pillBreak}>\u2615 {e.break_minutes}m</div>}
                      {e.mileage > 0 && <div style={styles.pillMileage}>\uD83D\uDE97 {parseFloat(e.mileage).toFixed(1)} mi</div>}
                    </div>
                  ))
                )}
              </div>

              {dayEntries.length > 0 && (
                <div style={styles.dayFooter}>
                  <span style={styles.dayTotal}>{fmtHours(dayHours)}</span>
                  {dayMiles > 0 && <span style={styles.dayMiles}>{dayMiles.toFixed(1)} mi</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedEntry && (
        <div style={styles.selectedPanel}>
          <div style={styles.selectedHeader}>
            <span style={styles.selectedTitle}>{selectedEntry.project_name} \u2014 {formatTime(selectedEntry.start_time)}\u2013{formatTime(selectedEntry.end_time)}</span>
            <button style={styles.closeBtn} onClick={() => setSelectedEntry(null)}>\u2715</button>
          </div>
          <EntryPanel
            entry={selectedEntry}
            projects={projects}
            onRefresh={async () => { setSelectedEntry(null); if (onRefresh) await onRefresh(); }}
            onDeleted={() => setSelectedEntry(null)}
            onClose={() => setSelectedEntry(null)}
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  navGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  navBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 18, cursor: 'pointer', color: '#374151', lineHeight: 1 },
  weekLabel: { fontWeight: 700, fontSize: 15, color: '#111827' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  weekTotal: { fontWeight: 700, fontSize: 16, color: '#1a56db' },
  weekMiles: { fontSize: 13, color: '#6b7280' },
  todayBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, overflowX: 'auto' },
  dayCol: { borderRadius: 8, padding: '8px 6px', minHeight: 120, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 },
  dayHeader: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 },
  dayName: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  dayNum: { fontSize: 18, lineHeight: 1.2 },
  entriesArea: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  emptyDay: { flex: 1 },
  entryPill: { background: '#f8faff', borderRadius: 5, padding: '5px 6px', fontSize: 11 },
  pillProject: { fontWeight: 700, color: '#1e3a5f', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pillTimes: { color: '#6b7280', fontSize: 10 },
  pillHours: { fontWeight: 700, color: '#1a56db', marginTop: 2 },
  pillBreak: { color: '#9ca3af', fontSize: 10 },
  pillMileage: { color: '#9ca3af', fontSize: 10 },
  dayFooter: { borderTop: '1px solid #e5e7eb', paddingTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dayTotal: { fontWeight: 700, fontSize: 12, color: '#1a56db' },
  dayMiles: { fontSize: 10, color: '#9ca3af' },
  selectedPanel: { marginTop: 16, padding: 16, background: '#f8faff', borderRadius: 10, border: '1px solid #93c5fd' },
  selectedHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  selectedTitle: { fontWeight: 700, fontSize: 14, color: '#1e3a5f' },
  closeBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' },
};
