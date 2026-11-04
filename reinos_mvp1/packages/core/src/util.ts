import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** JSON con claves ordenadas: hash estable del cuerpo de una petición. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export const addSeconds = (d: Date, s: number): Date => new Date(d.getTime() + s * 1000);
export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const iso = (d: Date): string => d.toISOString();

/** Código SQLSTATE de un error de pg (posiblemente envuelto por Drizzle). */
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === 'object' && cur !== null && 'code' in cur && typeof (cur as { code: unknown }).code === 'string') {
      const code = (cur as { code: string }).code;
      if (/^[0-9A-Z]{5}$/.test(code)) return code;
    }
    cur = typeof cur === 'object' && cur !== null && 'cause' in cur ? (cur as { cause: unknown }).cause : undefined;
  }
  return undefined;
}

export function pgConstraint(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === 'object' && cur !== null && 'constraint' in cur) {
      return (cur as { constraint?: string }).constraint;
    }
    cur = typeof cur === 'object' && cur !== null && 'cause' in cur ? (cur as { cause: unknown }).cause : undefined;
  }
  return undefined;
}
