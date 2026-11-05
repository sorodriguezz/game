import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Entity } from '@playcanvas/react';
import { Render } from '@playcanvas/react/components';
import { BLEND_NORMAL, Color, StandardMaterial } from 'playcanvas';
import type { CivilizationId } from '@reinos/game-config';

/**
 * Kit procedural "blockout" (ADR-0008). NO es arte final aprobado: sirve para
 * validar escala, cámara, parcelas e interacción hasta que existan GLB
 * aprobados en `public/assets/manifest.json`. Materiales PBR compartidos
 * (metalness/gloss) para que la iluminación sea coherente con los GLB futuros.
 */

export type V3 = [number, number, number];

function mat(
  hex: string,
  o: { gloss?: number; metalness?: number; opacity?: number; emissive?: string } = {},
): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse = new Color().fromString(hex);
  m.useMetalness = true;
  m.metalness = o.metalness ?? 0;
  m.gloss = o.gloss ?? 0.25;
  if (o.emissive) m.emissive = new Color().fromString(o.emissive);
  if (o.opacity !== undefined) {
    m.opacity = o.opacity;
    m.blendType = BLEND_NORMAL;
    m.depthWrite = false;
  }
  m.update();
  return m;
}

const CIV_COLORS: Record<CivilizationId, { roof: string; banner: string; trim: string }> = {
  stone_wardens: { roof: '#6c7780', banner: '#3b6585', trim: '#d8ba69' },
  steppe_clans: { roof: '#8d442d', banner: '#a13d28', trim: '#d8aa64' },
  forest_kin: { roof: '#456c4a', banner: '#366645', trim: '#c8b86c' },
  imperial_crown: { roof: '#8b3a2b', banner: '#a3242a', trim: '#d4b25a' },
  sea_league: { roof: '#2f5a7a', banner: '#1f6f8b', trim: '#e8e2cf' },
};

export function createKit(civ: CivilizationId) {
  const c = CIV_COLORS[civ];
  return {
    stone: mat('#a59d8f', { gloss: 0.2 }),
    stoneDark: mat('#7a7468', { gloss: 0.18 }),
    stoneLight: mat('#c9c1b0', { gloss: 0.22 }),
    plaster: mat('#e7dcc3', { gloss: 0.15 }),
    timber: mat('#5e4129', { gloss: 0.2 }),
    wood: mat('#8c6a43', { gloss: 0.22 }),
    planks: mat('#a07d52', { gloss: 0.2 }),
    roof: mat(c.roof, { gloss: 0.3 }),
    slate: mat('#4c535c', { gloss: 0.35 }),
    thatch: mat('#c3a35b', { gloss: 0.1 }),
    banner: mat(c.banner, { gloss: 0.2 }),
    trim: mat(c.trim, { gloss: 0.5, metalness: 0.4 }),
    gold: mat('#c9a24b', { gloss: 0.7, metalness: 0.9 }),
    iron: mat('#7d838b', { gloss: 0.6, metalness: 0.85 }),
    dark: mat('#2a211a', { gloss: 0.1 }),
    grass: mat('#6c8c43', { gloss: 0.08 }),
    grassDark: mat('#55743a', { gloss: 0.08 }),
    dirt: mat('#9a8261', { gloss: 0.05 }),
    sand: mat('#d8c48f', { gloss: 0.1 }),
    field: mat('#c2a84d', { gloss: 0.08 }),
    crop: mat('#7f9d3c', { gloss: 0.1 }),
    hay: mat('#d6b65e', { gloss: 0.08 }),
    foliage: mat('#4d7a35', { gloss: 0.12 }),
    foliageDark: mat('#3c6629', { gloss: 0.12 }),
    trunk: mat('#58402a', { gloss: 0.1 }),
    rock: mat('#8f8b84', { gloss: 0.15 }),
    water: mat('#2f6d8f', { gloss: 0.9, metalness: 0.1, opacity: 0.86 }),
    deepWater: mat('#1f4f6e', { gloss: 0.9 }),
    cloth: mat('#efe7d4', { gloss: 0.1 }),
    herb: mat('#3f8a4f', { gloss: 0.1 }),
    fire: mat('#ffb347', { emissive: '#ff8c2a', gloss: 0.1 }),
    selection: mat('#ffd36e', { emissive: '#f0b030', gloss: 0.4, opacity: 0.85 }),
    /** Marca de suelo translúcida del bando (anillo de formación en la batalla táctica). */
    teamMark: mat(c.banner, { emissive: c.banner, gloss: 0.1, opacity: 0.26 }),
    ghost: mat('#ffffff', { opacity: 0.25 }),
    skin: mat('#c99b76', { gloss: 0.2 }),
    tunic: mat(c.banner, { gloss: 0.15 }),
    tunic2: mat('#6b5a3a', { gloss: 0.15 }),
  };
}

export type Kit = ReturnType<typeof createKit>;
const KitContext = createContext<Kit | null>(null);

export function KitProvider({ civ, children }: { civ: CivilizationId; children: ReactNode }) {
  const kit = useMemo(() => createKit(civ), [civ]);
  return <KitContext.Provider value={kit}>{children}</KitContext.Provider>;
}

export function useKit(): Kit {
  const k = useContext(KitContext);
  if (!k) throw new Error('KitProvider ausente');
  return k;
}

type Prim = 'box' | 'cylinder' | 'cone' | 'sphere' | 'plane' | 'capsule' | 'torus';

interface PrimProps {
  p?: V3;
  s?: V3;
  r?: V3;
  m: StandardMaterial;
  shadow?: boolean;
}

function Prim({
  type,
  p = [0, 0, 0],
  s = [1, 1, 1],
  r = [0, 0, 0],
  m,
  shadow = true,
}: PrimProps & { type: Prim }) {
  return (
    <Entity position={p} scale={s} rotation={r}>
      <Render type={type} material={m} castShadows={shadow} receiveShadows />
    </Entity>
  );
}

/** Caja con la base apoyada en y=p[1]. */
export const Block = ({ p = [0, 0, 0], s = [1, 1, 1], ...rest }: PrimProps) => (
  <Prim type="box" p={[p[0], p[1] + s[1] / 2, p[2]]} s={s} {...rest} />
);
/** Cilindro de radio r y altura h con base en y=p[1]. */
export const Cyl = ({
  p = [0, 0, 0],
  radius,
  h,
  ...rest
}: Omit<PrimProps, 's'> & { radius: number; h: number }) => (
  <Prim type="cylinder" p={[p[0], p[1] + h / 2, p[2]]} s={[radius * 2, h, radius * 2]} {...rest} />
);
export const Cone = ({
  p = [0, 0, 0],
  radius,
  h,
  ...rest
}: Omit<PrimProps, 's'> & { radius: number; h: number }) => (
  <Prim type="cone" p={[p[0], p[1] + h / 2, p[2]]} s={[radius * 2, h, radius * 2]} {...rest} />
);
export const Ball = ({
  p = [0, 0, 0],
  radius,
  s,
  ...rest
}: Omit<PrimProps, 's'> & { radius: number; s?: V3 }) => (
  <Prim type="sphere" p={p} s={s ?? [radius * 2, radius * 2, radius * 2]} {...rest} />
);
export const Plane = (props: PrimProps) => <Prim type="plane" shadow={false} {...props} />;
export const Ring = (props: PrimProps) => <Prim type="torus" shadow={false} {...props} />;
export const Pill = (props: PrimProps) => <Prim type="capsule" {...props} />;

/**
 * Tejado a dos aguas: prisma triangular con la cumbrera paralela a X.
 * `w` = ancho (Z) incluyendo alero, `l` = largo (X), `h` = altura de la cumbrera.
 */
export function Gable({
  p = [0, 0, 0],
  w,
  l,
  h,
  m,
}: {
  p?: V3;
  w: number;
  l: number;
  h: number;
  m: StandardMaterial;
}) {
  const a = w / Math.SQRT2;
  return (
    <Entity position={p} scale={[1, (2 * h) / w, 1]}>
      <Entity rotation={[45, 0, 0]} scale={[l, a, a]}>
        <Render type="box" material={m} castShadows receiveShadows />
      </Entity>
    </Entity>
  );
}

/** Almenas a lo largo de un rectángulo (merlones). */
export function Crenellations({
  y,
  w,
  d,
  m,
  size = 0.7,
}: {
  y: number;
  w: number;
  d: number;
  m: StandardMaterial;
  size?: number;
}) {
  const out: React.ReactElement[] = [];
  const step = size * 2;
  for (let x = -w / 2 + size / 2; x <= w / 2 - size / 2 + 1e-6; x += step) {
    out.push(<Block key={`n${x}`} p={[x, y, -d / 2 + size / 2]} s={[size, size, size]} m={m} />);
    out.push(<Block key={`s${x}`} p={[x, y, d / 2 - size / 2]} s={[size, size, size]} m={m} />);
  }
  for (let z = -d / 2 + size * 1.5; z <= d / 2 - size * 1.5 + 1e-6; z += step) {
    out.push(<Block key={`w${z}`} p={[-w / 2 + size / 2, y, z]} s={[size, size, size]} m={m} />);
    out.push(<Block key={`e${z}`} p={[w / 2 - size / 2, y, z]} s={[size, size, size]} m={m} />);
  }
  return <>{out}</>;
}

/** Torre redonda con almenado opcional y tejado cónico. */
export function Tower({
  p = [0, 0, 0],
  radius,
  h,
  roof,
  k,
}: {
  p?: V3;
  radius: number;
  h: number;
  roof: boolean;
  k: Kit;
}) {
  return (
    <Entity position={p}>
      <Cyl radius={radius} h={h} m={k.stone} />
      <Cyl p={[0, h * 0.35, 0]} radius={radius * 1.02} h={0.25} m={k.stoneDark} />
      <Cyl p={[0, h, 0]} radius={radius * 1.18} h={0.6} m={k.stoneDark} />
      {roof ? (
        <Cone p={[0, h + 0.6, 0]} radius={radius * 1.3} h={radius * 2.4} m={k.roof} />
      ) : (
        [0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <Block
              key={deg}
              p={[Math.sin(rad) * radius * 1.05, h + 0.6, Math.cos(rad) * radius * 1.05]}
              s={[0.55, 0.6, 0.55]}
              m={k.stone}
            />
          );
        })
      )}
      {/* aspilleras */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <Block
            key={`w${deg}`}
            p={[Math.sin(rad) * radius * 0.98, h * 0.62, Math.cos(rad) * radius * 0.98]}
            s={[0.25, 0.8, 0.25]}
            m={k.dark}
            shadow={false}
          />
        );
      })}
    </Entity>
  );
}

/** Estandarte en un mástil. */
export function Banner({ p = [0, 0, 0], h = 4, k }: { p?: V3; h?: number; k: Kit }) {
  return (
    <Entity position={p}>
      <Cyl radius={0.06} h={h} m={k.timber} />
      <Block p={[0.55, h - 1.3, 0]} s={[1.0, 1.2, 0.05]} m={k.banner} />
      <Ball p={[0, h + 0.1, 0]} radius={0.12} m={k.gold} />
    </Entity>
  );
}

export function Barrel({ p, k }: { p: V3; k: Kit }) {
  return (
    <Entity position={p}>
      <Cyl radius={0.38} h={0.9} m={k.wood} />
      <Cyl p={[0, 0.15, 0]} radius={0.4} h={0.08} m={k.iron} />
      <Cyl p={[0, 0.67, 0]} radius={0.4} h={0.08} m={k.iron} />
    </Entity>
  );
}

export function Crate({
  p,
  k,
  size = 0.8,
  rot = 0,
}: {
  p: V3;
  k: Kit;
  size?: number;
  rot?: number;
}) {
  return <Block p={p} s={[size, size, size]} r={[0, rot, 0]} m={k.planks} />;
}

export function Tree({
  p,
  scale = 1,
  kind = 0,
  k,
}: {
  p: V3;
  scale?: number;
  kind?: number;
  k: Kit;
}) {
  if (kind === 1) {
    // conífera
    return (
      <Entity position={p} scale={[scale, scale, scale]}>
        <Cyl radius={0.25} h={1.4} m={k.trunk} />
        <Cone p={[0, 1.0, 0]} radius={1.6} h={2.6} m={k.foliageDark} />
        <Cone p={[0, 2.3, 0]} radius={1.2} h={2.2} m={k.foliageDark} />
        <Cone p={[0, 3.4, 0]} radius={0.8} h={1.8} m={k.foliageDark} />
      </Entity>
    );
  }
  return (
    <Entity position={p} scale={[scale, scale, scale]}>
      <Cyl radius={0.28} h={2.2} m={k.trunk} />
      <Ball p={[0, 3.0, 0]} radius={1.5} m={k.foliage} />
      <Ball p={[0.8, 2.6, 0.4]} radius={1.05} m={k.foliage} />
      <Ball p={[-0.7, 2.7, -0.4]} radius={1.1} m={k.foliageDark} />
    </Entity>
  );
}
