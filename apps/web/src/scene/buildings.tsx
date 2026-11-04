import { Entity } from '@playcanvas/react';
import type { BuildingType } from '@reinos/game-config';
import {
  Ball,
  Banner,
  Barrel,
  Block,
  Cone,
  Crate,
  Crenellations,
  Cyl,
  Gable,
  Tower,
  useKit,
  type Kit,
} from './kit.js';

/**
 * Edificios del kit blockout. Convención: origen en el centro de la parcela,
 * fachada principal hacia -Z (la parcela se rota para mirar al centro),
 * 1 unidad = 1 metro, escala humana ≈ 1,8 m.
 */
type Stage = 1 | 2 | 3;
interface BProps {
  stage: Stage;
  k: Kit;
}

/** Casa con entramado de madera: muros de yeso + vigas + tejado a dos aguas. */
function House({
  w,
  d,
  h,
  k,
  roof,
}: {
  w: number;
  d: number;
  h: number;
  k: Kit;
  roof?: Kit[keyof Kit];
}) {
  return (
    <>
      <Block s={[w, 0.4, d]} m={k.stoneDark} />
      <Block p={[0, 0.4, 0]} s={[w, h, d]} m={k.plaster} />
      {/* vigas verticales y horizontales del entramado */}
      {[-w / 2, -w / 6, w / 6, w / 2].map((x) => (
        <Block
          key={x}
          p={[x, 0.4, -d / 2 - 0.02]}
          s={[0.22, h, 0.08]}
          m={k.timber}
          shadow={false}
        />
      ))}
      <Block
        p={[0, 0.4 + h * 0.55, -d / 2 - 0.03]}
        s={[w, 0.2, 0.08]}
        m={k.timber}
        shadow={false}
      />
      <Block p={[0, 0.4 + h - 0.1, -d / 2 - 0.03]} s={[w, 0.2, 0.08]} m={k.timber} shadow={false} />
      <Block p={[0, 0.4, -d / 2 - 0.05]} s={[1.1, 1.9, 0.1]} m={k.dark} shadow={false} />
      <Gable p={[0, 0.4 + h, 0]} w={d + 0.8} l={w + 0.6} h={d * 0.5} m={roof ?? k.roof} />
    </>
  );
}

function CityHall({ stage, k }: BProps) {
  const h = stage === 1 ? 7 : stage === 2 ? 9 : 11;
  const w = 9;
  return (
    <>
      <Block s={[w + 2, 0.6, w + 2]} m={k.stoneDark} />
      <Block p={[0, 0.6, 0]} s={[w, h, w]} m={k.stone} />
      <Block p={[0, 0.6 + h * 0.5, 0]} s={[w + 0.15, 0.3, w + 0.15]} m={k.stoneDark} />
      <Crenellations y={0.6 + h} w={w} d={w} m={k.stone} />
      {/* portón y ventanas */}
      <Block p={[0, 0.6, -w / 2 - 0.05]} s={[2.2, 3.2, 0.2]} m={k.timber} />
      <Block p={[0, 3.8, -w / 2 - 0.08]} s={[2.6, 0.35, 0.2]} m={k.stoneLight} />
      {[-2.6, 2.6].map((x) => (
        <Block
          key={x}
          p={[x, h * 0.62, -w / 2 - 0.05]}
          s={[0.6, 1.2, 0.1]}
          m={k.dark}
          shadow={false}
        />
      ))}
      {[
        [-w / 2, -w / 2],
        [w / 2, -w / 2],
        [-w / 2, w / 2],
        [w / 2, w / 2],
      ].map(([x, z]) => (
        <Tower key={`${x}${z}`} p={[x!, 0, z!]} radius={1.5} h={h + 2.5} roof k={k} />
      ))}
      <Banner p={[0, 0.6 + h + 0.7, 0]} h={4.5} k={k} />
      {stage >= 2 && (
        <Entity position={[0, 0, w / 2 + 3]}>
          <House w={6} d={4} h={3} k={k} />
        </Entity>
      )}
      {stage >= 3 && (
        <>
          <Block p={[0, 0.6 + h + 0.7, 0]} s={[4, 3, 4]} m={k.stoneLight} />
          <Cone p={[0, 0.6 + h + 3.7, 0]} radius={2.9} h={4} m={k.roof} />
        </>
      )}
      {/* escalinata */}
      <Block p={[0, 0, -w / 2 - 1.4]} s={[3.2, 0.3, 1]} m={k.stoneLight} />
    </>
  );
}

function Farm({ stage, k }: BProps) {
  const fields = stage === 1 ? 2 : stage === 2 ? 3 : 4;
  return (
    <>
      <Entity position={[0, 0, 2.5]}>
        <House w={6} d={4.5} h={3} k={k} roof={k.thatch} />
      </Entity>
      {Array.from({ length: fields }, (_, i) => {
        const x = -6 + (i % 2) * 7;
        const z = -4 - Math.floor(i / 2) * 6;
        const m = i % 2 === 0 ? k.field : k.crop;
        return (
          <Entity key={i} position={[x + 2.5, 0, z]}>
            <Block s={[6, 0.12, 5]} m={k.dirt} />
            {[-2, -1, 0, 1, 2].map((r) => (
              <Block key={r} p={[r * 1.1, 0.12, 0]} s={[0.6, 0.35, 4.6]} m={m} />
            ))}
          </Entity>
        );
      })}
      <Cyl p={[-4.5, 0, 3.5]} radius={0.9} h={1.2} m={k.hay} />
      <Cone p={[-4.5, 1.2, 3.5]} radius={0.95} h={0.8} m={k.hay} />
      <Cyl p={[4.5, 0, 4.5]} radius={0.7} h={0.9} m={k.hay} />
      {/* cerca */}
      {[-7, -4, -1, 2, 5, 8].map((x) => (
        <Block key={x} p={[x, 0, 6.5]} s={[0.15, 1, 0.15]} m={k.timber} />
      ))}
      <Block p={[0.5, 0.7, 6.5]} s={[15, 0.12, 0.08]} m={k.wood} />
    </>
  );
}

function Sawmill({ stage, k }: BProps) {
  return (
    <>
      <Block s={[8, 0.25, 6]} m={k.dirt} />
      {[
        [-3.5, -2.5],
        [3.5, -2.5],
        [-3.5, 2.5],
        [3.5, 2.5],
      ].map(([x, z]) => (
        <Block key={`${x}${z}`} p={[x!, 0.25, z!]} s={[0.35, 3.4, 0.35]} m={k.timber} />
      ))}
      <Gable p={[0, 3.6, 0]} w={6.8} l={8.4} h={1.8} m={k.thatch} />
      {/* sierra y tronco en el banco */}
      <Block p={[0, 0.25, 0]} s={[4.5, 0.9, 1.2]} m={k.wood} />
      <Cyl p={[0, 1.6, 0]} radius={0.8} h={0.08} r={[90, 0, 0]} m={k.iron} />
      {/* pilas de troncos */}
      {Array.from({ length: stage + 2 }, (_, i) => (
        <Cyl
          key={i}
          p={[-6 + (i % 3) * 0.05, 0.4 + Math.floor(i / 3) * 0.7, -2 + (i % 3) * 0.75]}
          radius={0.35}
          h={4}
          r={[0, 0, 90]}
          m={k.trunk}
        />
      ))}
      {Array.from({ length: stage * 2 }, (_, i) => (
        <Block key={`p${i}`} p={[6, 0.25 + i * 0.18, 1]} s={[1.6, 0.15, 3.5]} m={k.planks} />
      ))}
      {stage >= 2 && <Cyl p={[0, 0.25, 4.5]} radius={1.6} h={0.4} m={k.trunk} />}
    </>
  );
}

function Quarry({ stage, k }: BProps) {
  return (
    <>
      <Ball p={[0, 0, 3]} radius={4} s={[10, 5, 6]} m={k.rock} />
      <Ball p={[-4, 0, 1.5]} radius={2} s={[4, 3.2, 4]} m={k.stoneDark} />
      <Ball p={[4, 0, 2]} radius={2} s={[4.5, 3.8, 3.6]} m={k.rock} />
      <Block s={[9, 0.2, 5]} p={[0, 0, -2.5]} m={k.dirt} />
      {Array.from({ length: 2 + stage * 2 }, (_, i) => (
        <Block
          key={i}
          p={[-3 + (i % 4) * 1.6, 0.2 + Math.floor(i / 4) * 0.9, -3.5]}
          s={[1.4, 0.9, 1.1]}
          m={k.stoneLight}
          r={[0, (i * 17) % 20, 0]}
        />
      ))}
      {/* grúa de madera */}
      <Block p={[3.5, 0, -1]} s={[0.3, 5, 0.3]} m={k.timber} />
      <Block p={[2.2, 5, -1]} s={[3.2, 0.25, 0.25]} m={k.timber} />
      <Block p={[0.8, 2.6, -1]} s={[0.04, 2.4, 0.04]} m={k.iron} shadow={false} />
      <Block p={[0.8, 2, -1]} s={[0.8, 0.6, 0.8]} m={k.stoneLight} />
    </>
  );
}

function Mine({ stage, k }: BProps) {
  return (
    <>
      <Ball p={[0, -1, 3]} radius={5} s={[11, 9, 9]} m={k.rock} />
      <Ball p={[3, -0.5, 4]} radius={3} s={[6, 5, 5]} m={k.grassDark} />
      {/* entrada con marco de madera */}
      <Block p={[0, 0, -1.2]} s={[2.4, 2.6, 1]} m={k.dark} />
      <Block p={[-1.3, 0, -1.6]} s={[0.35, 2.9, 0.35]} m={k.timber} />
      <Block p={[1.3, 0, -1.6]} s={[0.35, 2.9, 0.35]} m={k.timber} />
      <Block p={[0, 2.9, -1.6]} s={[3.2, 0.35, 0.4]} m={k.timber} />
      {/* raíles y vagoneta */}
      <Block p={[-0.45, 0.02, -4]} s={[0.1, 0.08, 5]} m={k.iron} />
      <Block p={[0.45, 0.02, -4]} s={[0.1, 0.08, 5]} m={k.iron} />
      <Entity position={[0, 0.25, -4.5]}>
        <Block s={[1.2, 0.8, 1.6]} m={k.wood} />
        <Block p={[0, 0.8, 0]} s={[1, 0.25, 1.4]} m={k.stoneDark} />
        {[-0.55, 0.55].map((z) => (
          <Cyl key={z} p={[0, -0.05, z]} radius={0.25} h={1.3} r={[0, 0, 90]} m={k.iron} />
        ))}
      </Entity>
      {stage >= 2 && <Barrel p={[2.4, 0, -2.5]} k={k} />}
      {stage >= 3 && (
        <Entity position={[-4, 0, -2]}>
          <House w={3} d={3} h={2.2} k={k} roof={k.slate} />
        </Entity>
      )}
    </>
  );
}

function Warehouse({ stage, k }: BProps) {
  const l = stage === 1 ? 8 : stage === 2 ? 10 : 12;
  return (
    <>
      <House w={l} d={5.5} h={3.6} k={k} />
      <Barrel p={[-l / 2 + 0.6, 0, -3.6]} k={k} />
      <Barrel p={[-l / 2 + 1.5, 0, -3.8]} k={k} />
      <Crate p={[l / 2 - 1, 0, -3.6]} k={k} />
      <Crate p={[l / 2 - 1, 0.8, -3.6]} k={k} size={0.7} rot={20} />
      <Crate p={[l / 2 - 2, 0, -3.8]} k={k} rot={12} />
      {stage >= 2 && <Barrel p={[l / 2 - 3, 0, -3.7]} k={k} />}
    </>
  );
}

function Barracks({ stage, k }: BProps) {
  const l = stage === 1 ? 9 : 11;
  return (
    <>
      <Entity position={[0, 0, 3]}>
        <Block s={[l, 0.4, 5]} m={k.stoneDark} />
        <Block p={[0, 0.4, 0]} s={[l, 3.6, 5]} m={k.stone} />
        <Gable p={[0, 4, 0]} w={5.8} l={l + 0.6} h={2.2} m={k.roof} />
        <Block p={[0, 0.4, -2.55]} s={[1.6, 2.4, 0.1]} m={k.timber} />
      </Entity>
      {/* patio de entrenamiento */}
      <Block p={[0, 0, -3]} s={[l, 0.1, 6]} m={k.dirt} />
      {[-3, 0, 3].map((x) => (
        <Entity key={x} position={[x, 0, -3.5]}>
          <Block s={[0.18, 1.8, 0.18]} m={k.timber} />
          <Block p={[0, 1.2, 0]} s={[1, 0.15, 0.15]} m={k.timber} />
          <Ball p={[0, 1.9, 0]} radius={0.22} m={k.hay} />
        </Entity>
      ))}
      <Entity position={[l / 2 - 0.5, 0, -1]}>
        <Block s={[0.15, 1.6, 2]} m={k.timber} />
        {[-0.6, 0, 0.6].map((z) => (
          <Block key={z} p={[-0.15, 0.2, z]} s={[0.05, 1.8, 0.05]} r={[0, 0, 12]} m={k.iron} />
        ))}
      </Entity>
      <Banner p={[-l / 2 + 0.5, 0, -0.5]} h={5} k={k} />
      {stage >= 3 && <Tower p={[l / 2 + 1, 0, 3]} radius={1.2} h={7} roof k={k} />}
    </>
  );
}

function Hospital({ stage, k }: BProps) {
  return (
    <>
      <House w={8} d={5} h={3.4} k={k} roof={k.slate} />
      <Block p={[0, 2.2, -2.6]} s={[1.2, 1.2, 0.05]} m={k.cloth} shadow={false} />
      <Block p={[0, 2.25, -2.64]} s={[0.25, 0.9, 0.02]} m={k.herb} shadow={false} />
      <Block p={[0, 2.25, -2.64]} s={[0.9, 0.25, 0.02]} m={k.herb} shadow={false} />
      {/* huerto de hierbas medicinales */}
      {Array.from({ length: 3 + stage }, (_, i) => (
        <Ball key={i} p={[-3 + i * 1.2, 0.25, -4.2]} radius={0.45} m={k.herb} />
      ))}
      {stage >= 2 && (
        <Entity position={[5.5, 0, 0]}>
          <House w={3} d={4} h={2.6} k={k} roof={k.slate} />
        </Entity>
      )}
    </>
  );
}

function Temple({ stage, k }: BProps) {
  const cols = stage === 1 ? 4 : 6;
  const w = cols * 1.6;
  return (
    <>
      <Block s={[w + 2, 0.4, 8]} m={k.stoneLight} />
      <Block p={[0, 0.4, 0]} s={[w + 1.2, 0.4, 7.2]} m={k.stoneLight} />
      <Block p={[0, 0.8, 1]} s={[w - 0.4, 4.2, 4.5]} m={k.plaster} />
      {Array.from({ length: cols }, (_, i) => (
        <Cyl
          key={i}
          p={[-w / 2 + 0.8 + i * 1.6, 0.8, -2.4]}
          radius={0.32}
          h={4.2}
          m={k.stoneLight}
        />
      ))}
      <Block p={[0, 5, -0.2]} s={[w + 0.8, 0.5, 7]} m={k.stoneLight} />
      <Gable p={[0, 5.5, -0.2]} w={7.4} l={w + 1} h={1.6} m={k.roof} />
      <Block p={[0, 0.8, -1.2]} s={[1.3, 2.6, 0.1]} m={k.dark} />
      <Cyl p={[-w / 2 - 0.4, 0.8, -3.2]} radius={0.35} h={0.9} m={k.stoneDark} />
      <Ball p={[-w / 2 - 0.4, 1.8, -3.2]} radius={0.22} m={k.fire} shadow={false} />
      <Cyl p={[w / 2 + 0.4, 0.8, -3.2]} radius={0.35} h={0.9} m={k.stoneDark} />
      <Ball p={[w / 2 + 0.4, 1.8, -3.2]} radius={0.22} m={k.fire} shadow={false} />
      {stage >= 3 && <Ball p={[0, 7, 1]} radius={1.8} s={[3.6, 2.6, 3.6]} m={k.gold} />}
    </>
  );
}

/** Puerto: muelle que se adentra en el agua por +Z local (la parcela está girada 180°). */
function Port({ stage, k }: BProps) {
  const len = stage === 1 ? 12 : stage === 2 ? 16 : 20;
  return (
    <>
      <Block p={[0, 0, -2]} s={[10, 0.5, 4]} m={k.stoneDark} />
      <Block p={[0, 0.3, len / 2 + 1]} s={[3.4, 0.3, len]} m={k.planks} />
      {Array.from({ length: Math.floor(len / 3) + 1 }, (_, i) => (
        <Entity key={i}>
          <Cyl p={[-1.6, -1.5, 1 + i * 3]} radius={0.18} h={2.2} m={k.timber} />
          <Cyl p={[1.6, -1.5, 1 + i * 3]} radius={0.18} h={2.2} m={k.timber} />
        </Entity>
      ))}
      <Entity position={[-4, 0, -2.5]}>
        <House w={4} d={3} h={2.6} k={k} />
      </Entity>
      <Crate p={[2.5, 0.5, -1.5]} k={k} />
      <Barrel p={[3.6, 0.5, -1.8]} k={k} />
      <Ship p={[4.5, -0.3, len * 0.6]} k={k} />
      {stage >= 2 && <Ship p={[-4.8, -0.3, len * 0.75]} k={k} small />}
      {/* grúa de puerto */}
      <Block p={[1.2, 0.45, len]} s={[0.3, 5, 0.3]} m={k.timber} />
      <Block p={[2.4, 5.4, len]} s={[2.8, 0.25, 0.25]} m={k.timber} />
    </>
  );
}

export function Ship({
  p,
  k,
  small = false,
}: {
  p: [number, number, number];
  k: Kit;
  small?: boolean;
}) {
  const s = small ? 0.7 : 1;
  return (
    <Entity position={p} scale={[s, s, s]}>
      <Ball p={[0, 0.5, 0]} radius={1} s={[2.6, 1.6, 8]} m={k.wood} />
      <Block p={[0, 0.9, 0]} s={[2.3, 0.15, 6.5]} m={k.planks} />
      <Cyl p={[0, 0.9, 0.3]} radius={0.12} h={6} m={k.timber} />
      <Block p={[0, 3.5, 0.3]} s={[3.6, 3.2, 0.06]} m={k.cloth} />
      <Block p={[0, 5.4, 0.3]} s={[0.8, 0.5, 0.04]} m={k.banner} />
    </Entity>
  );
}

function Bastion({ stage, k }: BProps) {
  const h = 9 + stage * 2;
  return (
    <>
      <Cyl radius={5.2} h={1} m={k.stoneDark} />
      <Tower p={[0, 1, 0]} radius={4} h={h} roof={false} k={k} />
      <Cyl p={[0, h + 1.6, 0]} radius={2.2} h={3} m={k.stone} />
      <Cone p={[0, h + 4.6, 0]} radius={2.8} h={3.5} m={k.roof} />
      <Block p={[0, 1, -4]} s={[2, 3, 0.4]} m={k.timber} />
      <Banner p={[0, h + 8, 0]} h={3} k={k} />
    </>
  );
}

function Arsenal({ stage, k }: BProps) {
  return (
    <>
      <Block s={[12, 0.4, 8]} m={k.stoneDark} />
      {[-5, -1.7, 1.7, 5].map((x) => (
        <Block key={x} p={[x, 0.4, 0]} s={[0.6, 4.5, 7.5]} m={k.stone} />
      ))}
      <Gable p={[0, 4.9, 0]} w={8.4} l={12.4} h={2.6} m={k.roof} />
      {/* casco en construcción */}
      <Entity position={[0, 0.4, 0]} rotation={[0, 90, 0]}>
        {Array.from({ length: 5 + stage }, (_, i) => (
          <Block key={i} p={[0, 0, -3 + i * 0.9]} s={[2.6, 1.5, 0.15]} m={k.wood} />
        ))}
        <Block p={[0, 0, 0]} s={[0.3, 0.3, 7]} m={k.timber} />
      </Entity>
      <Banner p={[6.5, 0, -3.5]} h={5} k={k} />
    </>
  );
}

const BUILDINGS: Partial<Record<BuildingType, (p: BProps) => React.ReactElement>> = {
  city_hall: CityHall,
  farm: Farm,
  sawmill: Sawmill,
  quarry: Quarry,
  mine: Mine,
  warehouse: Warehouse,
  barracks: Barracks,
  hospital: Hospital,
  temple: Temple,
  port: Port,
  imperial_bastion: Bastion,
  naval_arsenal: Arsenal,
};

export function BuildingModel({ type, stage }: { type: BuildingType; stage: Stage }) {
  const k = useKit();
  const C = BUILDINGS[type];
  if (!C) return null;
  return <C stage={stage} k={k} />;
}

/** Parcela vacía: tierra apisonada con estacas de replanteo. */
export function EmptyPlot({ k, size = 7 }: { k: Kit; size?: number }) {
  const h = size / 2;
  return (
    <>
      <Block s={[size, 0.06, size]} m={k.dirt} shadow={false} />
      {[
        [-h, -h],
        [h, -h],
        [-h, h],
        [h, h],
      ].map(([x, z]) => (
        <Block key={`${x}${z}`} p={[x!, 0, z!]} s={[0.15, 0.9, 0.15]} m={k.wood} />
      ))}
      <Block p={[0, 0.9, -h]} s={[size, 0.04, 0.04]} m={k.cloth} shadow={false} />
    </>
  );
}

/** Andamiaje de obra para construcción en curso. */
export function Scaffold({ k, size = 7, h = 5 }: { k: Kit; size?: number; h?: number }) {
  const half = size / 2;
  const posts: Array<[number, number]> = [];
  for (const x of [-half, 0, half]) for (const z of [-half, half]) posts.push([x, z]);
  return (
    <>
      {posts.map(([x, z]) => (
        <Block key={`${x}${z}`} p={[x, 0, z]} s={[0.14, h, 0.14]} m={k.wood} />
      ))}
      {[h * 0.45, h * 0.9].map((y) => (
        <Entity key={y}>
          <Block p={[0, y, -half]} s={[size, 0.12, 0.6]} m={k.planks} />
          <Block p={[0, y, half]} s={[size, 0.12, 0.6]} m={k.planks} />
        </Entity>
      ))}
      <Crate p={[half + 1, 0, -half]} k={k} />
      <Block p={[-half - 1, 0, half]} s={[1.2, 0.6, 0.9]} m={k.stoneLight} />
    </>
  );
}
