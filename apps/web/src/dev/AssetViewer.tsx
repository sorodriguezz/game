/**
 * Visor de assets SOLO para desarrollo/QA (F1.1, F1.6): no es una entrada del build de
 * producción. Muestra GLB publicados con la iluminación del juego y reproduce clips.
 * Uso: /asset-viewer.html?ids=a,b,c&clip=walk&sea=1&dist=40&yaw=30&pitch=-28
 */
import { StrictMode, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Application, Entity } from '@playcanvas/react';
import { Camera, Light } from '@playcanvas/react/components';
import { useApp, useParent } from '@playcanvas/react/hooks';
import {
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
  SHADOW_PCF3_32F,
  type AnimTrack,
  type Entity as PcEntity,
} from 'playcanvas';
import { AssetRuntime } from '../assets/runtime.js';
import { SceneLighting } from '../scene/SceneLighting.js';
import { PROFILES } from '../scene/graphics.js';
import { RenderTelemetry } from '../perf/RenderTelemetry.js';

const q = new URLSearchParams(window.location.search);
const ids = (q.get('ids') ?? 'city_hall.corona.s3').split(',').filter(Boolean);
const clip = q.get('clip');
const sea = q.get('sea') === '1';
const dist = Number(q.get('dist') ?? 40);
const yaw = Number(q.get('yaw') ?? 25);
const pitch = Number(q.get('pitch') ?? -24);
const gap = Number(q.get('gap') ?? 4);
const widths = (q.get('w') ?? '').split(',').map(Number);

function Model({ id, clipName }: { id: string; clipName: string | null }) {
  const app = useApp();
  const parent = useParent();
  useEffect(() => {
    const rt = AssetRuntime.for(app);
    const url = `/assets/models/${id}.glb`;
    let ent: PcEntity | null = null;
    let alive = true;
    void rt.container(url).then((res) => {
      if (!alive) return;
      ent = res.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      rt.prepare(ent);
      if (clipName && res.animations.length) {
        const track = res.animations
          .map((a) => a.resource as AnimTrack)
          .find((t) => t.name === clipName);
        if (track) {
          ent.addComponent('anim', { activate: true });
          ent.anim!.assignAnimation(clipName, track);
        }
      }
      parent.addChild(ent);
      (window as unknown as { __viewerLoaded?: number }).__viewerLoaded =
        ((window as unknown as { __viewerLoaded?: number }).__viewerLoaded ?? 0) + 1;
    });
    return () => {
      alive = false;
      ent?.destroy();
      rt.release(url);
    };
  }, [app, parent, id, clipName]);
  return null;
}

function Ground() {
  const app = useApp();
  useEffect(() => {
    const rt = AssetRuntime.for(app);
    const e = new (app.root.constructor as unknown as new (n: string) => PcEntity)('ground');
    e.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: true });
    e.setLocalScale(400, 1, 400);
    e.render!.meshInstances[0]!.material = rt.material(
      sea ? 'common.water' : 'terrain.grass',
      sea ? { water: true } : {},
    );
    app.root.addChild(e);
    return () => e.destroy();
  }, [app]);
  return null;
}

function Viewer() {
  const camera = useRef<PcEntity | null>(null);
  const xs = useMemo(() => {
    let x = 0;
    return ids.map((_, i) => {
      const w = widths[i] || 10;
      const cx = x + w / 2;
      x += w + gap;
      return cx;
    });
  }, []);
  const total = xs.length ? xs[xs.length - 1]! + (widths[xs.length - 1] || 10) / 2 : 0;
  const yr = (yaw * Math.PI) / 180;
  const pr = (pitch * Math.PI) / 180;
  const target: [number, number, number] = [total / 2, 2, 0];
  const camPos: [number, number, number] = [
    target[0] + Math.sin(yr) * Math.cos(pr) * dist,
    target[1] - Math.sin(pr) * dist,
    target[2] + Math.cos(yr) * Math.cos(pr) * dist,
  ];
  return (
    <Application
      fillMode={FILLMODE_FILL_WINDOW}
      resolutionMode={RESOLUTION_AUTO}
      graphicsDeviceOptions={{ antialias: true }}
    >
      <SceneLighting
        profile={PROFILES.medium}
        camera={camera}
        exposure={0.9}
        envIntensity={0.6}
        fog={{ color: '#c4d3dc', start: 300, end: 900 }}
      />
      <RenderTelemetry scene="viewer" />
      <Entity name="sun" rotation={[48, 32, 0]}>
        <Light
          type="directional"
          color="#ffe8c8"
          intensity={1.25}
          castShadows
          shadowResolution={2048}
          shadowDistance={120}
          shadowType={SHADOW_PCF3_32F}
          shadowBias={0.2}
          normalOffsetBias={0.04}
        />
      </Entity>
      <Entity
        name="camera"
        position={camPos}
        rotation={[pitch, yaw, 0]}
        ref={(e) => void (camera.current = e)}
      >
        <Camera clearColor="#b9cdd9" fov={35} farClip={1500} nearClip={0.2} />
      </Entity>
      <Ground />
      {ids.map((id, i) => (
        <Entity
          key={id + i}
          position={[xs[i]!, sea && id.startsWith('ship') ? -0.35 : 0, 0]}
          rotation={[0, Number(q.get('rot') ?? 0), 0]}
        >
          <Model id={id} clipName={clip} />
        </Entity>
      ))}
    </Application>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Viewer />
  </StrictMode>,
);
