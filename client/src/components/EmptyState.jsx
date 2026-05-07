import React from 'react';

export default function EmptyState({ mark = 'O', title, body, actionLabel, onAction, tone = 'neutral' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-copy">
        <h3 className="empty-state-title">{title}</h3>
        {body && <p className="empty-state-body">{body}</p>}
      </div>
      {actionLabel && onAction && (
        <button type="button" className="empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
