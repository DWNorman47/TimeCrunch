import React from 'react';
import { useT } from '../hooks/useT';

export default function Pagination({ page, pages, onChange }) {
  const t = useT();
  if (!pages || pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
          background: page <= 1 ? '#f9fafb' : '#fff', color: page <= 1 ? '#9ca3af' : '#374151',
          cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        ← {t.paginationPrev}
      </button>
      <span style={{ fontSize: 13, color: '#6b7280' }}>{t.paginationPage} {page} {t.ofLabel} {pages}</span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
          background: page >= pages ? '#f9fafb' : '#fff', color: page >= pages ? '#9ca3af' : '#374151',
          cursor: page >= pages ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        {t.paginationNext} →
      </button>
    </div>
  );
}
