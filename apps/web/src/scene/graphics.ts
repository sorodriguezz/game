import { useSyncExternalStore } from 'react';

/**
 * Perfiles gráficos (Art Bible §10, §13). Cada perfil cambia de verdad la
 * resolución interna, las sombras, el postprocesado y las distancias de LOD.
 * La elección se recuerda por navegador (conveniencia local, no estado de juego).
 */
export type GraphicsProfileId = 'low' | 'medium' | 'high';

export interface GraphicsProfile {
  id: GraphicsProfileId;
  label: string;
  maxPixelRatio: number;
  shadowResolution: number;
  shadowDistance: number;
  /** CameraFrame con SSAO, bloom y gradación de color. */
  post: boolean;
  lodDistances: [number, number];
  /** Fracción de habitantes/animación ambiental visibles. */
  ambientLife: number;
}

export const PROFILES: Record<GraphicsProfileId, GraphicsProfile> = {
  low: {
    id: 'low',
    label: 'Baja',
    maxPixelRatio: 1,
    shadowResolution: 1024,
    shadowDistance: 110,
    post: false,
    lodDistances: [45, 95],
    ambientLife: 0.4,
  },
  medium: {
    id: 'medium',
    label: 'Media',
    maxPixelRatio: 1.5,
    shadowResolution: 2048,
    shadowDistance: 160,
    post: false,
    lodDistances: [70, 135],
    ambientLife: 0.75,
  },
  high: {
    id: 'high',
    label: 'Alta',
    maxPixelRatio: 2,
    shadowResolution: 4096,
    shadowDistance: 200,
    post: true,
    lodDistances: [110, 200],
    ambientLife: 1,
  },
};

const KEY = 'reinos.graphics.profile';
const listeners = new Set<() => void>();

function read(): GraphicsProfileId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    /* almacenamiento bloqueado: perfil por defecto */
  }
  return 'medium';
}

let current: GraphicsProfileId = read();

export function setGraphicsProfile(id: GraphicsProfileId): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* se aplica igualmente en esta sesión */
  }
  for (const l of listeners) l();
}

export function useGraphicsProfile(): GraphicsProfile {
  const id = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
  return PROFILES[id];
}
