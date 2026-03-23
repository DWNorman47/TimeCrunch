import { useOffline } from '../contexts/OfflineContext';

export default function OfflineBanner() {
  const { isOffline, queueCount } = useOffline() || {};

  if (!isOffline && !queueCount) return null;

  return (
    <div style={{
      background: '#b45309',
      color: '#fff',
      textAlign: 'center',
      padding: '6px 12px',
      fontSize: '0.85rem',
      fontWeight: 500,
    }}>
      {isOffline
        ? queueCount > 0
          ? `Offline — ${queueCount} entr${queueCount === 1 ? 'y' : 'ies'} pending sync`
          : 'You\'re offline — entries will be saved when you reconnect'
        : `${queueCount} entr${queueCount === 1 ? 'y' : 'ies'} pending sync…`}
    </div>
  );
}
