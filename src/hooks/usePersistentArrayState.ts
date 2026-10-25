import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

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

  useEffect(() => {
    if (storageError) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error(`Could not save application state for "${storageKey}".`, error);
    }
  }, [storageError, storageKey, value]);

  const replaceCorruptedValue = () => {
    window.localStorage.removeItem(storageKey);
    setValue(initialValue);
    setStorageError(null);
  };

  return [value, setValue, storageError, replaceCorruptedValue];
}
