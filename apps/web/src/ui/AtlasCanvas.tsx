import { useEffect, useRef, useState } from 'react';
import type { MapAtlasView, MapVillageView } from '@reinos/contracts';
import {
  createPrng,
  fieldDistribution,
  oasisBonuses,
  toCartesian,
  toMapIndex,
  coordinateBounds,
} from '@reinos/game-rules';
import type { MapSelection } from './WorldMap.js';
const centers = new Map<string, { x: number; y: number }>();
const COLORS = ['#a4b976', '#477445', '#8e957b', '#bccc7d', '#6598a5'];
const tribe = (v: MapVillageView) =>
  v.kind === 'NPC'
    ? 'B'
    : v.kind === 'OASIS'
      ? 'O'
      : v.civilization === 'forest_kin'
        ? 'GA'
        : v.civilization === 'steppe_clans'
          ? 'GE'
          : 'R';
function polygon(c: CanvasRenderingContext2D, points: number[][], fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p[0]!, p[1]!) : c.moveTo(p[0]!, p[1]!)));
  c.closePath();
  c.fill();
}
function tree(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = '#735538';
  c.fillRect(x - s * 0.055, y - s * 0.08, s * 0.11, s * 0.22);
  polygon(
    c,
    [
      [x, y - s * 0.55],
      [x - s * 0.28, y],
      [x + s * 0.28, y],
    ],
    '#315b39',
  );
  polygon(
    c,
    [
      [x, y - s * 0.38],
      [x - s * 0.35, y + s * 0.08],
      [x + s * 0.35, y + s * 0.08],
    ],
    '#457747',
  );
}
function mountain(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  polygon(
    c,
    [
      [x - s * 0.45, y + s * 0.2],
      [x, y - s * 0.5],
      [x + s * 0.42, y + s * 0.2],
    ],
    '#a3a58c',
  );
  polygon(
    c,
    [
      [x, y - s * 0.5],
      [x + s * 0.42, y + s * 0.2],
      [x + s * 0.06, y + s * 0.2],
    ],
    '#7d8773',
  );
  polygon(
    c,
    [
      [x, y - s * 0.5],
      [x - s * 0.12, y - s * 0.3],
      [x, y - s * 0.34],
      [x + s * 0.13, y - s * 0.28],
    ],
    '#eee8cd',
  );
}
function house(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  roof: string,
  wall: string,
) {
  c.fillStyle = wall;
  c.fillRect(x - s * 0.28, y - s * 0.16, s * 0.56, s * 0.43);
  polygon(
    c,
    [
      [x - s * 0.36, y - s * 0.15],
      [x, y - s * 0.45],
      [x + s * 0.36, y - s * 0.15],
    ],
    roof,
  );
  c.fillStyle = '#584334';
  c.fillRect(x - s * 0.06, y + s * 0.04, s * 0.13, s * 0.23);
  c.fillStyle = '#f0dca1';
  c.fillRect(x - s * 0.2, y - s * 0.03, s * 0.09, s * 0.1);
}
function village(
  c: CanvasRenderingContext2D,
  v: MapVillageView,
  x: number,
  y: number,
  s: number,
  time: number,
) {
  c.fillStyle = '#536a3e55';
  c.beginPath();
  c.ellipse(x, y + s * 0.12, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
  c.fill();
  if (v.kind === 'OASIS') {
    c.fillStyle = '#cdba7e';
    c.beginPath();
    c.ellipse(x, y + s * 0.1, s * 0.38, s * 0.23, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6aa6ae';
    c.beginPath();
    c.ellipse(x + s * 0.04, y + s * 0.14, s * 0.19, s * 0.1, -0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#776144';
    c.lineWidth = s * 0.055;
    c.beginPath();
    c.moveTo(x - s * 0.2, y + s * 0.08);
    c.quadraticCurveTo(x - s * 0.3, y - s * 0.17, x - s * 0.2, y - s * 0.4);
    c.stroke();
    for (const sign of [-1, 1])
      polygon(
        c,
        [
          [x - s * 0.2, y - s * 0.4],
          [x + sign * s * 0.22 - s * 0.2, y - s * 0.32],
          [x + sign * s * 0.08 - s * 0.2, y - s * 0.5],
        ],
        '#467b44',
      );
    if (v.oasisBonuses?.wood) tree(c, x + s * 0.26, y + s * 0.04, s * 0.45);
    if (v.oasisBonuses?.iron) mountain(c, x + s * 0.24, y - s * 0.04, s * 0.45);
    if (v.oasisBonuses?.stone) {
      c.fillStyle = '#ae7652';
      c.fillRect(x + s * 0.14, y + s * 0.16, s * 0.17, s * 0.08);
    }
  } else if (v.kind === 'NPC') {
    house(c, x - s * 0.13, y, s * 0.55, '#985e3f', '#c4ad7d');
    polygon(
      c,
      [
        [x + s * 0.12, y - s * 0.2],
        [x + s * 0.4, y + s * 0.2],
        [x - s * 0.04, y + s * 0.2],
      ],
      '#b89669',
    );
    c.strokeStyle = '#574c34';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y - s * 0.55);
    c.lineTo(x, y - s * 0.15);
    c.stroke();
    polygon(
      c,
      [
        [x, y - s * 0.55],
        [x + s * 0.21, y - s * 0.48],
        [x, y - s * 0.4],
      ],
      '#995144',
    );
  } else if (v.civilization === 'forest_kin') {
    c.strokeStyle = '#725b3e';
    c.lineWidth = s * 0.06;
    c.beginPath();
    c.ellipse(x, y + s * 0.07, s * 0.4, s * 0.25, 0, 0, Math.PI * 2);
    c.stroke();
    house(c, x - s * 0.1, y, s * 0.7, '#80964d', '#c1a679');
    house(c, x + s * 0.22, y + s * 0.1, s * 0.4, '#687e43', '#c7af7d');
  } else if (v.civilization === 'steppe_clans') {
    c.strokeStyle = '#ac7851';
    c.lineWidth = s * 0.1;
    c.beginPath();
    c.ellipse(x, y + s * 0.09, s * 0.4, s * 0.22, 0, 0, Math.PI * 2);
    c.stroke();
    house(c, x - s * 0.08, y, s * 0.78, '#674b35', '#b59364');
    house(c, x + s * 0.23, y + s * 0.12, s * 0.4, '#77513a', '#b5996e');
  } else {
    c.strokeStyle = '#bcb9a2';
    c.lineWidth = s * 0.09;
    c.strokeRect(x - s * 0.38, y - s * 0.05, s * 0.76, s * 0.35);
    house(c, x, y - s * 0.04, s * 0.77, '#b16b49', '#e0d6b6');
    for (const sign of [-1, 1]) {
      c.fillStyle = '#cbc6ad';
      c.fillRect(x + sign * s * 0.33 - s * 0.06, y - s * 0.06, s * 0.12, s * 0.34);
      c.fillRect(x + sign * s * 0.33 - s * 0.09, y - s * 0.14, s * 0.18, s * 0.1);
    }
  }
  if (v.construction) {
    c.save();
    c.translate(x + s * 0.3, y - s * 0.37);
    c.rotate(Math.sin(time / 160) * 0.2);
    c.font = `${Math.max(12, s * 0.32)}px sans-serif`;
    c.fillStyle = '#ffe09a';
    c.textAlign = 'center';
    c.fillText('⚒', 0, 0);
    c.restore();
    c.strokeStyle = `rgba(255,216,115,${0.5 + Math.sin(time / 250) * 0.3})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, s * 0.46, 0, Math.PI * 2);
    c.stroke();
  }
}

export function AtlasCanvas({
  atlas,
  terrain,
  focus,
  initial,
  onSelect,
  onLocate,
}: {
  atlas: MapAtlasView;
  terrain: Uint8Array;
  focus?: { x: number; y: number };
  initial: { x: number; y: number };
  onSelect: (selection: MapSelection) => void;
  onLocate?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    engine = useRef<MapEngine | null>(null),
    [radius, setRadius] = useState(7),
    [position, setPosition] = useState(initial),
    [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    const start = focus ?? centers.get(atlas.worldId) ?? initial;
    const map = new MapEngine(
      ref.current,
      atlas,
      terrain,
      start,
      radius,
      (p) => {
        centers.set(atlas.worldId, p);
        setPosition(p);
      },
      setHover,
      (s) => selectRef.current(s),
      setRadius,
    );
    engine.current = map;
    return () => {
      map.destroy();
      engine.current = null;
    };
  }, [atlas.worldId, terrain]);
  useEffect(() => {
    engine.current?.setAtlas(atlas);
  }, [atlas]);
  useEffect(() => {
    if (focus) engine.current?.locate(focus);
  }, [focus]);
  useEffect(() => {
    engine.current?.zoom(radius);
  }, [radius]);
  return (
    <div className="atlas-map">
      <canvas
        ref={ref}
        className="cartesian-world"
        tabIndex={0}
        aria-label="Mapa completo. Arrastra para recorrer; flechas para mover; Enter para seleccionar."
      />
      <div className="map-coordinate-hud">
        <strong>
          Centro {Math.round(position.x)} | {Math.round(position.y)}
        </strong>
        <output aria-label="Coordenadas del puntero">
          {hover ? `${hover.x} | ${hover.y}` : 'Arrastra para explorar'}
        </output>
      </div>
      <div className="map-zoom-controls">
        <button
          aria-label="Acercar mapa"
          disabled={radius <= 3}
          onClick={() => setRadius((n) => n - 1)}
        >
          +
        </button>
        <button
          aria-label="Alejar mapa"
          disabled={radius >= 20}
          onClick={() => setRadius((n) => n + 1)}
        >
          −
        </button>
        <button
          aria-label="Centrar en mi aldea"
          onClick={() => {
            engine.current?.locate(initial);
            onLocate?.();
          }}
        >
          ⌖
        </button>
      </div>
    </div>
  );
}

class MapEngine {
  private c: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private radius: number;
  private cx: number;
  private cy: number;
  private tile = 50;
  private frame = 0;
  private observer: ResizeObserver;
  private lastFrame = 0;
  private vx = 0;
  private vy = 0;
  private serverOffset = 0;
  private clockStamp: string | null = null;
  private dragging: {
    x: number;
    y: number;
    startX: number;
    startY: number;
    time: number;
    moved: boolean;
  } | null = null;
  private selected: { x: number; y: number } | null = null;
  private known = new Map<string, MapVillageView>();
  private generated = new Map<number, MapVillageView | null>();
  private cleanup: Array<() => void> = [];
  private dead = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private atlas: MapAtlasView,
    private terrain: Uint8Array,
    position: { x: number; y: number },
    radius: number,
    private changed: (p: { x: number; y: number }) => void,
    private hovered: (p: { x: number; y: number } | null) => void,
    private select: (s: MapSelection) => void,
    private setRadius: (fn: (n: number) => number) => void,
  ) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('No se pudo iniciar el mapa 2D');
    this.c = c;
    this.radius = radius;
    const point = toMapIndex(atlas.mapSize, position);
    this.cx = point.x;
    this.cy = point.y;
    this.setAtlas(atlas);
    this.observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      this.w = rect.width;
      this.h = rect.height;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(this.w * this.dpr);
      canvas.height = Math.round(this.h * this.dpr);
      this.resize();
    });
    this.observer.observe(canvas);
    const listen = <K extends keyof HTMLElementEventMap>(
      name: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(name, fn as EventListener, options);
      this.cleanup.push(() => canvas.removeEventListener(name, fn as EventListener));
    };
    listen('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.focus({ preventScroll: true });
      this.vx = this.vy = 0;
      this.dragging = {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        time: performance.now(),
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    listen('pointermove', (e) => {
      const d = this.dragging;
      if (d) {
        const now = performance.now(),
          dx = e.clientX - d.x,
          dy = e.clientY - d.y,
          dt = Math.max(8, now - d.time);
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) d.moved = true;
        this.cx -= dx / this.tile;
        this.cy -= dy / this.tile;
        this.vx = -dx / this.tile / dt;
        this.vy = -dy / this.tile / dt;
        d.x = e.clientX;
        d.y = e.clientY;
        d.time = now;
        this.clamp();
        this.report();
        this.request();
      } else {
        const p = this.pointer(e.clientX, e.clientY);
        this.hovered(p ? toCartesian(this.atlas.mapSize, p) : null);
      }
    });
    listen('pointerup', (e) => {
      const d = this.dragging;
      this.dragging = null;
      canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (d && !d.moved) {
        this.vx = this.vy = 0;
        const p = this.pointer(e.clientX, e.clientY);
        if (p) this.choose(p.x, p.y);
      }
      this.lastFrame = performance.now();
      this.request();
    });
    listen('pointercancel', () => {
      this.dragging = null;
      this.vx = this.vy = 0;
      canvas.style.cursor = 'grab';
    });
    listen('pointerleave', () => {
      if (!this.dragging) this.hovered(null);
    });
    listen(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setRadius((n) => Math.max(3, Math.min(20, n + (e.deltaY > 0 ? 1 : -1))));
      },
      { passive: false },
    );
    listen('keydown', (e) => {
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (step[e.key]) {
        e.preventDefault();
        this.cx += step[e.key]![0];
        this.cy += step[e.key]![1];
        this.clamp();
        this.report();
        this.request();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.choose(Math.round(this.cx), Math.round(this.cy));
      } else if (e.key === '+' || e.key === '-')
        this.setRadius((n) => Math.max(3, Math.min(20, n + (e.key === '+' ? -1 : 1))));
    });
  }
  setAtlas(atlas: MapAtlasView) {
    this.atlas = atlas;
    if (this.clockStamp !== atlas.serverTime) {
      this.clockStamp = atlas.serverTime;
      this.serverOffset = Date.parse(atlas.serverTime) - Date.now();
    }
    this.known = new Map(atlas.villages.map((v) => [`${v.x}:${v.y}`, v]));
    this.request();
  }
  locate(p: { x: number; y: number }) {
    const i = toMapIndex(this.atlas.mapSize, p);
    this.cx = i.x;
    this.cy = i.y;
    this.vx = this.vy = 0;
    this.clamp();
    this.report();
    this.request();
  }
  zoom(radius: number) {
    this.radius = radius;
    this.resize();
  }
  private resize() {
    this.tile = Math.min(this.w, this.h) / (2 * this.radius + 1);
    this.canvas.dataset.mapWidth = String(Math.ceil(this.w / this.tile));
    this.canvas.dataset.mapHeight = String(Math.ceil(this.h / this.tile));
    this.canvas.dataset.cellPixels = String(this.tile);
    this.clamp();
    this.report();
    this.request();
  }
  private report() {
    this.changed(toCartesian(this.atlas.mapSize, { x: this.cx, y: this.cy }));
  }
  private clamp() {
    const size = this.atlas.mapSize,
      hx = Math.min(size / 2, this.w / this.tile / 2),
      hy = Math.min(size / 2, this.h / this.tile / 2);
    const x = Math.max(hx - 0.5, Math.min(size - hx - 0.5, this.cx)),
      y = Math.max(hy - 0.5, Math.min(size - hy - 0.5, this.cy));
    if (x !== this.cx) this.vx = 0;
    if (y !== this.cy) this.vy = 0;
    this.cx = x;
    this.cy = y;
  }
  private pointer(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect(),
      px = Math.floor((x - rect.left - this.w / 2) / this.tile + this.cx + 0.5),
      py = Math.floor((y - rect.top - this.h / 2) / this.tile + this.cy + 0.5);
    return px >= 0 && py >= 0 && px < this.atlas.mapSize && py < this.atlas.mapSize
      ? { x: px, y: py }
      : null;
  }
  private object(x: number, y: number): MapVillageView | null {
    const point = toCartesian(this.atlas.mapSize, { x, y }),
      known = this.known.get(`${point.x}:${point.y}`);
    if (known) return known;
    const index = y * this.atlas.mapSize + x;
    if (this.generated.has(index)) return this.generated.get(index)!;
    const terrain = this.terrain[index],
      oasis = terrain === 3,
      npc =
        terrain === 0 && createPrng(`${this.atlas.mapSeed}:${x}:${y}:npc-cell-1`).nextInt(100) < 2;
    const value =
      oasis || npc
        ? {
            id: `virtual:${x}:${y}`,
            name: oasis ? 'Oasis salvaje' : 'Aldea libre',
            ...point,
            ownerName: null,
            civilization: null,
            isMine: false,
            isAlly: false,
            kind: oasis ? ('OASIS' as const) : ('NPC' as const),
            loyalty: 100,
            ...(oasis ? { oasisBonuses: oasisBonuses(this.atlas.mapSeed, x, y) } : {}),
          }
        : null;
    if (this.generated.size > 15000) this.generated.clear();
    this.generated.set(index, value);
    if (this.generated.size > 8192) this.generated.delete(this.generated.keys().next().value!);
    return value;
  }
  private choose(x: number, y: number) {
    const point = toCartesian(this.atlas.mapSize, { x, y });
    this.selected = { x, y };
    this.select({
      ...point,
      terrain: ['P', 'F', 'M', 'O', 'S'][this.terrain[y * this.atlas.mapSize + x] ?? 4]!,
      village: this.object(x, y),
      fields: fieldDistribution(this.atlas.mapSeed, x, y),
    });
    this.request();
  }
  private request() {
    if (!this.frame && !this.dead)
      this.frame = requestAnimationFrame((time) => {
        this.frame = 0;
        this.draw(time);
      });
  }
  private draw(time: number) {
    if (this.dead || this.w <= 1 || this.h <= 1) return;
    const dt = Math.min(40, Math.max(0, time - this.lastFrame));
    this.lastFrame = time;
    if (!this.dragging && Math.abs(this.vx) + Math.abs(this.vy) > 0.00005) {
      this.cx += this.vx * dt;
      this.cy += this.vy * dt;
      const decay = Math.exp(-dt / 160);
      this.vx *= decay;
      this.vy *= decay;
      this.clamp();
      this.report();
    }
    const c = this.c,
      s = this.tile,
      size = this.atlas.mapSize,
      left = this.cx - this.w / s / 2 - 0.5,
      top = this.cy - this.h / s / 2 - 0.5;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#263c2b';
    c.fillRect(0, 0, this.w, this.h);
    const x0 = Math.max(0, Math.floor(left)),
      y0 = Math.max(0, Math.floor(top)),
      x1 = Math.min(size - 1, Math.ceil(left + this.w / s)),
      y1 = Math.min(size - 1, Math.ceil(top + this.h / s));
    let animated = false;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = (x - this.cx - 0.5) * s + this.w / 2,
          py = (y - this.cy - 0.5) * s + this.h / 2,
          t = this.terrain[y * size + x] ?? 4,
          v = this.object(x, y);
        c.fillStyle = COLORS[t]!;
        if (t === 0)
          c.fillStyle = ['#9fb371', '#a9ba7d', '#a1b776', '#98af6c'][(x * 7 + y * 3) % 4]!;
        c.fillRect(px, py, s + 0.5, s + 0.5);
        c.strokeStyle = '#708a5177';
        c.lineWidth = 0.6;
        c.strokeRect(px, py, s, s);
        if (v) {
          const outline = v.isMine ? '#72b8ea' : v.isAlly ? '#67d9ce' : v.ownerColor;
          if (outline) {
            c.strokeStyle = outline;
            c.lineWidth = Math.max(2, s * 0.045);
            c.strokeRect(px + 2, py + 2, s - 4, s - 4);
          }
          village(c, v, px + s / 2, py + s * 0.53, s * 0.86, time);
          animated ||= !!v.construction;
          if (s > 24) {
            c.font = `600 ${Math.max(8, Math.min(12, s * 0.18))}px sans-serif`;
            c.textAlign = 'center';
            c.fillStyle = '#203a2cdd';
            c.fillRect(px + s * 0.3, py + 2, s * 0.4, Math.max(11, s * 0.23));
            c.fillStyle = '#f9e8b7';
            c.fillText(tribe(v), px + s / 2, py + Math.max(10, s * 0.19));
            if (v.isMine && s > 40) {
              c.font = '9px sans-serif';
              c.fillStyle = '#f6edcd';
              c.fillText(v.name.slice(0, 14), px + s / 2, py + s - 3);
            }
          }
        } else if (t === 1) {
          tree(c, px + s * 0.3, py + s * 0.65, s * 0.62);
          tree(c, px + s * 0.65, py + s * 0.65, s * 0.7);
        } else if (t === 2) {
          mountain(c, px + s * 0.45, py + s * 0.65, s * 0.8);
        }
        if (this.selected?.x === x && this.selected.y === y) {
          c.strokeStyle = '#ffe6a5';
          c.lineWidth = 3;
          c.strokeRect(px + 3, py + 3, s - 6, s - 6);
        }
      }
    const drawPoint = (p: { x: number; y: number }) => {
      const i = toMapIndex(size, p);
      return { x: (i.x - this.cx) * s + this.w / 2, y: (i.y - this.cy) * s + this.h / 2 };
    };
    for (const m of this.atlas.movements) {
      const from = drawPoint(m.from),
        to = drawPoint(m.to),
        a = Date.parse(m.departedAt),
        b = Date.parse(m.arrivesAt),
        progress = Math.max(
          0,
          Math.min(
            1,
            ((this.atlas.running === false
              ? Date.parse(this.atlas.serverTime)
              : Date.now() + this.serverOffset) -
              a) /
              Math.max(1, b - a),
          ),
        );
      if (progress >= 1) continue;
      animated = true;
      c.strokeStyle = m.isMine ? '#ffe3a2' : '#d75f4c';
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.lineTo(to.x, to.y);
      c.stroke();
      c.setLineDash([]);
      const x = from.x + (to.x - from.x) * progress,
        y = from.y + (to.y - from.y) * progress;
      c.fillStyle = m.isMine ? '#e8c778' : '#c35844';
      c.beginPath();
      c.arc(x, y, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#233528';
      c.font = '12px sans-serif';
      c.textAlign = 'center';
      c.fillText(m.mission === 'SETTLE' ? '⚑' : '⚔', x, y + 4);
    }
    c.font = '10px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#183124bb';
    c.fillRect(0, 0, this.w, 18);
    c.fillRect(0, 0, 43, this.h);
    c.fillStyle = '#f4e4b5';
    const bounds = coordinateBounds(size);
    for (let x = x0; x <= x1; x++)
      if (s > 35 || x % 2 === 0)
        c.fillText(String(x + bounds.min), (x - this.cx) * s + this.w / 2, 12);
    for (let y = y0; y <= y1; y++)
      if (s > 35 || y % 2 === 0)
        c.fillText(String(bounds.max - y), 21, (y - this.cy) * s + this.h / 2 + 3);
    if (animated || (!this.dragging && Math.abs(this.vx) + Math.abs(this.vy) > 0.00005))
      this.request();
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.cleanup.forEach((fn) => fn());
  }
}
