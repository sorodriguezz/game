import { useEffect, useRef } from 'react';
import { Application, Entity } from '@playcanvas/react';
import { Camera, Light, Render } from '@playcanvas/react/components';
import { RenderTelemetry } from '../perf/RenderTelemetry.js';
import { useApp, useAppEvent } from '@playcanvas/react/hooks';
import {
  Color,
  FILLMODE_NONE,
  FOG_LINEAR,
  RESOLUTION_AUTO,
  SHADOW_PCF3_32F,
  Vec3,
  type Entity as PcEntity,
} from 'playcanvas';
import type { ArenaDef, CivilizationId, TacticalRuleset } from '@reinos/game-config';
import { KitProvider, useKit, type Kit } from '../scene/kit.js';
import { InstancedPart } from './instancing.js';
import type { FrameStore } from './useBattleRoom.js';
import { formationRadiusCm, soldierLayout } from './geometry.js';

/** cm (simulación) → m (escena). */
const M = (cm: number) => cm / 100;

export interface ArenaSceneProps {
  arena: ArenaDef;
  tactical: TacticalRuleset;
  frames: React.MutableRefObject<FrameStore>;
  mySide: 'ATTACKER' | 'DEFENDER';
  attackerCiv: CivilizationId;
  defenderCiv: CivilizationId;
  selected: React.MutableRefObject<Set<string>>;
  onLeftClick: (worldCm: { x: number; z: number }, shift: boolean) => void;
  onRightClick: (worldCm: { x: number; z: number }) => void;
  onStats?: (s: { soldiers: number; drawParts: number }) => void;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return (s & 0xffffff) / 0x1000000;
  };
}

function SceneSettings() {
  const app = useApp();
  useEffect(() => {
    app.scene.ambientLight = new Color(0.45, 0.47, 0.52);
    app.scene.fog.type = FOG_LINEAR;
    app.scene.fog.color = new Color(0.72, 0.8, 0.86);
    app.scene.fog.start = 160;
    app.scene.fog.end = 520;
    app.scene.exposure = 1.1;
  }, [app]);
  return null;
}

function Terrain({ arena, k }: { arena: ArenaDef; k: Kit }) {
  const w = M(arena.widthCm);
  const d = M(arena.depthCm);
  return (
    <>
      <Entity position={[w / 2, -0.05, d / 2]} scale={[w * 4, 1, d * 4]}>
        <Render type="plane" material={k.grassDark} receiveShadows castShadows={false} />
      </Entity>
      <Entity position={[w / 2, 0, d / 2]} scale={[w, 1, d]}>
        <Render type="plane" material={k.grass} receiveShadows castShadows={false} />
      </Entity>
      {/* camino de tierra que cruza el vado */}
      <Entity position={[w / 2 - 2, 0.02, d / 2]} scale={[4, 0.02, d]}>
        <Render type="box" material={k.dirt} receiveShadows castShadows={false} />
      </Entity>
      {arena.hills.map((h, i) => (
        <Entity
          key={`h${i}`}
          position={[M(h.x), -M(h.h) * 0.6, M(h.z)]}
          scale={[M(h.r) * 2, M(h.h) * 2.4, M(h.r) * 2]}
        >
          <Render type="sphere" material={k.grass} receiveShadows castShadows={false} />
        </Entity>
      ))}
      {arena.obstacles.map((o, i) => {
        if (o.kind === 'water' && o.shape === 'circle') {
          return (
            <Entity key={`o${i}`}>
              <Entity
                position={[M(o.x), 0.04, M(o.z)]}
                scale={[M(o.r) * 2.25, 0.05, M(o.r) * 2.25]}
              >
                <Render type="cylinder" material={k.sand} receiveShadows castShadows={false} />
              </Entity>
              <Entity position={[M(o.x), 0.08, M(o.z)]} scale={[M(o.r) * 2, 0.05, M(o.r) * 2]}>
                <Render type="cylinder" material={k.water} castShadows={false} />
              </Entity>
            </Entity>
          );
        }
        if (o.kind === 'rock' && o.shape === 'circle') {
          const r = rand(i * 977 + 13);
          return (
            <Entity key={`o${i}`}>
              {Array.from({ length: 6 }, (_, j) => {
                const a = r() * Math.PI * 2;
                const dd = r() * M(o.r) * 0.6;
                const s = M(o.r) * (0.5 + r() * 0.5);
                return (
                  <Entity
                    key={j}
                    position={[M(o.x) + Math.sin(a) * dd, s * 0.25, M(o.z) + Math.cos(a) * dd]}
                    scale={[s, s * 0.8, s * 0.9]}
                  >
                    <Render
                      type="sphere"
                      material={j % 2 ? k.rock : k.stoneDark}
                      castShadows
                      receiveShadows
                    />
                  </Entity>
                );
              })}
            </Entity>
          );
        }
        return null;
      })}
      {/* franjas de despliegue */}
      {(['ATTACKER', 'DEFENDER'] as const).map((side) => {
        const b = arena.deploy[side];
        return (
          <Entity
            key={side}
            position={[w / 2, 0.03, M((b.zMin + b.zMax) / 2)]}
            scale={[w - 8, 1, M(b.zMax - b.zMin)]}
          >
            <Render type="plane" material={k.ghost} castShadows={false} />
          </Entity>
        );
      })}
    </>
  );
}

/** Bosque instanciado dentro de los obstáculos de tipo bosque + borde escénico. */
function Forest({ arena, k }: { arena: ArenaDef; k: Kit }) {
  const app = useApp();
  useEffect(() => {
    const trunks = new InstancedPart(app, 'cylinder', k.trunk, 600);
    const crowns = new InstancedPart(app, 'cone', k.foliageDark, 1200);
    const r = rand(4242);
    const trees: Array<[number, number, number]> = [];
    for (const o of arena.obstacles) {
      if (o.kind !== 'forest') continue;
      const area = o.shape === 'circle' ? Math.PI * M(o.r) ** 2 : M(o.x1 - o.x0) * M(o.z1 - o.z0);
      const n = Math.min(220, Math.floor(area / 22));
      for (let i = 0; i < n; i++) {
        let x: number, z: number;
        if (o.shape === 'circle') {
          const a = r() * Math.PI * 2;
          const dd = Math.sqrt(r()) * M(o.r);
          x = M(o.x) + Math.sin(a) * dd;
          z = M(o.z) + Math.cos(a) * dd;
        } else {
          x = M(o.x0) + r() * M(o.x1 - o.x0);
          z = M(o.z0) + r() * M(o.z1 - o.z0);
        }
        trees.push([x, z, 0.8 + r() * 0.6]);
      }
    }
    // Borde de bosque fuera del campo (decorado, no simulado).
    const w = M(arena.widthCm);
    const d = M(arena.depthCm);
    for (let i = 0; i < 160; i++) {
      const side = i % 4;
      const t = r();
      const off = 6 + r() * 26;
      const [x, z] =
        side === 0
          ? [t * w, -off]
          : side === 1
            ? [t * w, d + off]
            : side === 2
              ? [-off, t * d]
              : [w + off, t * d];
      trees.push([x, z, 0.9 + r() * 0.8]);
    }
    trunks.begin();
    crowns.begin();
    for (const [x, z, s] of trees) {
      trunks.push(x, 0.9 * s, z, 0, 0.5 * s, 1.8 * s, 0.5 * s);
      crowns.push(x, 2.6 * s, z, 0, 3.2 * s, 3.4 * s, 3.2 * s);
      crowns.push(x, 4.1 * s, z, 0, 2.2 * s, 2.6 * s, 2.2 * s);
    }
    trunks.end();
    crowns.end();
    return () => {
      trunks.destroy();
      crowns.destroy();
    };
  }, [app, arena, k]);
  return null;
}

/** Soldados visuales máximos por formación (la simulación es por formación, no por soldado). */
const MAX_VISUAL = 16;
const SEL_DASHES = 18;

interface SoldierParts {
  bodyA: InstancedPart;
  bodyD: InstancedPart;
  head: InstancedPart;
  helm: InstancedPart;
  spear: InstancedPart;
  horse: InstancedPart;
  robe: InstancedPart;
  ringA: InstancedPart;
  ringD: InstancedPart;
  ringSel: InstancedPart;
  pole: InstancedPart;
  flagA: InstancedPart;
  flagD: InstancedPart;
}

/** Ejército: soldados visuales instanciados derivados del estado por formación. */
function Armies(props: ArenaSceneProps & { kA: Kit; kD: Kit }) {
  const app = useApp();
  const parts = useRef<SoldierParts | null>(null);
  const k = props.kA;
  useEffect(() => {
    const cap = 24 * MAX_VISUAL;
    parts.current = {
      bodyA: new InstancedPart(app, 'capsule', props.kA.tunic, cap),
      bodyD: new InstancedPart(app, 'capsule', props.kD.tunic, cap),
      head: new InstancedPart(app, 'sphere', k.skin, cap),
      helm: new InstancedPart(app, 'cone', k.iron, cap),
      spear: new InstancedPart(app, 'box', k.timber, cap),
      horse: new InstancedPart(app, 'box', k.wood, cap),
      robe: new InstancedPart(app, 'cone', k.cloth, cap),
      ringA: new InstancedPart(app, 'cylinder', props.kA.teamMark, 32, false),
      ringD: new InstancedPart(app, 'cylinder', props.kD.teamMark, 32, false),
      ringSel: new InstancedPart(app, 'box', k.selection, 32 * SEL_DASHES, false),
      pole: new InstancedPart(app, 'cylinder', k.timber, 32),
      flagA: new InstancedPart(app, 'box', props.kA.banner, 32),
      flagD: new InstancedPart(app, 'box', props.kD.banner, 32),
    };
    return () => {
      for (const p of Object.values(parts.current ?? {})) (p as InstancedPart).destroy();
      parts.current = null;
    };
  }, [app, props.kA, props.kD, k]);

  useAppEvent('update', () => {
    const p = parts.current;
    if (!p) return;
    const fr = props.frames.current;
    const now = performance.now();
    const alpha = Math.min(1, Math.max(0, (now - fr.receivedAt) / fr.tickMs));
    const t = now / 1000;
    for (const part of Object.values(p)) (part as InstancedPart).begin();
    let soldiers = 0;
    for (const f of fr.curr.values()) {
      if (f.status === 'DESTROYED' || f.status === 'ESCAPED' || f.count <= 0) continue;
      const prev = fr.prev.get(f.id) ?? f;
      const cx = M(prev.x + (f.x - prev.x) * alpha);
      const cz = M(prev.z + (f.z - prev.z) * alpha);
      const flen = Math.hypot(f.fx, f.fz) || 1;
      const fx = f.fx / flen;
      const fz = f.fz / flen;
      const yaw = (Math.atan2(-fx, -fz) * 180) / Math.PI;
      const rx = -fz;
      const rz = fx;
      const radius = M(formationRadiusCm(props.tactical, f));
      const isA = f.side === 'ATTACKER';
      (isA ? p.ringA : p.ringD).push(cx, 0.05, cz, 0, radius * 2, 0.02, radius * 2);
      if (props.selected.current.has(f.id)) {
        // Contorno discontinuo: segmentos tangentes alrededor del radio (no tapa a los soldados).
        const rr = radius + 0.5;
        const dash = ((2 * Math.PI * rr) / SEL_DASHES) * 0.6;
        for (let j = 0; j < SEL_DASHES; j++) {
          const a = (j / SEL_DASHES) * Math.PI * 2 + t * 0.4;
          p.ringSel.push(
            cx + Math.sin(a) * rr,
            0.09,
            cz + Math.cos(a) * rr,
            (a * 180) / Math.PI,
            dash,
            0.05,
            0.22,
          );
        }
      }
      p.pole.push(cx, 2.4, cz, 0, 0.12, 4.8, 0.12);
      (isA ? p.flagA : p.flagD).push(cx + rx * 0.5, 4.2, cz + rz * 0.5, yaw, 1.0, 0.7, 0.05);

      const n = Math.max(1, Math.min(MAX_VISUAL, Math.ceil(f.count / 4)));
      const cav = f.unitType === 'cavalry';
      const priest = f.unitType === 'priest';
      const layout = soldierLayout(f.preset, n, radius, cav);
      const moving = f.status === 'MOVING' || f.status === 'FALLING_BACK' || f.status === 'ROUTED';
      const fighting = f.status === 'ATTACKING';
      for (let i = 0; i < n; i++) {
        let ox = layout[i]![0];
        let oy = layout[i]![1];
        if (f.status === 'ROUTED') {
          ox += Math.sin(i * 12.9 + t * 3) * 1.4;
          oy += Math.cos(i * 7.3 + t * 2) * 1.4;
        }
        const jab = fighting ? Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.35 : 0;
        const bob = moving ? Math.abs(Math.sin(t * 9 + i)) * 0.12 : Math.sin(t * 1.5 + i) * 0.02;
        const x = cx + rx * ox + fx * (oy + jab);
        const z = cz + rz * ox + fz * (oy + jab);
        const lift = cav ? 1.1 : 0;
        if (cav) p.horse.push(x, 0.9 + bob, z, yaw, 0.7, 1.0, 2.1);
        if (priest) p.robe.push(x, 0.7 + bob, z, yaw, 0.9, 1.4, 0.9);
        else (isA ? p.bodyA : p.bodyD).push(x, 0.9 + lift + bob, z, yaw, 0.55, 0.9, 0.45);
        p.head.push(x, 1.85 + lift + bob, z, yaw, 0.36, 0.38, 0.36);
        if (!priest) p.helm.push(x, 2.08 + lift + bob, z, yaw, 0.42, 0.25, 0.42);
        if (
          f.unitType === 'spearman' ||
          f.unitType === 'imperial_guard' ||
          cav ||
          f.unitType === 'naval_escort'
        ) {
          p.spear.push(
            x + rx * 0.35,
            1.6 + lift + bob,
            z + rz * 0.35,
            yaw,
            0.06,
            0.06,
            3.2,
            fighting ? 70 : 20,
          );
        } else if (f.unitType === 'archer') {
          p.spear.push(x + rx * 0.3, 1.5 + bob, z + rz * 0.3, yaw, 0.05, 1.3, 0.05);
        } else if (f.unitType === 'militia') {
          p.spear.push(
            x + rx * 0.35,
            1.3 + bob,
            z + rz * 0.35,
            yaw,
            0.08,
            0.9,
            0.08,
            fighting ? 40 : 0,
          );
        }
        soldiers++;
      }
    }
    let draws = 0;
    for (const part of Object.values(p)) {
      (part as InstancedPart).end();
      if ((part as InstancedPart).instances > 0) draws++;
    }
    props.onStats?.({ soldiers, drawParts: draws });
  });
  return null;
}

/** Cámara RTS: paneo con WASD/flechas, giro Q/E y zoom con rueda; inclinación fija. */
function RtsCamera({
  arena,
  side,
  cameraRef,
}: {
  arena: ArenaDef;
  side: 'ATTACKER' | 'DEFENDER';
  cameraRef: React.MutableRefObject<PcEntity | null>;
}) {
  const st = useRef({
    tx: M(arena.widthCm) / 2,
    tz: M(side === 'ATTACKER' ? arena.deploy.ATTACKER.zMin : arena.deploy.DEFENDER.zMax),
    dist: 95,
    yaw: side === 'ATTACKER' ? 0 : 180,
    keys: new Set<string>(),
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      st.current.keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => st.current.keys.delete(e.key.toLowerCase());
    const wheel = (e: WheelEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.arena-scene')) return;
      st.current.dist = Math.min(180, Math.max(28, st.current.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('wheel', wheel);
    };
  }, []);
  useAppEvent('update', (dt: number) => {
    const s = st.current;
    const cam = cameraRef.current;
    if (!cam) return;
    const speed = s.dist * 0.9 * dt;
    const yr = (s.yaw * Math.PI) / 180;
    const fwd = [-Math.sin(yr), -Math.cos(yr)];
    const right = [Math.cos(yr), -Math.sin(yr)];
    const k = s.keys;
    if (k.has('w') || k.has('arrowup')) {
      s.tx += fwd[0]! * speed;
      s.tz += fwd[1]! * speed;
    }
    if (k.has('s') || k.has('arrowdown')) {
      s.tx -= fwd[0]! * speed;
      s.tz -= fwd[1]! * speed;
    }
    if (k.has('d') || k.has('arrowright')) {
      s.tx += right[0]! * speed;
      s.tz += right[1]! * speed;
    }
    if (k.has('a') || k.has('arrowleft')) {
      s.tx -= right[0]! * speed;
      s.tz -= right[1]! * speed;
    }
    if (k.has('q')) s.yaw += 70 * dt;
    if (k.has('e')) s.yaw -= 70 * dt;
    s.tx = Math.min(M(arena.widthCm) + 20, Math.max(-20, s.tx));
    s.tz = Math.min(M(arena.depthCm) + 20, Math.max(-20, s.tz));
    const pitch = 55;
    const pr = (pitch * Math.PI) / 180;
    const back = Math.cos(pr) * s.dist;
    cam.setPosition(s.tx - fwd[0]! * back, Math.sin(pr) * s.dist, s.tz - fwd[1]! * back);
    cam.setEulerAngles(-pitch, s.yaw, 0);
  });
  return null;
}

function Inner(props: ArenaSceneProps & { cameraRef: React.MutableRefObject<PcEntity | null> }) {
  const k = useKit();
  return (
    <>
      <Terrain arena={props.arena} k={k} />
      <Forest arena={props.arena} k={k} />
      <KitDual
        civA={props.attackerCiv}
        civD={props.defenderCiv}
        render={(kA, kDd) => <Armies {...props} kA={kA} kD={kDd} />}
      />
      <RtsCamera arena={props.arena} side={props.mySide} cameraRef={props.cameraRef} />
    </>
  );
}

/** Materiales por civilización para cada bando (colores de estandarte y túnica). */
function KitDual({
  civA,
  civD,
  render,
}: {
  civA: CivilizationId;
  civD: CivilizationId;
  render: (a: Kit, d: Kit) => React.ReactNode;
}) {
  return (
    <KitProvider civ={civA}>
      <KitCapture>
        {(a) => (
          <KitProvider
            civ={
              civD === civA ? (civA === 'imperial_crown' ? 'sea_league' : 'imperial_crown') : civD
            }
          >
            {<KitCapture>{(d) => render(a, d)}</KitCapture>}
          </KitProvider>
        )}
      </KitCapture>
    </KitProvider>
  );
}

function KitCapture({ children }: { children: (k: Kit) => React.ReactNode }) {
  const k = useKit();
  return <>{children(k)}</>;
}

/** Escena táctica (FR2-005): el estado es del servidor; aquí solo se dibuja e interpreta la entrada. */
export function ArenaScene(props: ArenaSceneProps) {
  const cameraRef = useRef<PcEntity | null>(null);
  const down = useRef<{ x: number; y: number; button: number } | null>(null);

  const toWorld = (e: React.PointerEvent): { x: number; z: number } | null => {
    const cam = cameraRef.current?.camera;
    if (!cam) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const near = cam.screenToWorld(sx, sy, cam.nearClip, new Vec3());
    const far = cam.screenToWorld(sx, sy, cam.farClip, new Vec3());
    const dy = far.y - near.y;
    if (Math.abs(dy) < 1e-6) return null;
    const t = -near.y / dy;
    if (t < 0) return null;
    return {
      x: Math.round((near.x + (far.x - near.x) * t) * 100),
      z: Math.round((near.z + (far.z - near.z) * t) * 100),
    };
  };

  return (
    <div
      className="scene arena-scene"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY, button: e.button };
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
        const p = toWorld(e);
        if (!p) return;
        if (d.button === 2) props.onRightClick(p);
        else if (d.button === 0) props.onLeftClick(p, e.shiftKey);
      }}
    >
      <Application
        fillMode={FILLMODE_NONE}
        resolutionMode={RESOLUTION_AUTO}
        graphicsDeviceOptions={{ antialias: true }}
      >
        <SceneSettings />
        <RenderTelemetry scene="arena" />
        <KitProvider civ={props.attackerCiv}>
          <Entity name="sun" rotation={[52, 30, 0]}>
            <Light
              type="directional"
              color="#fff3df"
              intensity={1.25}
              castShadows
              shadowBias={0.25}
              normalOffsetBias={0.05}
              shadowResolution={2048}
              shadowDistance={220}
              shadowType={SHADOW_PCF3_32F}
            />
          </Entity>
          <Entity name="fill" rotation={[28, -150, 0]}>
            <Light type="directional" color="#b9cbe6" intensity={0.35} />
          </Entity>
          <Entity name="camera" ref={(e) => void (cameraRef.current = e)}>
            <Camera clearColor="#a9c6dc" fov={45} farClip={1500} nearClip={0.5} />
          </Entity>
          <Inner {...props} cameraRef={cameraRef} />
        </KitProvider>
      </Application>
    </div>
  );
}
