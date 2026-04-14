import { useOffline } from '../contexts/OfflineContext';
import { useT } from '../hooks/useT';

export default function OfflineBanner() {
  const t = useT();
  const { isOffline, queueCount, sendToSW } = useOffline() || {};

  if (!isOffline && !queueCount) return null;

  const retry = () => sendToSW?.({ type: 'REPLAY_QUEUE' });
  const clear = () => sendToSW?.({ type: 'CLEAR_QUEUE' });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        background: '#b45309',
        color: '#fff',
        textAlign: 'center',
        padding: '6px 12px',
        fontSize: '0.85rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <span>
        {isOffline
          ? queueCount > 0
            ? `Offline — ${queueCount} ${queueCount === 1 ? t.offlineEntry : t.offlineEntries} ${t.offlinePendingSync}`
            : t.offlineNoQueue
          : `${queueCount} ${queueCount === 1 ? t.offlineEntry : t.offlineEntries} ${t.offlinePendingSync}…`}
      </span>
      {!isOffline && queueCount > 0 && (
        <>
          <button
            onClick={retry}
            style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 5, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {t.retry}
          </button>
          <button
            onClick={clear}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            {t.clear}
          </button>
        </>
      )}
    </div>
  );
}
