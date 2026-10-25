import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';

const IDB_NAME = 'farapay_erp_idb';
const IDB_VERSION = 1;
const IDB_STORES = [
  'items',
  'customers_suppliers',
  'invoices',
  'stock_ledger_entries',
  'gl_entries',
  'kv_store',
] as const;

function mapStorageKeyToIdbStore(storageKey: string): (typeof IDB_STORES)[number] {
  if (storageKey.includes('inventory-items')) return 'items';
  if (storageKey.includes('customer-contacts')) return 'customers_suppliers';
  if (storageKey.includes('invoices')) return 'invoices';
  if (storageKey.includes('stock-ledger')) return 'stock_ledger_entries';
  if (storageKey.includes('gl-entries')) return 'gl_entries';
  return 'kv_store';
}

function syncToIndexedDbAtomic<T>(storageKey: string, value: T[]): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeName of IDB_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const targetStore = mapStorageKeyToIdbStore(storageKey);
      try {
        const tx = db.transaction([targetStore, 'kv_store'], 'readwrite');
        tx.objectStore(targetStore).put(value, storageKey);
        tx.objectStore('kv_store').put(value, storageKey);
      } catch {
        // Ignore transient IDB transaction errors in test environments
      }
    };
  } catch {
    // Fallback to localStorage only if IDB is unavailable
  }
}

export function usePersistentArrayState<T>(
  storageKey: string,
  initialValue: T[]
): [T[], Dispatch<SetStateAction<T[]>>, string | null, () => void] {
  const [loadedState] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === null) return { value: initialValue, error: null as string | null };

      const parsedValue: unknown = JSON.parse(storedValue);
      if (Array.isArray(parsedValue)) {
        return { value: parsedValue as T[], error: null as string | null };
      }
      return {
        value: initialValue,
        error: `ذخیره "${storageKey}" آرایه نیست؛ داده‌ی ذخیره‌شده دست‌نخورده نگه داشته شده است.`,
      };
    } catch (error) {
      console.error(`Could not load persisted application state for "${storageKey}".`, error);
      return {
        value: initialValue,
        error: `ذخیره "${storageKey}" قابل خواندن نیست؛ داده‌ی ذخیره‌شده دست‌نخورده نگه داشته شده است.`,
      };
    }
  });
  const [value, setValue] = useState<T[]>(loadedState.value);
  const [storageError, setStorageError] = useState<string | null>(loadedState.error);
  const isRemoteSyncRef = useRef(false);

  // Cross-tab BroadcastChannel synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('farapay_erp_sync_channel');
      channel.onmessage = (ev: MessageEvent) => {
        if (ev.data && ev.data.storageKey === storageKey && Array.isArray(ev.data.payload)) {
          isRemoteSyncRef.current = true;
          setValue(ev.data.payload as T[]);
        }
      };
    } catch {
      // Ignore if BroadcastChannel is unsupported
    }
    return () => {
      if (channel) channel.close();
    };
  }, [storageKey]);

  // Atomic Save with Web Locks API + IndexedDB + LocalStorage
  useEffect(() => {
    if (storageError) return;
    const persistState = () => {
      try {
        const serialized = JSON.stringify(value);
        window.localStorage.setItem(storageKey, serialized);
        syncToIndexedDbAtomic(storageKey, value);
        if (!isRemoteSyncRef.current && typeof BroadcastChannel !== 'undefined') {
          try {
            const ch = new BroadcastChannel('farapay_erp_sync_channel');
            ch.postMessage({ storageKey, payload: value });
            ch.close();
          } catch {
            // Ignore broadcast error
          }
        }
        isRemoteSyncRef.current = false;
      } catch (error) {
        console.error(`Could not save application state for "${storageKey}".`, error);
      }
    };

    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
      navigator.locks.request(`lock_${storageKey}`, async () => {
        persistState();
      }).catch(() => persistState());
    } else {
      persistState();
    }
  }, [storageError, storageKey, value]);

  const replaceCorruptedValue = () => {
    window.localStorage.removeItem(storageKey);
    setValue(initialValue);
    setStorageError(null);
  };

  return [value, setValue, storageError, replaceCorruptedValue];
}

