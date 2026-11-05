"""Composición arquitectónica por civilización (Art Bible §3, §5).

Funciones de alto nivel que combinan piezas de `geo.Builder`: casas con planta
baja de piedra y pisos de entramado, ventanas con contraventanas, puertas,
tejados, chimeneas, torres y almenas. Coordenadas Blender: Z arriba, frente −Y.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from .geo import Builder

GROUND_H = 3.4
FLOOR_H = 3.0


@dataclass(frozen=True)
class Style:
    civ: str
    roof_pitch: float  # grados
    timbered: bool  # pisos altos con entramado visto
    jetty: float  # vuelo de los pisos altos (m)
    plinth: float = 0.45

    @property
    def stone(self) -> str:
        return f'{self.civ}.stone'

    @property
    def plaster(self) -> str:
        return f'{self.civ}.plaster'

    @property
    def wood(self) -> str:
        return f'{self.civ}.wood'

    @property
    def roof(self) -> str:
        return f'{self.civ}.roof'

    @property
    def cloth(self) -> str:
        return f'{self.civ}.cloth'


CORONA = Style('corona', roof_pitch=40.0, timbered=True, jetty=0.28)
LIGA = Style('liga', roof_pitch=52.0, timbered=False, jetty=0.0)
STYLES = {'imperial_crown': CORONA, 'sea_league': LIGA}

IRON = 'common.iron'


def _face_frame(cx: float, cy: float, w: float, d: float, face: str):
    """Devuelve (origen del centro de la cara, vector a lo largo, normal exterior) para una cara de caja."""
    if face == 'front':
        return (cx, cy - d / 2), (1.0, 0.0), (0.0, -1.0), w
    if face == 'back':
        return (cx, cy + d / 2), (-1.0, 0.0), (0.0, 1.0), w
    if face == 'left':
        return (cx - w / 2, cy), (0.0, -1.0), (-1.0, 0.0), d
    return (cx + w / 2, cy), (0.0, 1.0), (1.0, 0.0), d


def _rot_of(normal: tuple[float, float]) -> float:
    """Giro Z (grados) que lleva el frente local (−Y) a `normal`."""
    nx, ny = normal
    return math.degrees(math.atan2(nx, -ny))


def window(b: Builder, st: Style, origin, along, normal, offset: float, z: float, *, w: float = 0.8, h: float = 1.15, shutters: bool = True) -> None:
    """Ventana: hueco oscuro, marco de madera, alféizar de piedra y contraventanas abiertas."""
    ox, oy = origin
    ax, ay = along
    nx, ny = normal
    px, py = ox + ax * offset, oy + ay * offset
    rot = _rot_of(normal)
    # hueco (vidrio emplomado oscuro), ligeramente rehundido
    b.box(IRON, (px + nx * 0.01, py + ny * 0.01, z + h / 2), (w, 0.04, h), bevel=0.0, rot_z=rot, detail=True)
    # marco
    fw = 0.09
    for sx in (-1, 1):
        b.box(st.wood, (px + ax * sx * (w / 2 + fw / 2) + nx * 0.06, py + ay * sx * (w / 2 + fw / 2) + ny * 0.06, z + h / 2), (fw, 0.1, h + 2 * fw), bevel=0.015, rot_z=rot)
    b.box(st.wood, (px + nx * 0.06, py + ny * 0.06, z + h + fw / 2), (w + 2 * fw, 0.1, fw), bevel=0.015, rot_z=rot)
    b.box(st.stone, (px + nx * 0.1, py + ny * 0.1, z - 0.06), (w + 0.3, 0.2, 0.12), bevel=0.02, rot_z=rot)
    if shutters:
        for sx in (-1, 1):
            cx = px + ax * sx * (w / 2 + fw + w * 0.26) + nx * 0.09
            cy = py + ay * sx * (w / 2 + fw + w * 0.26) + ny * 0.09
            b.box(st.wood, (cx, cy, z + h / 2), (w * 0.5, 0.05, h), bevel=0.012, rot_z=rot + sx * 12, detail=True)


def door(b: Builder, st: Style, origin, along, normal, offset: float, *, w: float = 1.1, h: float = 2.2, z: float = 0.0, arch: bool = False) -> None:
    ox, oy = origin
    ax, ay = along
    nx, ny = normal
    px, py = ox + ax * offset, oy + ay * offset
    rot = _rot_of(normal)
    b.box(st.wood, (px + nx * 0.04, py + ny * 0.04, z + h / 2), (w, 0.08, h), bevel=0.02, rot_z=rot, grain=True)
    # herrajes
    for hz in (0.45, h - 0.5):
        b.box(IRON, (px + nx * 0.09, py + ny * 0.09, z + hz), (w * 0.85, 0.02, 0.07), bevel=0.0, rot_z=rot, detail=True)
    # jambas y dintel de piedra
    for sx in (-1, 1):
        b.box(st.stone, (px + ax * sx * (w / 2 + 0.15) + nx * 0.08, py + ay * sx * (w / 2 + 0.15) + ny * 0.08, z + h / 2 + 0.1), (0.3, 0.2, h + 0.2), bevel=0.03, rot_z=rot)
    b.box(st.stone, (px + nx * 0.1, py + ny * 0.1, z + h + 0.22), (w + 0.75, 0.26, 0.36 if not arch else 0.6), bevel=0.04, rot_z=rot)
    # escalón
    b.box(st.stone, (px + nx * 0.35, py + ny * 0.35, z + 0.09), (w + 0.6, 0.6, 0.18), bevel=0.03, rot_z=rot)


def timber_face(b: Builder, st: Style, origin, along, normal, length: float, z0: float, h: float, *, seed: int = 0) -> None:
    """Entramado visto sobre una cara: soleras, postes cada ~1,25 m y tornapuntas en los extremos."""
    ox, oy = origin
    ax, ay = along
    nx, ny = normal
    off = 0.06
    bw = 0.2
    def p(t: float, z: float):
        return (ox + ax * t + nx * off, oy + ay * t + ny * off, z)
    half = length / 2
    b.beam(st.wood, p(-half, z0 + bw / 2), p(half, z0 + bw / 2), bw)
    b.beam(st.wood, p(-half, z0 + h - bw / 2), p(half, z0 + h - bw / 2), bw)
    n = max(2, round(length / 1.25))
    for i in range(n + 1):
        t = -half + length * i / n
        t = max(-half + bw / 2, min(half - bw / 2, t))
        b.beam(st.wood, p(t, z0 + bw), p(t, z0 + h - bw), bw * 0.9)
    # tornapuntas en los dos primeros y últimos vanos
    step = length / n
    for t0, t1 in ((-half, -half + step), (half, half - step)):
        b.beam(st.wood, p(t0, z0 + bw), p(t1, z0 + h - bw), bw * 0.75, detail=True)


def gable_roof(b: Builder, st: Style, cx: float, cy: float, w: float, d: float, z: float, *, along_x: bool = True, overhang: float = 0.5, gable_mat: str | None = None) -> float:
    """Tejado a dos aguas + hastiales; devuelve la altura de cumbrera."""
    span = d if along_x else w
    rise = (span / 2) * math.tan(math.radians(st.roof_pitch))
    b.gable_roof(st.roof, (cx, cy, z), w, d, rise, overhang=overhang, ridge_along_x=along_x, ridge_mat=st.roof)
    gm = gable_mat or (st.plaster if st.timbered else st.wood)
    if along_x:
        for sx in (-1, 1):
            b.gable_wall(gm, (cx + sx * (w / 2 - 0.12), cy, z), d, rise, 0.24, rot_z=90)
    else:
        for sy in (-1, 1):
            b.gable_wall(gm, (cx, cy + sy * (d / 2 - 0.12), z), w, rise, 0.24)
    return z + rise


def chimney(b: Builder, st: Style, x: float, y: float, z_base: float, top: float) -> None:
    b.box(st.stone, (x, y, (z_base + top) / 2), (0.75, 0.75, top - z_base), bevel=0.04)
    b.box(st.stone, (x, y, top + 0.08), (0.95, 0.95, 0.16), bevel=0.03)
    b.box(IRON, (x, y, top + 0.02), (0.45, 0.45, 0.2), bevel=0.0, detail=True)


def house(
    b: Builder,
    st: Style,
    cx: float,
    cy: float,
    w: float,
    d: float,
    floors: int,
    *,
    seed: int = 0,
    door_face: str = 'front',
    along_x: bool | None = None,
    chimney_on: bool = True,
    windows_ground: bool = True,
    gable_mat: str | None = None,
) -> float:
    """Casa/edificio de varias plantas; devuelve la altura de cumbrera."""
    rng = random.Random(seed)
    along_x = (w >= d) if along_x is None else along_x
    # zócalo + planta baja de piedra
    b.box(st.stone, (cx, cy, st.plinth / 2), (w + 0.3, d + 0.3, st.plinth), bevel=0.05)
    b.box(st.stone, (cx, cy, GROUND_H / 2), (w, d, GROUND_H), bevel=0.06)
    z = GROUND_H
    for f in range(floors - 1):
        j = st.jetty
        fw, fd = w + 2 * j, d + 2 * j
        b.box(st.wood, (cx, cy, z + 0.12), (fw + 0.1, fd + 0.1, 0.24), bevel=0.03)  # forjado visto
        wall_mat = st.plaster if st.timbered else st.wood if st.civ == 'liga' and f % 2 else st.plaster
        b.box(wall_mat, (cx, cy, z + FLOOR_H / 2 + 0.12), (fw, fd, FLOOR_H), bevel=0.04)
        for face in ('front', 'back', 'left', 'right'):
            o, a, n, L = _face_frame(cx, cy, fw, fd, face)
            if st.timbered:
                timber_face(b, st, o, a, n, L, z + 0.24, FLOOR_H - 0.12, seed=seed + f)
            nwin = max(1, int((L - 1.0) // 2.4))
            for i in range(nwin):
                t = -L / 2 + L * (i + 0.5) / nwin
                window(b, st, (o[0] + n[0] * 0.02, o[1] + n[1] * 0.02), a, n, t, z + 1.15, shutters=rng.random() < 0.7)
        z += FLOOR_H + 0.12
    # ventanas y puerta de la planta baja
    for face in ('front', 'back', 'left', 'right'):
        o, a, n, L = _face_frame(cx, cy, w, d, face)
        if face == door_face:
            door(b, st, o, a, n, 0.0 if L < 6 else -L * 0.18)
            if windows_ground and L >= 6:
                window(b, st, o, a, n, L * 0.25, 1.1)
        elif windows_ground and L > 3:
            nwin = max(1, int((L - 1.0) // 3.0))
            for i in range(nwin):
                window(b, st, o, a, n, -L / 2 + L * (i + 0.5) / nwin, 1.1, w=0.6, h=0.9, shutters=False)
    top_w = w + 2 * st.jetty * (floors > 1)
    top_d = d + 2 * st.jetty * (floors > 1)
    ridge = gable_roof(b, st, cx, cy, top_w, top_d, z, along_x=along_x, gable_mat=gable_mat)
    if chimney_on:
        sx = (top_w / 2 - 1.2) * (1 if rng.random() < 0.5 else -1) if along_x else 0.0
        sy = 0.0 if along_x else (top_d / 2 - 1.2)
        chimney(b, st, cx + sx * 0.7, cy + sy * 0.3 + (0.6 if along_x else 0), z, ridge + 0.6)
    return ridge


def crenellated_top(b: Builder, st: Style, cx: float, cy: float, w: float, d: float, z: float, *, merlon: float = 0.9, gap: float = 0.7) -> None:
    """Parapeto almenado sobre una caja (w×d) a la altura z."""
    t = 0.5
    for face in ('front', 'back', 'left', 'right'):
        o, a, n, L = _face_frame(cx, cy, w - t, d - t, face)
        b.box(st.stone, (o[0], o[1], z + 0.45), (L + t if face in ('front', 'back') else t, t if face in ('front', 'back') else L + t, 0.9), bevel=0.04)
        count = max(2, int(L // (merlon + gap)))
        for i in range(count):
            s = -L / 2 + (i + 0.5) * L / count
            px, py = o[0] + a[0] * s, o[1] + a[1] * s
            b.box(st.stone, (px, py, z + 0.9 + 0.45), (merlon if face in ('front', 'back') else t, t if face in ('front', 'back') else merlon, 0.9), bevel=0.04)


def round_tower(b: Builder, st: Style, x: float, y: float, r: float, h: float, *, roof: bool = True, crenel: bool = False, segments: int = 16) -> float:
    b.cylinder(st.stone, (x, y, 0), r + 0.25, 0.6, segments=segments, bevel=0.05)
    b.cylinder(st.stone, (x, y, 0), r, h, segments=segments, bevel=0.0, radius_top=r * 0.94)
    # cordón
    b.cylinder(st.stone, (x, y, h * 0.62), r * 0.99, 0.25, segments=segments, bevel=0.03, radius_top=r * 0.99)
    # aspilleras
    for k in range(4):
        ang = math.radians(45 + 90 * k)
        b.box(IRON, (x + math.cos(ang) * r * 0.95, y + math.sin(ang) * r * 0.95, h * 0.45), (0.18, 0.18, 1.0), bevel=0.0, rot_z=math.degrees(ang) + 90, detail=True)
    top = h
    if crenel:
        b.cylinder(st.stone, (x, y, h), r * 1.08, 0.3, segments=segments, bevel=0.03)
        for k in range(10):
            ang = 2 * math.pi * k / 10
            b.box(st.stone, (x + math.cos(ang) * r * 0.98, y + math.sin(ang) * r * 0.98, h + 0.75), (0.8, 0.45, 0.9), rot_z=math.degrees(ang) + 90, bevel=0.04)
        top = h + 1.2
    if roof:
        rh = r * (1.9 if st.civ == 'corona' else 2.3)
        b.cone_roof(st.roof, (x, y, h + (0.3 if crenel else 0)), r * 1.02, rh, segments=segments)
        b.cylinder(IRON, (x, y, h + rh + 0.1), 0.05, 1.6, segments=6, bevel=0.0, detail=True)
        top = h + rh
    return top


def banner_pole(b: Builder, st: Style, x: float, y: float, z: float, h: float = 3.0, rot_z: float = 0.0) -> None:
    b.cylinder(st.wood, (x, y, z), 0.07, h, segments=8, bevel=0.0)
    b.flag(st.cloth, (x + 0.07, y, z + h - 0.15), 1.3, 0.9, rot_z=rot_z)
