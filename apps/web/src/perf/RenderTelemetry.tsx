import { useEffect } from 'react';
import { useApp } from '@playcanvas/react/hooks';
import type { AppBase, MeshInstance } from 'playcanvas';

/**
 * Telemetría de render instrumentada (no el contador FPS del HUD): tiempos de
 * frame reales entre `frameend`, coste de CPU del frame (update + render),
 * llamadas de dibujo del dispositivo, triángulos de la escena y VRAM rastreada
 * por el motor. Se publica en `window.__reinosPerf` para benchmarks y pruebas;
 * no se muestra al jugador salvo en la capa de depuración.
 */

const CAPACITY = 1200;

class Ring {
  private readonly buf = new Float64Array(CAPACITY);
  private n = 0;
  private i = 0;
  push(v: number) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % CAPACITY;
    this.n = Math.min(this.n + 1, CAPACITY);
  }
  clear() {
    this.n = 0;
    this.i = 0;
  }
  values(): number[] {
    return Array.from(this.buf.subarray(0, this.n));
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface PerfSnapshot {
  scene: string;
  frames: number;
  windowMs: number;
  fps: number;
  frameMs: { avg: number; p50: number; p95: number; p99: number; max: number };
  cpuMs: { avg: number; p95: number };
  drawCalls: { avg: number; max: number };
  sceneTriangles: number;
  meshInstances: number;
  vramMB: { textures: number; geometry: number; total: number } | null;
  /** ms desde el montaje de la escena hasta el primer frame dibujado. */
  firstFrameMs: number | null;
  device: string;
}

class Telemetry {
  readonly frame = new Ring();
  readonly cpu = new Ring();
  readonly draws = new Ring();
  private lastEnd = 0;
  private frameStart = 0;
  private readonly mountedAt = performance.now();
  private firstFrameAt: number | null = null;
  private windowStart = performance.now();

  constructor(
    private readonly app: AppBase,
    readonly scene: string,
  ) {
    app.on('frameupdate', this.onFrameUpdate, this);
    app.on('frameend', this.onFrameEnd, this);
  }

  private onFrameUpdate() {
    this.frameStart = performance.now();
    // updateBasic() ya volcó las llamadas de dibujo del frame anterior.
    if (this.lastEnd > 0) this.draws.push(this.app.stats.drawCalls.total);
  }

  private onFrameEnd() {
    const now = performance.now();
    this.cpu.push(now - this.frameStart);
    if (this.lastEnd > 0) this.frame.push(now - this.lastEnd);
    else this.firstFrameAt = now;
    this.lastEnd = now;
  }

  reset() {
    this.frame.clear();
    this.cpu.clear();
    this.draws.clear();
    this.windowStart = performance.now();
  }

  private sceneGeometry(): { triangles: number; meshInstances: number } {
    let triangles = 0;
    let meshInstances = 0;
    const seen = new Set<MeshInstance>();
    for (const layer of this.app.scene.layers.layerList) {
      for (const mi of layer.meshInstances) {
        if (seen.has(mi) || !mi.visible) continue;
        seen.add(mi);
        meshInstances++;
        const prim = mi.mesh?.primitive?.[0];
        const count = prim?.count ?? 0;
        const inst = mi.instancingCount > 0 ? mi.instancingCount : mi.instancingData ? 0 : 1;
        triangles += Math.floor(count / 3) * inst;
      }
    }
    return { triangles, meshInstances };
  }

  snapshot(): PerfSnapshot {
    const f = this.frame.values().sort((a, b) => a - b);
    const c = this.cpu.values().sort((a, b) => a - b);
    const d = this.draws.values();
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const avgF = f.length ? sum(f) / f.length : 0;
    const vram = (this.app.stats as unknown as { vram?: { tex: number; vb: number; ib: number } })
      .vram;
    const geo = this.sceneGeometry();
    const dev = this.app.graphicsDevice as unknown as { deviceType?: string; isWebGPU?: boolean };
    return {
      scene: this.scene,
      frames: f.length,
      windowMs: Math.round(performance.now() - this.windowStart),
      fps: avgF > 0 ? r1(1000 / avgF) : 0,
      frameMs: {
        avg: r1(avgF),
        p50: r1(pct(f, 50)),
        p95: r1(pct(f, 95)),
        p99: r1(pct(f, 99)),
        max: r1(f.at(-1) ?? 0),
      },
      cpuMs: { avg: r1(c.length ? sum(c) / c.length : 0), p95: r1(pct(c, 95)) },
      drawCalls: {
        avg: Math.round(d.length ? sum(d) / d.length : 0),
        max: d.length ? Math.max(...d) : 0,
      },
      sceneTriangles: geo.triangles,
      meshInstances: geo.meshInstances,
      vramMB: vram
        ? {
            textures: r1(vram.tex / 1048576),
            geometry: r1((vram.vb + vram.ib) / 1048576),
            total: r1((vram.tex + vram.vb + vram.ib) / 1048576),
          }
        : null,
      firstFrameMs:
        this.firstFrameAt === null ? null : Math.round(this.firstFrameAt - this.mountedAt),
      device: dev.deviceType ?? (dev.isWebGPU ? 'webgpu' : 'webgl2'),
    };
  }

  destroy() {
    this.app.off('frameupdate', this.onFrameUpdate, this);
    this.app.off('frameend', this.onFrameEnd, this);
  }
}

interface PerfApi {
  scenes: () => string[];
  reset: (scene?: string) => void;
  snapshot: (scene?: string) => PerfSnapshot | null;
}

declare global {
  interface Window {
    __reinosPerf?: PerfApi;
  }
}

const active = new Map<string, Telemetry>();

function api(): PerfApi {
  const pick = (scene?: string) => (scene ? active.get(scene) : [...active.values()].at(-1));
  return {
    scenes: () => [...active.keys()],
    reset: (scene) => pick(scene)?.reset(),
    snapshot: (scene) => pick(scene)?.snapshot() ?? null,
  };
}

/** Se monta dentro de `<Application>`; una instancia por escena. */
export function RenderTelemetry({ scene }: { scene: string }) {
  const app = useApp();
  useEffect(() => {
    const t = new Telemetry(app, scene);
    active.set(scene, t);
    window.__reinosPerf ??= api();
    return () => {
      t.destroy();
      if (active.get(scene) === t) active.delete(scene);
    };
  }, [app, scene]);
  return null;
}
