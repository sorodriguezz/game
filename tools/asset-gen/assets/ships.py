"""Barcos (Art Bible §12: ≤ 12 k triángulos LOD0). Proa hacia −Y (glTF +Z), pivote en la flotación.

- `cog`: coca mercante de casco redondo, castillos de proa y popa, una vela cuadra.
- `galley`: galera de guerra larga y baja, remos, espolón y vela latina.
Casco por secciones (loft) con tracas de madera, cubierta, regala, timón, aparejos
y bandera de la civilización. El balanceo y las velas se animan en el motor.
"""

from __future__ import annotations

import math

from reinos_assets import arch as A
from reinos_assets.geo import Builder

HULL = 'common.hull_tar'
ROPE = 'common.rope'
CANVAS = 'common.canvas'


def _hull(b: Builder, length: float, beam: float, depth: float, freeboard: float, *, sheer: float, fullness: float, stations: int = 22, girth: int = 9) -> list[float]:
    """Casco: anillos transversales de babor a estribor pasando por la quilla. Devuelve semimanga por estación."""
    rings = []
    halfw = []
    for i in range(stations + 1):
        t = i / stations  # 0 = proa (−Y), 1 = popa
        y = (t - 0.5) * length
        # forma en planta: proa afinada, popa más llena
        k = 1 - abs(2 * t - 1) ** (2.2 if t < 0.5 else fullness)
        w = beam / 2 * max(0.04, k) ** 0.55
        top = freeboard + sheer * (2 * t - 1) ** 2  # arrufo: extremos más altos
        keel = -depth * (0.35 + 0.65 * max(0.0, k) ** 0.4)
        ring = []
        for j in range(girth + 1):
            s = j / girth  # 0 babor-regala → 0.5 quilla → 1 estribor-regala
            a = (s - 0.5) * math.pi  # −π/2 .. π/2
            x = math.sin(a) * w
            z = top + (keel - top) * math.cos(a) ** 1.25
            ring.append((x, y, z))
        rings.append(ring)
        halfw.append(w)
    b.loft(HULL, rings, close_ends=True)
    return halfw


def _deck_and_rail(b: Builder, st: A.Style, length: float, halfw: list[float], freeboard: float, sheer: float) -> None:
    n = len(halfw) - 1
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        y0, y1 = (t0 - 0.5) * length, (t1 - 0.5) * length
        w = min(halfw[i], halfw[i + 1]) * 0.96
        z = freeboard - 0.35 + sheer * ((t0 + t1) - 1) ** 2
        if w > 0.15:
            b.box(st.wood, (0, (y0 + y1) / 2, z), (2 * w, abs(y1 - y0) + 0.02, 0.12), bevel=0.0, grain=True)
    # regala (borda) a ambos costados
    for side in (-1, 1):
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            p0 = (side * halfw[i], (t0 - 0.5) * length, freeboard + sheer * (2 * t0 - 1) ** 2 + 0.05)
            p1 = (side * halfw[i + 1], (t1 - 0.5) * length, freeboard + sheer * (2 * t1 - 1) ** 2 + 0.05)
            b.beam(st.wood, p0, p1, 0.14)


def _shrouds(b: Builder, mast_x: float, mast_y: float, top: float, halfw: float, deck_z: float) -> None:
    for side in (-1, 1):
        for k in range(3):
            b.beam(ROPE, (mast_x, mast_y, top), (side * halfw, mast_y + (k - 1) * 0.55, deck_z + 0.6), 0.035, detail=True)
        # flechastes (escalones)
        for r in range(4):
            z = deck_z + 1.2 + r * (top - deck_z - 1.5) / 4
            f = (z - deck_z - 0.6) / (top - deck_z - 0.6)
            xin = side * (halfw + (mast_x - halfw * side) * f * side)
            b.beam(ROPE, (side * halfw * (1 - f) + mast_x * f, mast_y - 0.55, z), (side * halfw * (1 - f) + mast_x * f, mast_y + 0.55, z), 0.02, detail=True)


def cog(st: A.Style) -> Builder:
    b = Builder()
    L, B, D, F, S = 15.0, 5.2, 1.6, 1.7, 0.55
    halfw = _hull(b, L, B, D, F, sheer=S, fullness=1.6)
    _deck_and_rail(b, st, L, halfw, F, S)
    # castillo de popa y de proa
    for y, w, h in ((L * 0.36, 3.6, 1.6), (-L * 0.38, 2.6, 1.2)):
        z0 = F + S * 0.8 - 0.3
        b.box(st.wood, (0, y, z0 + h / 2), (w, 2.6, h), bevel=0.04, grain=True)
        for k in range(5):
            b.box(st.wood, (-w / 2 + 0.2 + k * (w - 0.4) / 4, y, z0 + h + 0.35), (0.14, 2.6, 0.7), bevel=0.02, detail=True)
        b.box(st.wood, (0, y, z0 + h + 0.72), (w + 0.1, 2.7, 0.1), bevel=0.01)
    # mástil, verga, vela cuadra y cofa
    mast_h = 13.0
    b.cylinder(st.wood, (0, -0.6, F - 0.4), 0.2, mast_h, segments=10, bevel=0.0, radius_top=0.13)
    b.cylinder(st.wood, (0, -0.6, F + mast_h - 2.4), 0.55, 0.7, segments=10, bevel=0.03)  # cofa
    yard_z = F + mast_h - 3.4
    b.cylinder(st.wood, (-4.2, -0.85, yard_z), 0.09, 8.4, segments=8, bevel=0.0, axis='X')
    b.sail(f'{st.civ}.sail', (0, -1.0, yard_z - 0.1), 8.0, 7.6, billow=0.9, taper=0.12)
    _shrouds(b, 0, -0.6, F + mast_h - 2.6, B / 2 * 0.95, F)
    b.beam(ROPE, (0, -0.6, F + mast_h - 1.0), (0, -L / 2 - 0.4, F + S + 0.6), 0.04, detail=True)  # estay de proa
    b.beam(ROPE, (0, -0.6, F + mast_h - 1.0), (0, L / 2 - 0.4, F + S + 2.2), 0.04, detail=True)  # estay de popa
    # bauprés y timón de codaste
    b.beam(st.wood, (0, -L / 2 + 0.8, F + S + 0.4), (0, -L / 2 - 2.6, F + S + 1.4), 0.18)
    b.box(st.wood, (0, L / 2 + 0.15, F * 0.2), (0.18, 0.9, F * 2.4), bevel=0.03, grain=True)
    b.beam(st.wood, (0, L / 2 - 0.4, F + S + 0.4), (0, L / 2 - 2.2, F + S + 0.7), 0.1, detail=True)  # caña
    # bandera en el tope y en popa
    b.cylinder(st.wood, (0, -0.6, F + mast_h), 0.05, 1.2, segments=6, bevel=0.0, detail=True)
    b.flag(st.cloth, (0.05, -0.6, F + mast_h + 1.1), 1.6, 0.9)
    b.cylinder(st.wood, (0, L * 0.45, F + S + 1.5), 0.05, 2.2, segments=6, bevel=0.0, detail=True)
    b.flag(st.cloth, (0.05, L * 0.45, F + S + 3.6), 1.3, 0.8, rot_z=90)
    # carga en cubierta
    for i, (x, y) in enumerate(((-1.2, 1.4), (-0.4, 1.6), (1.0, 1.0), (1.2, 2.0))):
        b.cylinder(st.wood, (x, y, F - 0.3), 0.3, 0.8, segments=10, bevel=0.02, radius_top=0.28, detail=True)
    b.box(st.wood, (0.4, 2.8, F - 0.3 + 0.35), (0.9, 0.9, 0.7), bevel=0.03, grain=True, detail=True)
    return b


def galley(st: A.Style) -> Builder:
    b = Builder()
    L, B, D, F, S = 24.0, 4.0, 1.2, 1.2, 0.35
    halfw = _hull(b, L, B, D, F, sheer=S, fullness=2.2, stations=28)
    _deck_and_rail(b, st, L, halfw, F, S)
    # espolón de bronce/hierro
    b.beam(A.IRON, (0, -L / 2 + 0.3, 0.05), (0, -L / 2 - 2.6, 0.1), 0.35)
    # crujía central y castillete de popa
    b.box(st.wood, (0, 0, F + 0.1), (0.9, L * 0.7, 0.35), bevel=0.03, grain=True)
    b.box(st.wood, (0, L * 0.38, F + 0.8), (2.6, 3.0, 1.2), bevel=0.04, grain=True)
    # remos: 12 por banda
    for side in (-1, 1):
        for k in range(12):
            y = -L * 0.3 + k * (L * 0.58) / 11
            hw = halfw[min(len(halfw) - 1, int((y / L + 0.5) * (len(halfw) - 1)))]
            b.beam(st.wood, (side * (hw - 0.2), y, F + 0.15), (side * (hw + 3.6), y - 0.6, -0.15), 0.07)
            b.box(st.wood, (side * (hw + 3.5), y - 0.58, -0.12), (0.06, 0.5, 0.18), bevel=0.0, rot_z=-10 * side, detail=True)
    # escudos en la regala
    for side in (-1, 1):
        for k in range(10):
            y = -L * 0.32 + k * (L * 0.6) / 9
            hw = halfw[min(len(halfw) - 1, int((y / L + 0.5) * (len(halfw) - 1)))]
            b.cylinder(st.cloth if k % 2 else st.wood, (side * (hw + 0.06), y, F + 0.45), 0.42, 0.06, segments=10, bevel=0.0, axis='X', detail=True)
    # mástil con entena latina
    mast_h = 10.5
    b.cylinder(st.wood, (0, -2.0, F - 0.3), 0.17, mast_h, segments=10, bevel=0.0, radius_top=0.11)
    b.beam(st.wood, (0, -7.5, F + 2.8), (0, 4.0, F + mast_h + 1.2), 0.11)
    b.sail(f'{st.civ}.sail', (0, -2.3, F + mast_h - 0.6), 5.8, 8.2, billow=0.7, taper=0.7, rot_z=90)
    _shrouds(b, 0, -2.0, F + mast_h - 1.0, B / 2 * 0.9, F)
    b.cylinder(st.wood, (0, -2.0, F + mast_h), 0.05, 1.2, segments=6, bevel=0.0, detail=True)
    b.flag(st.cloth, (0.05, -2.0, F + mast_h + 1.1), 1.8, 1.0)
    # timones de espadilla
    for side in (-1, 1):
        b.beam(st.wood, (side * 1.3, L / 2 - 1.5, F + 0.6), (side * 1.6, L / 2 + 0.6, -0.8), 0.14)
        b.box(st.wood, (side * 1.6, L / 2 + 0.5, -0.6), (0.1, 0.7, 1.1), bevel=0.02, detail=True)
    return b


SHIPS = {'ship_cog': cog, 'ship_galley': galley}
