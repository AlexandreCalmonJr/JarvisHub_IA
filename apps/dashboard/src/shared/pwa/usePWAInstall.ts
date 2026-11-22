import { useCallback, useEffect, useState } from 'react';
import {
  OfflineCommandItem,
  enqueueOfflineCommand,
} from '../../services/voiceCompanion';
import { enqueueRemoteCommand, sendVoiceTurn } from '../../services/api';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const OFFLINE_QUEUE_STORAGE_KEY = 'jarvis_pwa_offline_queue_v1';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        if (regs.length > 0) setSwReady(true);
      }).catch(() => {});
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    swReady,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

function readOfflineQueue(): OfflineCommandItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useOfflineQueue() {
  const isOnline = useOnlineStatus();
  const [queue, setQueue] = useState<OfflineCommandItem[]>(readOfflineQueue);
  const [syncing, setSyncing] = useState(false);

  const persist = (next: OfflineCommandItem[]) => {
    setQueue(next);
    try {
      localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('jarvis:offline-queue-updated', { detail: next }));
    } catch {
      // ignore storage quota
    }
  };

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<OfflineCommandItem[]>).detail;
      if (Array.isArray(detail)) setQueue(detail);
    };
    window.addEventListener('jarvis:offline-queue-updated', onUpdated);
    return () => window.removeEventListener('jarvis:offline-queue-updated', onUpdated);
  }, []);

  const addCommand = useCallback((text: string, target: 'voice' | 'companion' = 'voice') => {
    const next = enqueueOfflineCommand(readOfflineQueue(), text, target);
    persist(next);
    return next;
  }, []);

  const removeCommand = useCallback((id: string) => {
    const next = readOfflineQueue().filter((item) => item.id !== id);
    persist(next);
  }, []);

  const syncNow = useCallback(async () => {
    const current = readOfflineQueue();
    if (current.length === 0) return { synced: 0 };
    setSyncing(true);
    let synced = 0;
    const remaining: OfflineCommandItem[] = [];

    for (const item of current) {
      try {
        if (item.target === 'companion') {
          await enqueueRemoteCommand({ command: item.text, source: 'offline_sync' });
        } else {
          await sendVoiceTurn({ transcript: item.text });
        }
        synced += 1;
      } catch {
        remaining.push(item);
      }
    }

    persist(remaining);
    setSyncing(false);
    return { synced };
  }, []);

  // Sincronização automática ao recuperar conexão
  useEffect(() => {
    if (isOnline && queue.length > 0 && !syncing) {
      void syncNow();
    }
  }, [isOnline]);

  return {
    isOnline,
    queue,
    syncing,
    addCommand,
    removeCommand,
    syncNow,
  };
}
