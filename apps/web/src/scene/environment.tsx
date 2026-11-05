import { useEffect, useMemo } from 'react';
import { useApp, useAppEvent, useParent } from '@playcanvas/react/hooks';
import {
  BUFFER_STATIC,
  Entity,
  Mat4,
  Mesh,
  MeshInstance,
  PRIMITIVE_TRIANGLES,
  Quat,
  StandardMaterial,
  Vec2,
  Vec3,
  VertexBuffer,
  VertexFormat,
  type AppBase,
  type RenderComponent,
} from 'playcanvas';
import { AssetRuntime } from '../assets/runtime.js';

/**
 * Entorno natural generado de forma determinista (semillas fijas): terreno con
 * relieve suave fuera del recinto, playa y mar para aldeas costeras, caminos de
 * tierra con borde difuso y vegetación instanciada desde GLB del pipeline.
 * Es decorado: no altera reglas ni colisiones del servidor.
 */

function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  const u = s(fx);
  const v = s(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const SEA_LEVEL = -0.35;
/** Línea de costa (z) para aldeas costeras: el mar queda en z < SHORE_Z. */
export const SHORE_Z = -33;

/** Altura del terreno (m). Plano dentro del recinto (r < 58 m) para no afectar a las parcelas. */
export function terrainHeight(x: number, z: number, coastal: boolean): number {
  const r = Math.hypot(x, z);
  const n = fbm(x / 42 + 17.3, z / 42 - 4.1);
  let h = smooth(58, 110, r) * (n * 9 + Math.max(0, r - 110) * 0.08);
  // sierras lejanas como fondo (siguen siendo terreno, no conos)
  h += smooth(190, 320, r) * fbm(x / 70, z / 70) * 70;
  if (coastal) {
    const beach = smooth(SHORE_Z + 2, SHORE_Z - 12, z); // 0 en tierra, 1 mar adentro
    h = h * (1 - beach) - beach * 3.2;
  }
  return h;
}

function gridMesh(
  app: AppBase,
  size: number | [number, number],
  cells: number | [number, number],
  height: (x: number, z: number) => number,
  color: (x: number, z: number, y: number) => [number, number, number, number],
  cx = 0,
  cz = 0,
): Mesh {
  const [sx, sz] = typeof size === 'number' ? [size, size] : size;
  const [cxn, czn] = typeof cells === 'number' ? [cells, cells] : cells;
  const n = cxn + 1;
  const rows = czn + 1;
  const pos = new Float32Array(n * rows * 3);
  const nrm = new Float32Array(n * rows * 3);
  const uv = new Float32Array(n * rows * 2);
  const col = new Uint8Array(n * rows * 4);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = cx - sx / 2 + (i * sx) / cxn;
      const z = cz - sz / 2 + (j * sz) / czn;
      const y = height(x, z);
      pos.set([x, y, z], k * 3);
      const e = 0.5;
      const dx = height(x + e, z) - height(x - e, z);
      const dz = height(x, z + e) - height(x, z - e);
      const l = Math.hypot(dx, 2 * e, dz);
      nrm.set([-dx / l, (2 * e) / l, -dz / l], k * 3);
      uv.set([x, z], k * 2); // UV en metros: el material repite cada `tileMeters`
      const c = color(x, z, y);
      col.set(
        c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)),
        k * 4,
      );
    }
  const idx = new Uint32Array(cxn * czn * 6);
  let p = 0;
  for (let j = 0; j < czn; j++)
    for (let i = 0; i < cxn; i++) {
      const a = j * n + i;
      idx.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], p);
      p += 6;
    }
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(pos);
  mesh.setNormals(nrm);
  mesh.setUvs(0, uv);
  mesh.setColors32(col);
  mesh.setIndices(idx);
  mesh.update(PRIMITIVE_TRIANGLES);
  return mesh;
}

function addMesh(
  app: AppBase,
  name: string,
  mesh: Mesh,
  material: StandardMaterial,
  shadows = { cast: false, receive: true },
): Entity {
  const e = new Entity(name);
  e.addComponent('render', {
    meshInstances: [new MeshInstance(mesh, material)],
    castShadows: shadows.cast,
    receiveShadows: shadows.receive,
  });
  app.root.addChild(e);
  return e;
}

/** Terreno, playa, mar y caminos de la ciudad. */
export function CityTerrain({
  coastal,
  paths,
}: {
  coastal: boolean;
  paths: Array<[number, number]>;
}) {
  const app = useApp();
  const water = useMemo(() => ({ t: 0, mat: null as StandardMaterial | null }), []);
  useEffect(() => {
    const rt = AssetRuntime.for(app);
    const ents: Entity[] = [];
    const meshes: Mesh[] = [];
    const h = (x: number, z: number) => terrainHeight(x, z, coastal);
    // variación macro en color de vértice: zonas secas, hondonadas más oscuras, orilla arenosa
    const tint = (x: number, z: number, y: number): [number, number, number, number] => {
      const m = fbm(x / 23 + 3.1, z / 23 + 8.7);
      const dry = smooth(0.55, 0.75, fbm(x / 60 - 9, z / 60 + 2));
      const k = 0.82 + m * 0.3 - Math.max(0, -y) * 0.05;
      return [k * (1 + dry * 0.12), k * (1 + dry * 0.05), k * (1 - dry * 0.1), 1];
    };
    const ground = gridMesh(app, 900, 180, h, tint);
    meshes.push(ground);
    ents.push(addMesh(app, 'terrain', ground, rt.material('terrain.grass')));
    if (coastal) {
      // franja de arena que baja bajo el agua (sustituye al terreno de hierba en la orilla)
      const sand = gridMesh(
        app,
        [900, 36],
        [180, 18],
        (x, z) => h(x, z) + 0.02,
        (x, z) => {
          const a =
            smooth(SHORE_Z + 7, SHORE_Z + 3, z) * (1 - smooth(SHORE_Z - 14, SHORE_Z - 20, z));
          const v = 0.95 + fbm(x / 9, z / 9) * 0.1;
          return [v, v, v, a];
        },
        0,
        SHORE_Z - 4,
      );
      meshes.push(sand);
      const sandMat = rt.material('terrain.sand', { blend: true });
      ents.push(addMesh(app, 'beach', sand, sandMat));
      // mar: plano con UV en metros y normales animadas
      const sea = gridMesh(
        app,
        1400,
        8,
        () => SEA_LEVEL,
        () => [1, 1, 1, 1],
        0,
        -730 + SHORE_Z + 10,
      );
      meshes.push(sea);
      const seaMat = rt.material('common.water', { water: true });
      water.mat = seaMat;
      ents.push(addMesh(app, 'sea', sea, seaMat, { cast: false, receive: false }));
    }
    // caminos: cintas de tierra desde la plaza a cada parcela, con borde difuso (alfa de vértice)
    const pathMat = rt.material('terrain.dirt', { blend: true });
    for (const [px, pz] of paths) {
      const len = Math.hypot(px, pz);
      const ux = px / len;
      const uz = pz / len;
      const rx = -uz;
      const rz = ux;
      const segs = Math.max(4, Math.round(len / 2));
      const across = [-1.9, -1.1, 1.1, 1.9];
      const alpha = [0, 1, 1, 0];
      const pos: number[] = [];
      const nrm: number[] = [];
      const uv: number[] = [];
      const col: number[] = [];
      for (let s = 0; s <= segs; s++) {
        const t = (s / segs) * len;
        const wob = (fbm(t / 6 + px, pz) - 0.5) * 0.6;
        for (let a = 0; a < 4; a++) {
          const x = ux * t + rx * (across[a]! + wob);
          const z = uz * t + rz * (across[a]! + wob);
          pos.push(x, h(x, z) + 0.035, z);
          nrm.push(0, 1, 0);
          uv.push(x, z);
          const fade = alpha[a]! * smooth(0, 3, t) * (0.75 + fbm(x / 3, z / 3) * 0.5);
          col.push(255, 255, 255, Math.round(Math.min(1, fade) * 255));
        }
      }
      const idx: number[] = [];
      for (let s = 0; s < segs; s++)
        for (let a = 0; a < 3; a++) {
          const i0 = s * 4 + a;
          idx.push(i0, i0 + 4, i0 + 1, i0 + 1, i0 + 4, i0 + 5);
        }
      const mesh = new Mesh(app.graphicsDevice);
      mesh.setPositions(new Float32Array(pos));
      mesh.setNormals(new Float32Array(nrm));
      mesh.setUvs(0, new Float32Array(uv));
      mesh.setColors32(new Uint8Array(col));
      mesh.setIndices(new Uint32Array(idx));
      mesh.update(PRIMITIVE_TRIANGLES);
      meshes.push(mesh);
      ents.push(addMesh(app, 'path', mesh, pathMat));
    }
    return () => {
      for (const e of ents) e.destroy();
      for (const m of meshes) m.destroy();
      water.mat = null;
    };
  }, [app, coastal, paths, water]);

  useAppEvent('update', (dt: number) => {
    const m = water.mat;
    if (!m || !m.normalMap) return;
    water.t += dt;
    m.normalMapOffset = new Vec2(water.t * 0.006, water.t * 0.004);
    m.normalDetailMapOffset = new Vec2(-water.t * 0.011, water.t * 0.007);
    m.update();
  });
  return null;
}

// ------------------------------------------------------------- instancing

export interface PropInstance {
  url: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Escala adicional a lo largo de X local (tramos de muralla recortados). */
  scaleX?: number;
}

/**
 * Dibuja muchas copias de props GLB (árboles, rocas) con instancing por hardware:
 * una llamada por variante y material, usando el LOD indicado.
 */
export function InstancedProps({
  items,
  lod = 'LOD1',
  castShadows = true,
  attachToParent = false,
}: {
  items: PropInstance[];
  lod?: string;
  castShadows?: boolean;
  /** Cuelga los lotes de la entidad React actual (para que su `onClick` reciba la selección). */
  attachToParent?: boolean;
}) {
  const app = useApp();
  const parent = useParent();
  useEffect(() => {
    const rt = AssetRuntime.for(app);
    const byUrl = new Map<string, PropInstance[]>();
    for (const it of items) byUrl.set(it.url, [...(byUrl.get(it.url) ?? []), it]);
    let alive = true;
    const ents: Entity[] = [];
    const buffers: VertexBuffer[] = [];
    for (const [url, list] of byUrl) {
      void rt.container(url).then((res) => {
        if (!alive) return;
        const tmpl = res.instantiateRenderEntity();
        const node = (tmpl.findByName(lod) ?? tmpl.findByName('LOD0')) as Entity | null;
        const render = node?.render as RenderComponent | undefined;
        if (!node || !render) {
          tmpl.destroy();
          return;
        }
        // La cuantización deja la escala/desplazamiento en el nodo: se compone en cada matriz.
        const local = node.getWorldTransform().clone();
        const m = new Mat4();
        const q = new Quat();
        const data = new Float32Array(list.length * 16);
        list.forEach((it, i) => {
          q.setFromEulerAngles(0, it.rotY, 0);
          m.setTRS(
            new Vec3(it.x, it.y, it.z),
            q,
            new Vec3(it.scale * (it.scaleX ?? 1), it.scale, it.scale),
          ).mul(local);
          data.set(m.data, i * 16);
        });
        const meshInstances = render.meshInstances
          .filter((src) => src.mesh)
          .map((src) => {
            const vb = new VertexBuffer(
              app.graphicsDevice,
              VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
              list.length,
              {
                usage: BUFFER_STATIC,
                data,
              },
            );
            buffers.push(vb);
            const mi = new MeshInstance(
              src.mesh!,
              rt.material(src.material?.name ?? 'common.foliage'),
            );
            mi.setInstancing(vb);
            mi.cull = false;
            return mi;
          });
        const e = new Entity(`props:${url}`);
        e.addComponent('render', { meshInstances, castShadows, receiveShadows: true });
        (attachToParent ? parent : app.root).addChild(e);
        ents.push(e);
        tmpl.destroy();
      });
    }
    return () => {
      alive = false;
      for (const e of ents) e.destroy();
      for (const b of buffers) b.destroy();
      for (const url of byUrl.keys()) rt.release(url);
    };
  }, [app, parent, items, lod, castShadows, attachToParent]);
  return null;
}

/** Siembra determinista de vegetación y rocas alrededor de la ciudad. */
export function cityScenery(coastal: boolean, wallRadius: number): PropInstance[] {
  const out: PropInstance[] = [];
  let s = 1337;
  const r = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return (s & 0xffffff) / 0x1000000;
  };
  const models = {
    oak: ['tree_oak.v0', 'tree_oak.v1', 'tree_oak.v2'],
    pine: ['tree_pine.v0', 'tree_pine.v1'],
    birch: ['tree_birch.v0', 'tree_birch.v1'],
    bush: ['bush.v0', 'bush.v1'],
    rock: ['rock.v0', 'rock.v1', 'rock.v2'],
  };
  const url = (id: string) => `/assets/models/${id}.glb`;
  const place = (x: number, z: number, id: string, scale: number) =>
    out.push({ url: url(id), x, y: terrainHeight(x, z, coastal), z, rotY: r() * 360, scale });
  const ok = (x: number, z: number) =>
    !(coastal && z < SHORE_Z + 5) && !(Math.abs(x) < 7 && z > wallRadius - 4);
  // bosquetes: centros con árboles agrupados (más naturales que una dispersión uniforme)
  for (let g = 0; g < 26; g++) {
    const a = r() * Math.PI * 2;
    const d = wallRadius + 14 + r() * 150;
    const gx = Math.sin(a) * d;
    const gz = Math.cos(a) * d;
    const pineGrove = d > 120 || r() < 0.3;
    const count = 4 + Math.floor(r() * 7);
    for (let i = 0; i < count; i++) {
      const x = gx + (r() - 0.5) * 22;
      const z = gz + (r() - 0.5) * 22;
      if (!ok(x, z) || Math.hypot(x, z) < wallRadius + 8) continue;
      const kind = pineGrove ? (r() < 0.8 ? 'pine' : 'birch') : r() < 0.65 ? 'oak' : 'birch';
      const list = models[kind];
      place(x, z, list[Math.floor(r() * list.length)]!, 0.8 + r() * 0.5);
    }
  }
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = wallRadius + 4 + r() * 60;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (!ok(x, z)) continue;
    place(
      x,
      z,
      r() < 0.7 ? models.bush[Math.floor(r() * 2)]! : models.rock[Math.floor(r() * 3)]!,
      0.7 + r() * 0.8,
    );
  }
  return out;
}

/**
 * Muralla en anillo con piezas modulares GLB (tramo, torre, puerta), instanciadas.
 * Sin muralla construida (nivel 0) se dibuja una empalizada. En aldeas costeras no
 * se cierra por el lado del mar.
 */
export function wallRing(
  level: number,
  stage: 1 | 2 | 3,
  civ: 'corona' | 'liga',
  coastal: boolean,
  radius: number,
): PropInstance[] {
  const out: PropInstance[] = [];
  const url = (id: string) => `/assets/models/${id}.glb`;
  const segs = 20;
  const SEG_LEN = 14.6;
  const piece = level > 0 ? `wall_segment.${civ}.s${stage}` : `palisade.${civ}.s1`;
  const gateHalf = level > 0 ? Math.asin(6.9 / radius) : Math.asin(3 / radius);
  const at = (a: number): [number, number] => [Math.sin(a) * radius, Math.cos(a) * radius];
  const skip = (z: number) => coastal && z < -30;
  for (let i = 0; i < segs; i++) {
    const a0 = i === 0 ? gateHalf : (i / segs) * Math.PI * 2;
    const a1 = i === segs - 1 ? Math.PI * 2 - gateHalf : ((i + 1) / segs) * Math.PI * 2;
    const [x0, z0] = at(a0);
    const [x1, z1] = at(a1);
    const mid = (a0 + a1) / 2;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    if (skip(z)) continue;
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.5;
    out.push({
      url: url(piece),
      x,
      y: 0,
      z,
      rotY: (mid * 180) / Math.PI,
      scale: 1,
      scaleX: len / SEG_LEN,
    });
    if (level > 0 && i > 0 && !skip(z0))
      out.push({ url: url(`wall_tower.${civ}.s${stage}`), x: x0, y: 0, z: z0, rotY: 0, scale: 1 });
  }
  if (level > 0)
    out.push({ url: url(`wall_gate.${civ}.s${stage}`), x: 0, y: 0, z: radius, rotY: 0, scale: 1 });
  return out;
}
