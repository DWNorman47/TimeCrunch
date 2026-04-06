import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';

// Document type metadata
const DOC_TYPES = [
  { value: 'coi',      label: 'COI',              color: '#d97706', bg: '#fef3c7', hasExpiry: true  },
  { value: 'w9',       label: 'W-9',              color: '#1d4ed8', bg: '#dbeafe', hasExpiry: false },
  { value: 'w2',       label: 'W-2',              color: '#8b5cf6', bg: '#ede9fe', hasExpiry: false },
  { value: 'contract', label: 'Contract',         color: '#059669', bg: '#d1fae5', hasExpiry: true  },
  { value: 'license',  label: 'License',          color: '#0891b2', bg: '#cffafe', hasExpiry: true  },
  { value: 'other',    label: 'Other',            color: '#6b7280', bg: '#f3f4f6', hasExpiry: false },
];

const DOC_META = Object.fromEntries(DOC_TYPES.map(d => [d.value, d]));

function fmt(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function expiryStatus(expiresAt, t) {
  if (!expiresAt) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt + 'T00:00:00');
  const days = Math.round((exp - today) / 86400000);
  if (days < 0)  return { label: t.expiryExpired, color: '#dc2626', bg: '#fee2e2' };
  if (days <= 30) return { label: `${days}${t.expiryInDays}`, color: '#d97706', bg: '#fef3c7' };
  return { label: exp.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), color: '#059669', bg: '#d1fae5' };
}

// ── Client Form ───────────────────────────────────────────────────────────────

const BLANK_CLIENT = { name: '', contact_name: '', contact_email: '', contact_phone: '', address: '', notes: '' };

function ClientForm({ initial = BLANK_CLIENT, onSaved, onCancel }) {
  const t = useT();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!initial.id;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim()) { setError(t.clientNameRequired); return; }
    setSaving(true); setError('');
    try {
      const r = isEdit
        ? await api.patch(`/admin/clients/${initial.id}`, form)
        : await api.post('/admin/clients', form);
      onSaved(r.data, isEdit);
    } catch (err) {
      setError(err.response?.data?.error || t.failedSaveClient);
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      <h3 style={s.formTitle}>{isEdit ? t.editClientTitle : t.newClientTitle}</h3>

      <div style={s.row}>
        <div style={s.field}>
          <label style={s.label}>{t.clientCompanyName} *</label>
          <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="ABC Construction Inc." required />
        </div>
        <div style={s.field}>
          <label style={s.label}>{t.contactName}</label>
          <input style={s.input} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Jane Smith" />
        </div>
      </div>

      <div style={s.row}>
        <div style={s.field}>
          <label style={s.label}>{t.contactEmail}</label>
          <input style={s.input} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="jane@example.com" />
        </div>
        <div style={s.field}>
          <label style={s.label}>{t.contactPhone}</label>
          <input style={s.input} type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="(555) 000-0000" />
        </div>
      </div>

      <div style={s.field}>
        <label style={s.label}>{t.address}</label>
        <input style={s.input} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, City, State 00000" />
      </div>

      <div style={s.field}>
        <label style={s.label}>{t.notes} <span style={s.opt}>({t.optional})</span></label>
        <textarea style={s.textarea} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional information..." />
      </div>

      {error && <p style={s.error}>{error}</p>}

      <div style={s.formActions}>
        <button style={s.saveBtn} type="submit" disabled={saving}>{saving ? '…' : isEdit ? t.saveChanges : t.addClient}</button>
        <button style={s.cancelBtn} type="button" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

// ── Document Upload ───────────────────────────────────────────────────────────

function DocUploadForm({ clientId, onUploaded }) {
  const t = useT();
  const [docType, setDocType] = useState('coi');
  const [direction, setDirection] = useState('from_client');
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const needsExpiry = DOC_META[docType]?.hasExpiry;

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data: doc } = await api.post(`/admin/clients/${clientId}/documents/upload`, {
        dataUrl,
        name: file.name,
        doc_type: docType,
        expires_at: expiresAt || null,
        direction,
      });
      onUploaded(doc);
      setExpiresAt('');
      fileRef.current.value = '';
    } catch (err) {
      setError(err.response?.data?.error || t.uploadFailed);
    } finally { setUploading(false); }
  };

  return (
    <div style={s.uploadForm}>
      <div style={s.uploadRow}>
        <select style={s.uploadSelect} value={docType} onChange={e => setDocType(e.target.value)}>
          {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <div style={s.directionToggle}>
          <button
            type="button"
            style={{ ...s.dirBtn, ...(direction === 'from_client' ? s.dirBtnActive : {}) }}
            onClick={() => setDirection('from_client')}
          >← From Client</button>
          <button
            type="button"
            style={{ ...s.dirBtn, ...(direction === 'from_company' ? s.dirBtnActive : {}) }}
            onClick={() => setDirection('from_company')}
          >From Us →</button>
        </div>
        {needsExpiry && (
          <div style={s.expiryField}>
            <label style={s.uploadLabel}>{t.expiryDate}</label>
            <input style={s.uploadInput} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </div>
        )}
        <label style={{ ...s.uploadFileBtn, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '…' : t.uploadDocument}
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFile} disabled={uploading}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv" />
        </label>
      </div>
      {error && <p style={s.uploadError}>{error}</p>}
    </div>
  );
}

// ── Document List ─────────────────────────────────────────────────────────────

function DocList({ clientId, docs, onDeleted }) {
  const t = useT();
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async doc => {
    if (!confirm(t.deleteDocConfirm)) return;
    setDeleting(doc.id);
    try {
      await api.delete(`/admin/clients/${clientId}/documents/${doc.id}`);
      onDeleted(doc.id);
    } finally { setDeleting(null); }
  };

  if (docs.length === 0) return <p style={s.noDocsHint}>{t.noDocsYet}</p>;

  return (
    <div style={s.docList}>
      {docs.map(doc => {
        const meta = DOC_META[doc.doc_type] || DOC_META.other;
        const exp = doc.expires_at ? expiryStatus(doc.expires_at, t) : null;
        return (
          <div key={doc.id} style={s.docRow}>
            <span style={{ ...s.docTypeBadge, color: meta.color, background: meta.bg }}>{meta.label}</span>
            <span style={{ ...s.dirBadge, ...(doc.direction === 'from_company' ? s.dirBadgeOurs : s.dirBadgeTheirs) }}>
              {doc.direction === 'from_company' ? 'From Us' : 'From Client'}
            </span>
            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={s.docName}>{doc.name}</a>
            {fmt(doc.size_bytes) && <span style={s.docSize}>{fmt(doc.size_bytes)}</span>}
            {exp && <span style={{ ...s.expiryBadge, color: exp.color, background: exp.bg }}>{exp.label}</span>}
            <button style={s.docDeleteBtn} onClick={() => handleDelete(doc)} disabled={deleting === doc.id}>
              {deleting === doc.id ? '…' : '✕'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ client, onEdit, onDeleted }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDocs = async () => {
    if (docs !== null) return;
    setLoadingDocs(true);
    try {
      const r = await api.get(`/admin/clients/${client.id}/documents`);
      setDocs(r.data);
    } finally { setLoadingDocs(false); }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadDocs();
  };

  const handleDelete = async () => {
    if (!confirm(t.removeClientConfirm)) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/clients/${client.id}`);
      onDeleted(client.id);
    } finally { setDeleting(false); }
  };

  // Compute expiry warnings from next_expiry (from list query)
  const warningDays = client.next_expiry
    ? Math.round((new Date(client.next_expiry + 'T00:00:00') - new Date()) / 86400000)
    : null;
  const hasExpiryWarning = warningDays !== null && warningDays <= 30;

  return (
    <div style={s.card}>
      <div style={s.cardHeader} onClick={handleExpand}>
        <div style={s.cardLeft}>
          <div style={s.clientName}>
            {client.name}
            {hasExpiryWarning && (
              <span style={{ ...s.badge, background: warningDays < 0 ? '#fee2e2' : '#fef3c7', color: warningDays < 0 ? '#dc2626' : '#d97706', marginLeft: 8 }}>
                {warningDays < 0 ? `⚠ ${t.expiredCOI}` : `⚠ COI ${warningDays}${t.expiryInDays}`}
              </span>
            )}
          </div>
          <div style={s.cardMeta}>
            {client.contact_name && <span>{client.contact_name}</span>}
            {client.contact_email && <a href={`mailto:${client.contact_email}`} style={s.metaLink} onClick={e => e.stopPropagation()}>{client.contact_email}</a>}
            {client.contact_phone && <span>{client.contact_phone}</span>}
            {parseInt(client.project_count) > 0 && (
              <span style={s.metaTag}>{client.project_count} project{client.project_count !== '1' ? 's' : ''}</span>
            )}
            {parseInt(client.document_count) > 0 && (
              <span style={s.metaTag}>{client.document_count} doc{client.document_count !== '1' ? 's' : ''}</span>
            )}
          </div>
        </div>
        <span style={s.chevron}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={s.cardBody}>
          {client.address && <p style={s.addressText}>📍 {client.address}</p>}
          {client.notes && <p style={s.notesText}>{client.notes}</p>}

          <div style={s.sectionLabel}>{t.documentsSection}</div>
          <DocUploadForm
            clientId={client.id}
            onUploaded={doc => setDocs(prev => prev ? [doc, ...prev] : [doc])}
          />
          {loadingDocs ? (
            <p style={s.hint}>Loading…</p>
          ) : (
            <DocList
              clientId={client.id}
              docs={docs || []}
              onDeleted={id => setDocs(prev => prev.filter(d => d.id !== id))}
            />
          )}

          <div style={s.cardActions}>
            <button style={s.editBtn} onClick={() => onEdit(client)}>{t.edit}</button>
            <button style={s.deleteBtn} onClick={handleDelete} disabled={deleting}>
              {deleting ? '…' : t.removeClient}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ManageClients() {
  const t = useT();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/clients')
      .then(r => setClients(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (client, isEdit) => {
    if (isEdit) {
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, ...client } : c));
      setEditing(null);
    } else {
      setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
      setShowForm(false);
    }
  };

  const filtered = search.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_name || '').toLowerCase().includes(search.toLowerCase()))
    : clients;

  // Expiry summary
  const expiredCount  = clients.filter(c => c.next_expiry && new Date(c.next_expiry + 'T00:00:00') < new Date()).length;
  const expiringSoon  = clients.filter(c => {
    if (!c.next_expiry) return false;
    const days = Math.round((new Date(c.next_expiry + 'T00:00:00') - new Date()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div>
      <div style={s.topRow}>
        <div>
          <h2 style={s.heading}>{t.clientsHeading}</h2>
          {(expiredCount > 0 || expiringSoon > 0) && (
            <div style={s.summary}>
              {expiredCount > 0 && <span style={s.summaryChip}>⚠ {expiredCount} {t.expiredCOI}{expiredCount !== 1 ? 's' : ''}</span>}
              {expiringSoon > 0 && <span style={{ ...s.summaryChip, background: '#fef3c7', color: '#92400e' }}>⏰ {expiringSoon} {t.expiringSoon}</span>}
            </div>
          )}
        </div>
        {!showForm && !editing && (
          <button style={s.newBtn} onClick={() => setShowForm(true)}>{t.addClient}</button>
        )}
      </div>

      {(showForm || editing) && (
        <div style={s.formCard}>
          <ClientForm
            initial={editing || BLANK_CLIENT}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      {clients.length > 4 && (
        <input
          style={s.search}
          placeholder={t.searchClientsPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {loading ? (
        <p style={s.hint}>{t.loading}</p>
      ) : clients.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🏢</div>
          <p style={s.emptyText}>{t.noClientsYet}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p style={s.hint}>{t.noClientsMatch}</p>
      ) : (
        <div style={s.list}>
          {filtered.map(c => (
            <ClientCard
              key={c.id}
              client={c}
              onEdit={c => { setEditing(c); setShowForm(false); }}
              onDeleted={id => setClients(prev => prev.filter(c => c.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  summary: { display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  summaryChip: { fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  search: { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff', marginBottom: 12, boxSizing: 'border-box' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  hint: { color: '#9ca3af', fontSize: 14 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  // Card
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer', gap: 12 },
  cardLeft: { flex: 1, minWidth: 0 },
  clientName: { fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' },
  badge: { fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' },
  metaLink: { color: '#1d4ed8', textDecoration: 'none' },
  metaTag: { background: '#f3f4f6', color: '#374151', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  chevron: { fontSize: 10, color: '#9ca3af', flexShrink: 0 },
  cardBody: { padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' },
  addressText: { fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 4 },
  notesText: { fontSize: 13, color: '#6b7280', marginBottom: 12, whiteSpace: 'pre-wrap' },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginTop: 14, marginBottom: 8 },
  cardActions: { display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 12 },
  editBtn: { background: '#f3f4f6', border: 'none', color: '#374151', padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  // Form
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  formTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 180 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  opt: { fontWeight: 400, color: '#9ca3af' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 },
  textarea: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  formActions: { display: 'flex', gap: 10 },
  saveBtn: { background: '#059669', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '11px 22px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  // Upload form
  uploadForm: { marginBottom: 8 },
  uploadRow: { display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  uploadSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff' },
  expiryField: { display: 'flex', flexDirection: 'column', gap: 3 },
  uploadLabel: { fontSize: 11, fontWeight: 600, color: '#9ca3af' },
  uploadInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13 },
  uploadFileBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  uploadError: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  directionToggle: { display: 'flex', border: '1px solid #e5e7eb', borderRadius: 7, overflow: 'hidden', flexShrink: 0 },
  dirBtn: { background: '#fff', border: 'none', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' },
  dirBtnActive: { background: '#1a56db', color: '#fff' },
  dirBadge: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' },
  dirBadgeTheirs: { background: '#ede9fe', color: '#6d28d9' },
  dirBadgeOurs: { background: '#dbeafe', color: '#1d4ed8' },
  // Doc list
  noDocsHint: { color: '#9ca3af', fontSize: 13 },
  docList: { display: 'flex', flexDirection: 'column', gap: 6 },
  docRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f9fafb', flexWrap: 'wrap' },
  docTypeBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, flexShrink: 0 },
  docName: { fontSize: 13, color: '#1d4ed8', textDecoration: 'none', flex: 1, minWidth: 120, '&:hover': { textDecoration: 'underline' } },
  docSize: { fontSize: 11, color: '#9ca3af', flexShrink: 0 },
  expiryBadge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, flexShrink: 0 },
  docDeleteBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 },
};
