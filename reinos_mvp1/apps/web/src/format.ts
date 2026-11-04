import { useEffect, useState } from 'react';

const nf = new Intl.NumberFormat('es-ES');
export const fmt = (n: number) => nf.format(Math.floor(n));

export function duration(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

export function localTime(isoString: string): string {
  return new Date(isoString).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
}

/** Reloj del cliente corregido con el desfase respecto al servidor (el servidor manda). */
export function useServerNow(serverTime: string | undefined, intervalMs = 1000): number {
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (serverTime) setOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return Date.now() + offset;
}
