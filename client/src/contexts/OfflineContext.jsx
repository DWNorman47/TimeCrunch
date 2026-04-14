import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from './ToastContext';

import { silentError } from '../errorReporter';
const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const { addToast } = useToast();
  const listenersRef = useRef([]);

  const sendToSW = useCallback((msg) => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  }, []);

  // Subscribe to QUEUE_REPLAYED events
  const onSync = useCallback((fn) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter(f => f !== fn);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      sendToSW({ type: 'REPLAY_QUEUE' });
      if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready.then(reg => {
          reg.sync.register('clock-queue-replay').catch(silentError('offlinecontext'));
        });
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sendToSW]);

  useEffect(() => {
    const handleMessage = (event) => {
      const { type, count } = event.data || {};
      if (type === 'QUEUE_COUNT') {
        setQueueCount(count ?? 0);
      }
      if (type === 'QUEUE_REPLAYED') {
        setQueueCount(prev => Math.max(0, prev - (count ?? 0)));
        if (count > 0) {
          addToast(`${count} offline entr${count === 1 ? 'y' : 'ies'} synced`, 'success');
        }
        listenersRef.current.forEach(fn => fn(count));
      }
      if (type === 'REPLAY_AUTH_FAILED') {
        addToast('Session expired — please log in again to sync offline entries', 'error');
      }
      if (type === 'REPLAY_PARTIAL_FAILURE') {
        addToast('Some offline entries could not be synced and were removed', 'warning');
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    // Request initial count
    sendToSW({ type: 'GET_QUEUE_COUNT' });
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, [sendToSW, addToast]);

  return (
    <OfflineContext.Provider value={{ isOffline, queueCount, sendToSW, onSync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
