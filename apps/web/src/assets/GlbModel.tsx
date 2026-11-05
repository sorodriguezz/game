import { useEffect } from 'react';
import { useApp, useParent } from '@playcanvas/react/hooks';
import type { Entity } from 'playcanvas';
import { AssetRuntime } from './runtime.js';

/**
 * Instancia un GLB publicado bajo la entidad padre actual, con materiales
 * compartidos y LOD por distancia. Mientras carga se muestra `fallback` (el kit
 * provisional) para no dejar huecos; al desmontar libera la referencia de caché.
 */
export function GlbModel({
  url,
  rotationY = 0,
  castShadows = true,
  onReady,
}: {
  url: string;
  rotationY?: number;
  castShadows?: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const app = useApp();
  const parent = useParent();
  useEffect(() => {
    const rt = AssetRuntime.for(app);
    let alive = true;
    let entity: Entity | null = null;
    rt.container(url)
      .then((res) => {
        if (!alive) return;
        entity = res.instantiateRenderEntity({ castShadows, receiveShadows: true });
        rt.prepare(entity);
        entity.setLocalEulerAngles(0, rotationY, 0);
        parent.addChild(entity);
        onReady?.(true);
      })
      .catch(() => {
        if (alive) onReady?.(false);
      });
    return () => {
      alive = false;
      if (entity) {
        rt.forget(entity);
        entity.destroy();
      }
      rt.release(url);
    };
  }, [app, parent, url, rotationY, castShadows, onReady]);
  return null;
}
