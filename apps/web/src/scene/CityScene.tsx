import { useEffect, useMemo, useRef, useState } from 'react';
import { Application, Entity } from '@playcanvas/react';
import { Camera, Light, Render, Script } from '@playcanvas/react/components';
import { RenderTelemetry } from '../perf/RenderTelemetry.js';
import { useApp, useAppEvent } from '@playcanvas/react/hooks';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import {
  FILLMODE_NONE,
  RESOLUTION_AUTO,
  SHADOW_PCF3_32F,
  Vec2,
  Vec3,
  type Entity as PcEntity,
} from 'playcanvas';
import { getRuleset, type BuildingType, type CivilizationId } from '@reinos/game-config';
import { visualStage } from '@reinos/game-rules';
import type { BuildingView, ConstructionOrderView } from '@reinos/contracts';
import { BuildingModel, EmptyPlot, Scaffold } from './buildings.js';
import { GlbModel } from '../assets/GlbModel.js';
import { AssetRuntime, findVariant, loadManifest, type ManifestAsset } from '../assets/runtime.js';
import { CityTerrain, InstancedProps, cityScenery, wallRing } from './environment.js';
import { SceneLighting } from './SceneLighting.js';
import { useGraphicsProfile } from './graphics.js';
import { Cyl, KitProvider, useKit, type Kit, type V3 } from './kit.js';

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

function Wall({
  level,
  coastal,
  civilization,
}: {
  level: number;
  coastal: boolean;
  civilization: CivilizationId;
}) {
  const items = useMemo(
    () =>
      wallRing(
        level,
        visualStage(Math.max(1, level)),
        civilization === 'imperial_crown' ? 'corona' : 'liga',
        coastal,
        WALL_RADIUS,
      ),
    [level, coastal, civilization],
  );
  return <InstancedProps items={items} lod="LOD0" attachToParent />;
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

/** Aplica las distancias de LOD del perfil gráfico al runtime de assets de esta escena. */
function LodTuning({ distances }: { distances: [number, number] }) {
  const app = useApp();
  useEffect(() => {
    AssetRuntime.for(app).lodDistances = distances;
  }, [app, distances]);
  return null;
}

type Manifest = Awaited<ReturnType<typeof loadManifest>>;

function useManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((x) => alive && setM(x))
      .catch(() => alive && setM({ styleVersion: 'none', assets: [] }));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

/**
 * Edificio de una parcela: GLB publicado (por tipo, civilización y etapa) o, si no
 * existe variante, el kit provisional. La puerta mira a la plaza salvo en el puerto.
 */
function BuildingSlot({
  manifest,
  type,
  civilization,
  stage,
}: {
  manifest: Manifest | null;
  type: BuildingType;
  civilization: CivilizationId;
  stage: 1 | 2 | 3;
}) {
  if (!manifest) return null;
  const v: ManifestAsset | null = findVariant(manifest, type, civilization, stage);
  if (!v?.file) return <BuildingModel type={type} stage={stage} />;
  return <GlbModel url={`/${v.file}`} rotationY={v.facing === 'outward' ? 0 : 180} />;
}

function City(props: CitySceneProps & { dragGuard: React.MutableRefObject<boolean> }) {
  const k = useKit();
  const manifest = useManifest();
  const r = getRuleset(props.rulesetVersion);
  const plots = r.cityLayout.plots;
  const pathTargets = useMemo<Array<[number, number]>>(
    () =>
      plots
        .filter((p) => p.id !== 0 && (p.kind !== 'coastal' || props.coastal))
        .map((p) => [p.x, p.kind === 'wall' ? WALL_RADIUS + 6 : p.z]),
    [plots, props.coastal],
  );
  const scenery = useMemo(() => cityScenery(props.coastal, WALL_RADIUS), [props.coastal]);
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
      <CityTerrain coastal={props.coastal} paths={pathTargets} />
      <InstancedProps items={scenery} />
      <Entity onClick={click(13)}>
        <Wall level={wallLevel} coastal={props.coastal} civilization={props.civilization} />
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
                <BuildingSlot
                  manifest={manifest}
                  type={b.type as BuildingType}
                  civilization={props.civilization}
                  stage={visualStage(b.level)}
                />
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
  const cameraRef = useRef<PcEntity | null>(null);
  const profile = useGraphicsProfile();
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
        <SceneLighting
          profile={profile}
          camera={cameraRef}
          fog={{ color: '#c4d3dc', start: 170, end: 560 }}
          exposure={0.95}
          envIntensity={0.6}
        />
        <LodTuning distances={profile.lodDistances} />
        <RenderTelemetry scene="city" />
        <KitProvider civ={props.civilization}>
          <Entity name="sun" rotation={[50, 35, 0]}>
            <Light
              type="directional"
              color="#ffe8c8"
              intensity={1.7}
              castShadows
              shadowBias={0.2}
              normalOffsetBias={0.04}
              shadowResolution={profile.shadowResolution}
              shadowDistance={profile.shadowDistance}
              shadowType={SHADOW_PCF3_32F}
            />
          </Entity>
          <Entity name="camera" position={[0, 70, 95]} ref={(e) => void (cameraRef.current = e)}>
            <Camera clearColor="#b9cdd9" fov={42} farClip={1400} nearClip={0.5} />
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
