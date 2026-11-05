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
const ZOOM_RANGE = new Vec2(30, 310);

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
  radius = WALL_RADIUS,
}: {
  level: number;
  coastal: boolean;
  civilization: CivilizationId;
  radius?: number;
}) {
  const items = useMemo(
    () =>
      wallRing(
        level,
        visualStage(Math.max(1, level)),
        civilization === 'imperial_crown' ||
          civilization === 'stone_wardens' ||
          civilization === 'steppe_clans'
          ? 'corona'
          : 'liga',
        coastal,
        radius,
      ),
    [level, coastal, civilization, radius],
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

/**
 * Barcos de la costa (aldeas costeras): uno amarrado junto al puerto y dos fondeados.
 * Decorado: el balanceo es visual y no representa unidades del servidor.
 */
function CoastalShips({
  civilization,
  hasPort,
}: {
  civilization: CivilizationId;
  hasPort: boolean;
}) {
  const civ = civilization === 'imperial_crown' ? 'corona' : 'liga';
  const ships = useMemo(
    () => [
      ...(hasPort ? [{ id: `ship_cog.${civ}.s1`, x: 9, z: -49, rot: 8, phase: 0 }] : []),
      {
        id: `ship_cog.${civ === 'corona' ? 'liga' : 'corona'}.s1`,
        x: -48,
        z: -95,
        rot: 120,
        phase: 1.7,
      },
      { id: `ship_galley.${civ}.s1`, x: 62, z: -128, rot: -70, phase: 3.1 },
    ],
    [civ, hasPort],
  );
  const refs = useRef<Array<PcEntity | null>>([]);
  useAppEvent('update', () => {
    const t = performance.now() / 1000;
    ships.forEach((s, i) => {
      const e = refs.current[i];
      if (!e) return;
      e.setLocalPosition(s.x, -0.35 + Math.sin(t * 0.9 + s.phase) * 0.12, s.z);
      e.setLocalEulerAngles(
        Math.sin(t * 0.7 + s.phase) * 1.6,
        s.rot,
        Math.sin(t * 0.55 + s.phase * 2) * 2.4,
      );
    });
  });
  return (
    <>
      {ships.map((s, i) => (
        <Entity key={s.id + i} ref={(e) => void (refs.current[i] = e)} position={[s.x, -0.35, s.z]}>
          <GlbModel url={`/assets/models/${s.id}.glb`} />
        </Entity>
      ))}
    </>
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
  const newCiv = ['stone_wardens', 'steppe_clans', 'forest_kin'].includes(civilization);
  const visualType =
    type === 'quarry' && newCiv
      ? 'clay_pit'
      : type === 'middle_wall' || type === 'inner_wall'
        ? 'wall'
        : type;
  const visualCiv =
    civilization === 'stone_wardens' || civilization === 'steppe_clans'
      ? 'imperial_crown'
      : civilization === 'forest_kin'
        ? 'sea_league'
        : civilization;
  const v: ManifestAsset | null = findVariant(manifest, visualType, visualCiv, stage);
  if (!v?.file) return <BuildingModel type={type} stage={stage} />;
  return <GlbModel url={`/${v.file}`} rotationY={v.facing === 'outward' ? 0 : 180} />;
}

function City(props: CitySceneProps & { dragGuard: React.MutableRefObject<boolean> }) {
  const k = useKit();
  const manifest = useManifest();
  const r = getRuleset(props.rulesetVersion);
  const plots = r.cityLayout.plots;
  const terrestrial = !!r.territory;
  const pathTargets = useMemo<Array<[number, number]>>(
    () =>
      plots
        .filter((p) => p.id !== 0 && (p.kind !== 'coastal' || props.coastal))
        .map((p) => [p.x, p.kind === 'wall' ? WALL_RADIUS + 6 : p.z]),
    [plots, props.coastal],
  );
  const scenery = useMemo(
    () => cityScenery(props.coastal, terrestrial ? 99 : WALL_RADIUS),
    [props.coastal, terrestrial],
  );
  const byPlot = new Map(props.buildings.map((b) => [b.plot, b]));
  const wallLevel = props.buildings.find((b) => b.type === 'wall')?.level ?? 0;
  const targets = useMemo<Array<[number, number]>>(
    () =>
      plots.filter((p) => p.kind === 'standard' || p.kind === 'industry').map((p) => [p.x, p.z]),
    [plots],
  );
  const click = (plot: number) => () => {
    if (props.dragGuard.current) return;
    props.onSelectPlot(plot);
  };
  const selected = plots.find((p) => p.id === props.selectedPlot);

  return (
    <>
      <CityTerrain
        coastal={props.coastal}
        paths={pathTargets}
        flatRadius={terrestrial ? 105 : 58}
      />
      <InstancedProps items={scenery} />
      {props.coastal && (
        <CoastalShips
          civilization={props.civilization}
          hasPort={props.buildings.some((b) => b.type === 'port')}
        />
      )}
      {!terrestrial && (
        <Entity onClick={click(13)}>
          <Wall level={wallLevel} coastal={props.coastal} civilization={props.civilization} />
        </Entity>
      )}
      {terrestrial &&
        plots
          .filter((p) => p.kind === 'fortification')
          .map((p) => (
            <Entity key={p.id} onClick={click(p.id)}>
              <Wall
                radius={p.radius!}
                level={byPlot.get(p.id)?.level ?? 0}
                coastal={false}
                civilization={props.civilization}
              />
            </Entity>
          ))}
      {plots
        .filter(
          (p) =>
            p.kind !== 'wall' &&
            p.kind !== 'fortification' &&
            (p.kind !== 'coastal' || props.coastal),
        )
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
          fog={
            props.rulesetVersion === 'frontier-alpha.1'
              ? { color: '#a7b89a', start: 450, end: 1000 }
              : { color: '#c4d3dc', start: 170, end: 560 }
          }
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
              intensity={1.25}
              castShadows
              shadowBias={0.2}
              normalOffsetBias={0.04}
              shadowResolution={profile.shadowResolution}
              shadowDistance={profile.shadowDistance}
              shadowType={SHADOW_PCF3_32F}
            />
          </Entity>
          <Entity
            name="camera"
            position={props.rulesetVersion === 'frontier-alpha.1' ? [0, 155, 210] : [0, 70, 95]}
            ref={(e) => void (cameraRef.current = e)}
          >
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
