import {
  Asset,
  BLEND_NONE,
  BLEND_NORMAL,
  CULLFACE_NONE,
  Color,
  StandardMaterial,
  Vec2,
  Vec3,
  type AppBase,
  type ContainerResource,
  type Entity,
  type RenderComponent,
  type Texture,
} from 'playcanvas';

/**
 * Carga de recursos 3D publicada por el pipeline (docs/visual-redesign/ASSET_PIPELINE.md):
 * - manifiesto central (`/assets/manifest.json`),
 * - biblioteca de materiales compartidos (`/assets/materials/library.json`): cada GLB
 *   referencia materiales por nombre y aquí se sustituyen por la instancia compartida,
 *   de modo que cada textura se descarga y sube a la GPU una sola vez,
 * - caché de GLB con conteo de referencias y liberación explícita.
 * Un runtime por aplicación PlayCanvas; se destruye con ella.
 */

export interface ManifestAsset {
  assetId: string;
  kind: string;
  type?: string;
  status: 'BLOCKOUT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  file: string | null;
  civilization?: 'imperial_crown' | 'sea_league';
  visualStage?: number;
  facing?: 'plaza' | 'outward';
  triangles?: number[];
}

interface Manifest {
  styleVersion: string;
  assets: ManifestAsset[];
}

interface LibraryEntry {
  base: string;
  normal: string;
  orm: string;
  tileMeters: number;
}

const BASE = '/assets/';
let manifestPromise: Promise<Manifest> | null = null;
let libraryPromise: Promise<Record<string, LibraryEntry>> | null = null;

export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${BASE}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json() as Promise<Manifest>;
  });
  return manifestPromise;
}

function loadLibrary(): Promise<Record<string, LibraryEntry>> {
  libraryPromise ??= fetch(`${BASE}materials/library.json`)
    .then((r) => (r.ok ? r.json() : { materials: {} }))
    .then((j: { materials: Record<string, LibraryEntry> }) => j.materials);
  return libraryPromise;
}

/** Busca la variante publicada de un tipo para una civilización y etapa visual. */
export function findVariant(
  m: Manifest,
  type: string,
  civilization: string,
  stage: number,
): ManifestAsset | null {
  const usable = (a: ManifestAsset) =>
    a.type === type && a.file && (a.status === 'APPROVED' || a.status === 'PENDING_REVIEW');
  return (
    m.assets.find((a) => usable(a) && a.civilization === civilization && a.visualStage === stage) ??
    m.assets.find((a) => usable(a) && a.visualStage === stage) ??
    null
  );
}

/** Color medio aproximado por material mientras cargan las texturas (evita parpadeo blanco). */
const PLACEHOLDER: Record<string, string> = {
  stone: '#b9b09c',
  plaster: '#d6caa8',
  wood: '#5a4330',
  roof: '#8d4b36',
  cloth: '#7a2a2a',
  iron: '#4d5055',
  thatch: '#a58e58',
  dirt: '#7d6a50',
  crop: '#8a8a4c',
  grass: '#66783c',
  rock: '#8a857a',
  sand: '#c9b88d',
};

function placeholderColor(name: string): Color {
  const key = Object.keys(PLACEHOLDER).find((k) => name.includes(k));
  return new Color().fromString(key ? PLACEHOLDER[key]! : '#9a958c');
}

interface CacheEntry {
  asset: Asset;
  refs: number;
  promise: Promise<ContainerResource>;
  releaseTimer?: ReturnType<typeof setTimeout>;
}

export class AssetRuntime {
  private static readonly byApp = new WeakMap<AppBase, AssetRuntime>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly textureAssets: Asset[] = [];
  private readonly containers = new Map<string, CacheEntry>();
  private readonly lodRoots = new Map<Entity, Array<Entity | null>>();
  private destroyed = false;
  private readonly tmp = new Vec3();
  /** Distancias de cambio de LOD en metros (Art Bible §13); el perfil gráfico puede ajustarlas. */
  lodDistances: [number, number] = [70, 135];

  static for(app: AppBase): AssetRuntime {
    let rt = AssetRuntime.byApp.get(app);
    if (!rt) {
      rt = new AssetRuntime(app);
      AssetRuntime.byApp.set(app, rt);
    }
    return rt;
  }

  private constructor(private readonly app: AppBase) {
    app.on('update', this.updateLods, this);
    app.once('destroy', () => this.destroy());
  }

  /** Textura cacheada por URL; color en sRGB, datos (normal/ORM) en lineal. */
  texture(url: string, srgb: boolean): Promise<Texture> {
    const key = `${url}|${srgb ? 's' : 'l'}`;
    let p = this.textures.get(key);
    if (!p) {
      p = new Promise<Texture>((resolve, reject) => {
        const asset = new Asset(url, 'texture', { url }, { srgb, mipmaps: true });
        this.textureAssets.push(asset);
        asset.once('load', () => {
          const tex = asset.resource as Texture;
          tex.anisotropy = 8;
          resolve(tex);
        });
        asset.once('error', (e: unknown) => reject(new Error(String(e))));
        this.app.assets.add(asset);
        this.app.assets.load(asset);
      });
      this.textures.set(key, p);
    }
    return p;
  }

  /**
   * Material compartido de la biblioteca (síncrono: las texturas se asignan al llegar).
   * `blend`: transparencia por alfa de vértice (bordes difusos de caminos y playa).
   * `water`: dos capas de normales para animar el oleaje.
   */
  material(name: string, opts: { blend?: boolean; water?: boolean } = {}): StandardMaterial {
    const key = `${name}${opts.blend ? '|blend' : ''}${opts.water ? '|water' : ''}`;
    let m = this.materials.get(key);
    if (m) return m;
    m = new StandardMaterial();
    m.name = name;
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.25;
    m.diffuse = placeholderColor(name);
    m.diffuseVertexColor = true;
    m.diffuseVertexColorChannel = 'rgb';
    m.blendType = BLEND_NONE;
    if (/sail|cloth|foliage/.test(name)) {
      // tela y follaje: visibles por ambas caras
      m.cull = CULLFACE_NONE;
      m.twoSidedLighting = true;
    }
    if (opts.blend) {
      m.blendType = BLEND_NORMAL;
      m.opacityVertexColor = true;
      m.opacityVertexColorChannel = 'a';
      m.depthWrite = false;
    }
    m.update();
    this.materials.set(key, m);
    const mat = m;
    void loadLibrary().then(async (lib) => {
      const e = lib[name];
      if (!e || this.destroyed) return;
      const [base, normal, orm] = await Promise.all([
        this.texture(`${BASE}materials/${e.base}`, true),
        this.texture(`${BASE}materials/${e.normal}`, false),
        this.texture(`${BASE}materials/${e.orm}`, false),
      ]);
      if (this.destroyed) return;
      const t = new Vec2(1 / e.tileMeters, 1 / e.tileMeters);
      mat.diffuse = new Color(1, 1, 1);
      mat.diffuseMap = base;
      mat.diffuseMapTiling = t;
      mat.normalMap = normal;
      mat.normalMapTiling = t;
      mat.bumpiness = 1;
      mat.aoMap = orm;
      mat.aoMapChannel = 'r';
      mat.aoMapTiling = t;
      mat.glossMap = orm;
      mat.glossMapChannel = 'g';
      mat.glossInvert = true;
      mat.glossMapTiling = t;
      mat.gloss = 1;
      mat.metalnessMap = orm;
      mat.metalnessMapChannel = 'b';
      mat.metalnessMapTiling = t;
      mat.metalness = 1;
      if (opts.water) {
        mat.normalDetailMap = normal;
        mat.normalDetailMapTiling = new Vec2(t.x * 2.7, t.y * 2.7);
        mat.normalDetailMapBumpiness = 0.6;
        mat.diffuseVertexColor = false;
      }
      mat.update();
    });
    return m;
  }

  /** Contenedor GLB con conteo de referencias. Llamar `release(url)` al dejar de usarlo. */
  container(url: string): Promise<ContainerResource> {
    let e = this.containers.get(url);
    if (e) {
      if (e.releaseTimer) clearTimeout(e.releaseTimer);
      e.releaseTimer = undefined;
      e.refs++;
      return e.promise;
    }
    const asset = new Asset(url, 'container', { url });
    const promise = new Promise<ContainerResource>((resolve, reject) => {
      asset.once('load', () => resolve(asset.resource as ContainerResource));
      asset.once('error', (err: unknown) => reject(new Error(String(err))));
    });
    this.app.assets.add(asset);
    this.app.assets.load(asset);
    e = { asset, refs: 1, promise };
    this.containers.set(url, e);
    return promise;
  }

  release(url: string): void {
    const e = this.containers.get(url);
    if (!e) return;
    e.refs--;
    if (e.refs > 0) return;
    // Gracia breve: cambiar de etapa o remontar no vuelve a descargar.
    e.releaseTimer = setTimeout(() => {
      if (e.refs > 0 || this.destroyed) return;
      this.containers.delete(url);
      this.app.assets.remove(e.asset);
      e.asset.unload();
    }, 5000);
  }

  /** Sustituye los materiales del GLB por los compartidos (por nombre) y registra los LOD. */
  prepare(root: Entity): void {
    for (const r of root.findComponents('render') as RenderComponent[]) {
      for (const mi of r.meshInstances)
        if (mi.material) mi.material = this.material(mi.material.name);
    }
    const lods = [0, 1, 2].map((i) => root.findByName(`LOD${i}`) as Entity | null);
    if (lods[0]) this.lodRoots.set(root, lods);
  }

  forget(root: Entity): void {
    this.lodRoots.delete(root);
  }

  /** Estadística de caché para la telemetría/depuración. */
  stats() {
    return {
      containers: this.containers.size,
      materials: this.materials.size,
      textures: this.textures.size,
    };
  }

  private updateLods(): void {
    if (this.lodRoots.size === 0) return;
    const cam = this.app.systems.camera?.cameras[0]?.entity;
    if (!cam) return;
    const cp = cam.getPosition();
    const [d1, d2] = this.lodDistances;
    for (const [root, lods] of this.lodRoots) {
      const d = this.tmp.copy(root.getPosition()).sub(cp).length();
      const want = d < d1 ? 0 : d < d2 ? 1 : 2;
      for (let i = 0; i < 3; i++) {
        const n = lods[i];
        if (n && n.enabled !== (i === want)) n.enabled = i === want;
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.off('update', this.updateLods, this);
    for (const e of this.containers.values()) {
      if (e.releaseTimer) clearTimeout(e.releaseTimer);
      e.asset.unload();
    }
    this.containers.clear();
    for (const m of this.materials.values()) m.destroy();
    this.materials.clear();
    for (const a of this.textureAssets) a.unload();
    this.textures.clear();
    this.lodRoots.clear();
  }
}
