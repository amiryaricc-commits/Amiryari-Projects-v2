import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (barcode: string) => void;
  maxIntervalMs?: number;
  minLength?: number;
}

/**
 * Hardware barcode scanner listener that detects rapid keystroke bursts ending with Enter
 * without interfering with normal user typing inside standard form inputs.
 */
export function useBarcodeScanner({
  enabled = true,
  onScan,
  maxIntervalMs = 45,
  minLength = 4,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Do not hijack events when user is actively typing inside an input field
      if (isEditableTarget) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > maxIntervalMs) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          event.preventDefault();
          const scannedCode = bufferRef.current.trim();
          bufferRef.current = '';
          onScan(scannedCode);
        }
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, maxIntervalMs, minLength, onScan]);
}
