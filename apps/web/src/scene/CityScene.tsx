import { useEffect, useMemo, useRef } from 'react';
import { Application, Entity } from '@playcanvas/react';
import { Camera, Light, Render, Script } from '@playcanvas/react/components';
import { useApp, useAppEvent } from '@playcanvas/react/hooks';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import {
  Color,
  FILLMODE_NONE,
  FOG_LINEAR,
  RESOLUTION_AUTO,
  SHADOW_PCF3_32F,
  Vec2,
  Vec3,
  type Entity as PcEntity,
} from 'playcanvas';
import { getRuleset, type BuildingType, type CivilizationId } from '@reinos/game-config';
import { visualStage } from '@reinos/game-rules';
import type { BuildingView, ConstructionOrderView } from '@reinos/contracts';
import { BuildingModel, EmptyPlot, Scaffold, Ship } from './buildings.js';
import {
  Block,
  Cone,
  Cyl,
  KitProvider,
  Plane,
  Tower,
  Tree,
  useKit,
  type Kit,
  type V3,
} from './kit.js';

export interface CitySceneProps {
  rulesetVersion: string;
  civilization: CivilizationId;
  coastal: boolean;
  buildings: BuildingView[];
  construction: ConstructionOrderView | null;
  selectedPlot: number | null;
  onSelectPlot: (plot: number) => void;
}

const WALL_RADIUS = 46;
const FOCUS = new Vec3(0, 0, 4);
// Cámara acotada (FR-CITY-02): sin pasar bajo el suelo ni alejarse del valle.
const PITCH_RANGE = new Vec2(-85, -14);
const ZOOM_RANGE = new Vec2(30, 200);

/** Generador pseudoaleatorio local (decorativo, no autoritativo). */
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
    const scene = app.scene;
    scene.ambientLight = new Color(0.42, 0.44, 0.5);
    scene.fog.type = FOG_LINEAR;
    scene.fog.color = new Color(0.7, 0.8, 0.88);
    scene.fog.start = 140;
    scene.fog.end = 420;
    scene.exposure = 1.1;
  }, [app]);
  return null;
}

function Ground({ k, coastal }: { k: Kit; coastal: boolean }) {
  return (
    <>
      <Plane p={[0, 0, 0]} s={[700, 1, 700]} m={k.grass} />
      {/* caminos de tierra desde el centro */}
      {coastal && (
        <>
          <Plane p={[0, 0.03, -36]} s={[700, 1, 12]} m={k.sand} />
          <Plane p={[0, 0.05, -230]} s={[700, 1, 380]} m={k.water} />
          <Plane p={[0, -3, -230]} s={[700, 1, 380]} m={k.deepWater} />
        </>
      )}
    </>
  );
}

function PathStrips({ k, plots }: { k: Kit; plots: Array<{ id: number; x: number; z: number }> }) {
  return (
    <>
      {plots
        .filter((p) => p.id !== 0)
        .map((p) => {
          const len = Math.hypot(p.x, p.z);
          const angle = (Math.atan2(p.x, p.z) * 180) / Math.PI;
          return (
            <Entity
              key={p.id}
              position={[p.x / 2, 0.02, p.z / 2]}
              rotation={[0, angle, 0]}
              scale={[2.4, 0.04, len]}
            >
              <Render type="box" material={k.dirt} receiveShadows castShadows={false} />
            </Entity>
          );
        })}
    </>
  );
}

function Wall({ k, level, coastal }: { k: Kit; level: number; coastal: boolean }) {
  if (level <= 0) {
    // Sin muralla: empalizada baja de estacas como límite de la ciudad.
    const stakes = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const z = Math.cos(a) * WALL_RADIUS;
      if (coastal && z < -30) continue;
      if (Math.abs(Math.sin(a) * WALL_RADIUS) < 3 && z > 0) continue; // entrada
      stakes.push(
        <Block key={i} p={[Math.sin(a) * WALL_RADIUS, 0, z]} s={[0.25, 1.2, 0.25]} m={k.wood} />,
      );
    }
    return <>{stakes}</>;
  }
  const stage = visualStage(level);
  const h = 3 + stage * 1.5;
  const segs = 20;
  const gateA = Math.asin(4.4 / WALL_RADIUS); // media apertura angular de la barbacana
  const at = (a: number): [number, number] => [
    Math.sin(a) * WALL_RADIUS,
    Math.cos(a) * WALL_RADIUS,
  ];
  const out = [];
  for (let i = 0; i < segs; i++) {
    const a0 = i === 0 ? gateA : (i / segs) * Math.PI * 2;
    const a1 = i === segs - 1 ? Math.PI * 2 - gateA : ((i + 1) / segs) * Math.PI * 2;
    const [x0, z0] = at(a0);
    const [x1, z1] = at(a1);
    const mid = (a0 + a1) / 2;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    if (coastal && z < -30) continue;
    const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.4;
    out.push(
      <Entity key={`s${i}`} position={[x, 0, z]} rotation={[0, (mid * 180) / Math.PI, 0]}>
        <Block s={[segLen, h, 1.6]} m={k.stone} />
        {[-0.4, -0.2, 0, 0.2, 0.4].map((f) => (
          <Block key={f} p={[f * segLen, h, 0.6]} s={[0.7, 0.7, 0.4]} m={k.stone} />
        ))}
      </Entity>,
    );
    if (i > 0 && !(coastal && z0 < -30))
      out.push(
        <Tower key={`t${i}`} p={[x0, 0, z0]} radius={1.4} h={h + 1.6} roof={stage >= 2} k={k} />,
      );
  }
  // Barbacana sobre la entrada sur.
  out.push(
    <Entity key="gate" position={[0, 0, WALL_RADIUS]}>
      <Block p={[-3.2, 0, 0]} s={[2.4, h + 2, 3]} m={k.stone} />
      <Block p={[3.2, 0, 0]} s={[2.4, h + 2, 3]} m={k.stone} />
      <Block p={[0, h - 0.5, 0]} s={[8.8, 2.5, 3]} m={k.stone} />
      <Block p={[0, 0, 0]} s={[3.8, h - 0.5, 0.3]} m={k.timber} />
    </Entity>,
  );
  return <>{out}</>;
}

function Scenery({ k, coastal }: { k: Kit; coastal: boolean }) {
  const items = useMemo(() => {
    const r = rand(1337);
    const trees: Array<{ p: V3; s: number; kind: number }> = [];
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const d = 54 + r() * 120;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (coastal && z < -32) continue;
      if (Math.abs(x) < 6 && z > 40) continue; // camino de salida
      trees.push({ p: [x, 0, z], s: 0.8 + r() * 0.7, kind: r() < 0.45 ? 1 : 0 });
    }
    const rocks: Array<{ p: V3; s: number }> = [];
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const d = 55 + r() * 80;
      const z = Math.cos(a) * d;
      if (coastal && z < -34) continue;
      rocks.push({ p: [Math.sin(a) * d, 0, z], s: 0.6 + r() * 1.4 });
    }
    return { trees, rocks };
  }, [coastal]);
  return (
    <>
      {items.trees.map((t, i) => (
        <Tree key={i} p={t.p} scale={t.s} kind={t.kind} k={k} />
      ))}
      {items.rocks.map((rk, i) => (
        <Entity key={`r${i}`} position={rk.p} scale={[rk.s * 2, rk.s * 1.3, rk.s * 1.7]}>
          <Render type="sphere" material={k.rock} castShadows receiveShadows />
        </Entity>
      ))}
      {/* sierras lejanas como telón de fondo */}
      {[
        [-180, 200, 70],
        [-90, 260, 95],
        [40, 250, 80],
        [160, 210, 105],
        [260, 120, 70],
        [-260, 90, 85],
      ].map(([x, z, h], i) => (
        <Entity key={`m${i}`}>
          <Cone p={[x!, 0, z!]} radius={h! * 0.9} h={h!} m={k.rock} shadow={false} />
          <Cone
            p={[x!, h! * 0.72, z!]}
            radius={h! * 0.25}
            h={h! * 0.28}
            m={k.stoneLight}
            shadow={false}
          />
        </Entity>
      ))}
      {coastal && (
        <>
          <Ship p={[-40, -0.2, -90]} k={k} />
          <Ship p={[55, -0.2, -130]} k={k} small />
        </>
      )}
    </>
  );
}

/** Aldeanos decorativos que caminan entre la plaza y las parcelas (no autoritativos). */
function Villagers({ k, targets }: { k: Kit; targets: Array<[number, number]> }) {
  const refs = useRef<Array<PcEntity | null>>([]);
  const walkers = useMemo(() => {
    const r = rand(99);
    return Array.from({ length: Math.min(10, targets.length * 2) }, (_, i) => ({
      target: targets[i % targets.length]!,
      speed: 0.04 + r() * 0.05,
      phase: r(),
      tunic: i % 3 === 0 ? k.tunic : k.tunic2,
    }));
  }, [targets, k]);
  useAppEvent('update', (dt: number) => {
    walkers.forEach((w, i) => {
      const e = refs.current[i];
      if (!e) return;
      w.phase = (w.phase + dt * w.speed) % 2;
      const t = w.phase < 1 ? w.phase : 2 - w.phase;
      const x = w.target[0] * (0.25 + 0.6 * t);
      const z = w.target[1] * (0.25 + 0.6 * t);
      const bob = Math.abs(Math.sin(w.phase * 60)) * 0.08;
      e.setLocalPosition(x + (i % 2 ? 0.6 : -0.6), bob, z);
      e.setLocalEulerAngles(
        0,
        (Math.atan2(w.target[0], w.target[1]) * 180) / Math.PI + (w.phase < 1 ? 0 : 180),
        0,
      );
    });
  });
  return (
    <>
      {walkers.map((w, i) => (
        <Entity key={i} ref={(e) => void (refs.current[i] = e)}>
          <Cyl p={[0, 0, 0]} radius={0.28} h={1.1} m={w.tunic} />
          <Cyl p={[0, 1.1, 0]} radius={0.22} h={0.35} m={w.tunic} />
          <Entity position={[0, 1.65, 0]} scale={[0.36, 0.38, 0.36]}>
            <Render type="sphere" material={k.skin} castShadows />
          </Entity>
        </Entity>
      ))}
    </>
  );
}

/** Círculo de selección: segmentos luminosos que giran despacio alrededor de la parcela. */
function SelectionMarker({ k, p, size }: { k: Kit; p: V3; size: number }) {
  const ref = useRef<PcEntity | null>(null);
  useAppEvent('update', (dt: number) => {
    ref.current?.rotateLocal(0, dt * 12, 0);
  });
  const dashes = 28;
  const radius = size / 2;
  const len = ((2 * Math.PI * radius) / dashes) * 0.55;
  return (
    <Entity ref={ref} position={[p[0], 0.12, p[2]]}>
      {Array.from({ length: dashes }, (_, i) => {
        const a = (i / dashes) * Math.PI * 2;
        return (
          <Entity
            key={i}
            position={[Math.sin(a) * radius, 0, Math.cos(a) * radius]}
            rotation={[0, (a * 180) / Math.PI, 0]}
            scale={[len, 0.12, 0.35]}
          >
            <Render type="box" material={k.selection} castShadows={false} />
          </Entity>
        );
      })}
    </Entity>
  );
}

function City(props: CitySceneProps & { dragGuard: React.MutableRefObject<boolean> }) {
  const k = useKit();
  const r = getRuleset(props.rulesetVersion);
  const plots = r.cityLayout.plots;
  const byPlot = new Map(props.buildings.map((b) => [b.plot, b]));
  const wallLevel = props.buildings.find((b) => b.type === 'wall')?.level ?? 0;
  const targets = useMemo<Array<[number, number]>>(
    () => plots.filter((p) => p.kind === 'standard').map((p) => [p.x, p.z]),
    [plots],
  );
  const click = (plot: number) => () => {
    if (props.dragGuard.current) return;
    props.onSelectPlot(plot);
  };
  const selected = plots.find((p) => p.id === props.selectedPlot);

  return (
    <>
      <Ground k={k} coastal={props.coastal} />
      <PathStrips k={k} plots={plots} />
      <Scenery k={k} coastal={props.coastal} />
      <Entity onClick={click(13)}>
        <Wall k={k} level={wallLevel} coastal={props.coastal} />
      </Entity>
      {plots
        .filter((p) => p.kind !== 'wall' && (p.kind !== 'coastal' || props.coastal))
        .map((p) => {
          const b = byPlot.get(p.id);
          const building = props.construction?.plot === p.id;
          return (
            <Entity
              key={p.id}
              position={[p.x, 0, p.z]}
              rotation={[0, p.rotationY, 0]}
              onClick={click(p.id)}
            >
              {b ? (
                <BuildingModel type={b.type as BuildingType} stage={visualStage(b.level)} />
              ) : (
                <EmptyPlot k={k} size={p.kind === 'coastal' ? 9 : 7} />
              )}
              {building && <Scaffold k={k} size={p.kind === 'center' ? 12 : 8} h={b ? 7 : 4} />}
            </Entity>
          );
        })}
      <Villagers k={k} targets={targets} />
      {selected && (
        <SelectionMarker
          k={k}
          p={[selected.x, 0, selected.kind === 'wall' ? WALL_RADIUS : selected.z]}
          size={selected.kind === 'center' ? 16 : 11}
        />
      )}
    </>
  );
}

/**
 * Escena 3D de la ciudad (FR-003, FR-ART-05): órbita/zoom acotados, selección
 * por picking y estado visual derivado SIEMPRE de los datos del servidor.
 */
export function CityScene(props: CitySceneProps) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragGuard = useRef(false);
  return (
    <div
      className="scene"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        dragGuard.current = false;
      }}
      onPointerMove={(e) => {
        if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 6)
          dragGuard.current = true;
      }}
      onPointerUp={() => {
        down.current = null;
      }}
    >
      <Application
        fillMode={FILLMODE_NONE}
        resolutionMode={RESOLUTION_AUTO}
        graphicsDeviceOptions={{ antialias: true }}
      >
        <SceneSettings />
        <KitProvider civ={props.civilization}>
          <Entity name="sun" rotation={[50, 35, 0]}>
            <Light
              type="directional"
              color="#fff4e0"
              intensity={1.25}
              castShadows
              shadowBias={0.25}
              normalOffsetBias={0.05}
              shadowResolution={2048}
              shadowDistance={170}
              shadowType={SHADOW_PCF3_32F}
            />
          </Entity>
          <Entity name="fill" rotation={[30, -140, 0]}>
            <Light type="directional" color="#b8cbe8" intensity={0.35} />
          </Entity>
          <Entity name="camera" position={[0, 70, 95]}>
            <Camera clearColor="#a9c9e2" fov={42} farClip={1200} nearClip={0.5} />
            <Script
              script={CameraControls}
              focusPoint={FOCUS}
              enableFly={false}
              enablePan
              pitchRange={PITCH_RANGE}
              zoomRange={ZOOM_RANGE}
              rotateDamping={0.92}
              zoomDamping={0.92}
              moveDamping={0.92}
            />
          </Entity>
          <City {...props} dragGuard={dragGuard} />
        </KitProvider>
      </Application>
    </div>
  );
}
