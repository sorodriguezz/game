"""Generadores de edificios de ciudad por tipo, civilización y etapa visual.

Huellas (Art Bible §2): estándar ≤ 11×11 m, centro ≤ 18×18 m, costera ≤ 14×18 m.
Cada etapa AMPLÍA el edificio (Art Bible §3), no lo escala.
"""

from __future__ import annotations

import math

from reinos_assets import arch as A
from reinos_assets.geo import Builder


def _fence(b: Builder, st: A.Style, x0: float, y0: float, x1: float, y1: float, *, post_every: float = 1.6) -> None:
    length = math.hypot(x1 - x0, y1 - y0)
    n = max(1, round(length / post_every))
    for i in range(n + 1):
        t = i / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        b.box(st.wood, (x, y, 0.55), (0.14, 0.14, 1.1), bevel=0.02)
    for z in (0.45, 0.9):
        b.beam(st.wood, (x0, y0, z), (x1, y1, z), 0.08)


def _weapon_rack(b: Builder, st: A.Style, x: float, y: float, rot: float = 0.0) -> None:
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def P(u: float, v: float, z: float):
        return (x + c * u - s * v, y + s * u + c * v, z)
    for u in (-0.9, 0.9):
        b.beam(st.wood, P(u, 0, 0.0), P(u, 0, 1.4), 0.1)
    b.beam(st.wood, P(-1.0, 0, 1.3), P(1.0, 0, 1.3), 0.08)
    for k in range(5):
        u = -0.7 + k * 0.35
        b.beam(st.wood, P(u, -0.25, 0.0), P(u, 0.05, 2.6), 0.045, detail=True)
        b.box(A.IRON, P(u, 0.06, 2.65), (0.08, 0.04, 0.3), bevel=0.0, rot_z=rot, detail=True)


def _target(b: Builder, st: A.Style, x: float, y: float) -> None:
    b.beam(st.wood, (x - 0.4, y, 0), (x, y, 1.6), 0.08)
    b.beam(st.wood, (x + 0.4, y, 0), (x, y, 1.6), 0.08)
    b.cylinder(st.cloth, (x, y - 0.06, 1.0), 0.55, 0.12, segments=14, bevel=0.0, axis='Y')


def barracks(st: A.Style, stage: int) -> Builder:
    b = Builder()
    # nave principal (dormitorio) al fondo de la parcela
    A.house(b, st, 0.0, 2.2, 9.0, 5.2, 2 if stage < 3 else 3, seed=11, along_x=True)
    if stage >= 2:
        # patio de instrucción con empalizada baja, armeros y dianas
        _fence(b, st, -5.0, -1.0, -5.0, -5.2)
        _fence(b, st, -5.0, -5.2, -1.4, -5.2)
        _fence(b, st, 1.4, -5.2, 5.0, -5.2)
        _fence(b, st, 5.0, -5.2, 5.0, -1.0)
        _weapon_rack(b, st, -3.4, -1.4, 0)
        _target(b, st, 3.4, -3.6)
        _target(b, st, 2.0, -3.9)
    else:
        _weapon_rack(b, st, -3.0, -2.2, 0)
    if stage >= 3:
        A.round_tower(b, st, 4.4, 4.0, 1.6, 9.5, crenel=True, roof=st.civ == 'liga', segments=14)
        A.banner_pole(b, st, -4.3, -4.6, 1.1, 3.4)
    else:
        A.banner_pole(b, st, -4.3, -3.0, 0.0, 3.6)
    return b


# ---------------------------------------------------------------- props comunes


def _barrel(b: Builder, st: A.Style, x: float, y: float, z: float = 0.0) -> None:
    b.cylinder(st.wood, (x, y, z), 0.32, 0.85, segments=10, bevel=0.02, radius_top=0.3, detail=True)
    for hz in (0.15, 0.68):
        b.cylinder(A.IRON, (x, y, z + hz), 0.335, 0.05, segments=10, bevel=0.0, detail=True)


def _crate(b: Builder, st: A.Style, x: float, y: float, z: float = 0.0, s: float = 0.7, rot: float = 0.0) -> None:
    b.box(st.wood, (x, y, z + s / 2), (s, s, s), bevel=0.03, rot_z=rot, grain=True, detail=True)


def _haystack(b: Builder, x: float, y: float, r: float = 1.1) -> None:
    b.cylinder('common.crop', (x, y, 0), r, r * 0.9, segments=12, bevel=0.0, radius_top=r * 0.85)
    b.cone_roof('common.crop', (x, y, r * 0.9 - 0.1), r * 0.85, r * 1.0, segments=12, overhang=0.05, thickness=0.05)


def _field(b: Builder, x0: float, y0: float, x1: float, y1: float, rows: int) -> None:
    """Parcela de cultivo: surcos de tierra y caballones con mies (a lo largo de X)."""
    b.box('common.dirt', ((x0 + x1) / 2, (y0 + y1) / 2, 0.04), (x1 - x0, y1 - y0, 0.08), bevel=0.0)
    step = (y1 - y0) / rows
    for i in range(rows):
        cy = y0 + step * (i + 0.5)
        b.box('common.crop', ((x0 + x1) / 2, cy, 0.22), (x1 - x0 - 0.3, step * 0.55, 0.36), bevel=0.08)


def _well(b: Builder, st: A.Style, x: float, y: float) -> None:
    b.cylinder(st.stone, (x, y, 0), 0.75, 0.85, segments=12, bevel=0.03)
    for sx in (-1, 1):
        b.box(st.wood, (x + sx * 0.7, y, 1.2), (0.12, 0.12, 1.5), bevel=0.02)
    b.beam(st.wood, (x - 0.8, y, 1.85), (x + 0.8, y, 1.85), 0.1)
    b.gable_roof(st.roof, (x, y, 1.95), 1.9, 1.3, 0.55, overhang=0.1, thickness=0.06)


def _cart(b: Builder, st: A.Style, x: float, y: float, rot: float = 0.0) -> None:
    c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def P(u, v, z):
        return (x + c * u - s_ * v, y + s_ * u + c * v, z)
    b.box(st.wood, P(0, 0, 0.75), (1.1, 1.8, 0.12), bevel=0.02, rot_z=rot, grain=True, detail=True)
    for u in (-0.55, 0.55):
        b.box(st.wood, P(u, 0, 1.0), (0.06, 1.8, 0.4), bevel=0.01, rot_z=rot, detail=True)
        b.cylinder(st.wood, P(u * 1.15, 0.2, 0.5), 0.5, 0.1, segments=12, bevel=0.0, axis='X', rot_z=rot, detail=True)
    b.beam(st.wood, P(0, 0.9, 0.7), P(0, 2.2, 0.55), 0.08, detail=True)


# --------------------------------------------------------------------- edificios


def city_hall(st: A.Style, stage: int) -> Builder:
    """Centro urbano: casa señorial → con torre del homenaje → castillo con patio y torres (≤ 18×18)."""
    b = Builder()
    if stage == 1:
        A.house(b, st, 0.0, 0.0, 10.0, 7.0, 2, seed=1, along_x=True)
        A.banner_pole(b, st, 4.2, -4.6, 0.0, 4.0)
        _well(b, st, -4.5, -5.0)
        return b
    # torre del homenaje (keep)
    keep_w = 8.0 if stage == 2 else 9.0
    keep_h = 11.0 if stage == 2 else 14.0
    b.box(st.stone, (0, 1.5, 0.3), (keep_w + 0.6, keep_w + 0.6, 0.6), bevel=0.05)
    b.box(st.stone, (0, 1.5, keep_h / 2), (keep_w, keep_w, keep_h), bevel=0.08)
    for k in range(3):
        b.box(st.stone, (0, 1.5, 3.6 + k * 3.4), (keep_w + 0.12, keep_w + 0.12, 0.22), bevel=0.03)
    for face in ('front', 'left', 'right', 'back'):
        o, a, n, L = A._face_frame(0, 1.5, keep_w, keep_w, face)
        for zz in (4.6, 8.0) if stage == 2 else (4.6, 8.0, 11.4):
            for t in (-L * 0.22, L * 0.22):
                A.window(b, st, o, a, n, t, zz, w=0.7, h=1.3, shutters=False)
    o, a, n, L = A._face_frame(0, 1.5, keep_w, keep_w, 'front')
    A.door(b, st, o, a, n, 0.0, w=1.8, h=3.0, arch=True)
    A.crenellated_top(b, st, 0, 1.5, keep_w + 0.4, keep_w + 0.4, keep_h)
    # torrecillas en esquinas
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.round_tower(b, st, sx * keep_w / 2, 1.5 + sy * keep_w / 2, 1.0, keep_h + 2.2, crenel=False, roof=True, segments=12)
    A.banner_pole(b, st, 0.0, 1.5, keep_h + 0.9, 3.2)
    # ala residencial
    A.house(b, st, 0.0 if stage == 2 else -4.6, -5.0 if stage == 2 else -3.4, 7.0 if stage == 2 else 4.0, 4.6 if stage == 2 else 5.2, 2, seed=3, along_x=stage == 2, chimney_on=True)
    if stage == 3:
        A.house(b, st, 4.6, -3.4, 4.0, 5.2, 2, seed=5, along_x=False)
        # muralla del patio y torres de esquina
        C = 7.3
        for x0, y0, x1, y1 in ((-C, -C, -2.6, -C), (2.6, -C, C, -C), (-C, -C, -C, C), (C, -C, C, C), (-C, C, C, C)):
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            L = math.hypot(x1 - x0, y1 - y0)
            along_x = abs(y1 - y0) < 1e-6
            b.box(st.stone, (cx, cy, 2.2), (L if along_x else 1.2, 1.2 if along_x else L, 4.4), bevel=0.06)
            n = max(2, int(L // 1.6))
            for i in range(n):
                t = -L / 2 + (i + 0.5) * L / n
                px, py = (cx + t, cy) if along_x else (cx, cy + t)
                b.box(st.stone, (px, py, 4.85), (0.8 if along_x else 0.5, 0.5 if along_x else 0.8, 0.9), bevel=0.04)
        for sx in (-1, 1):
            for sy in (-1, 1):
                A.round_tower(b, st, sx * C, sy * C, 1.3, 7.5, crenel=True, roof=st.civ == 'liga', segments=12)
        # puerta del patio
        for sx in (-1, 1):
            b.box(st.stone, (sx * 2.1, -C, 3.0), (1.4, 1.8, 6.0), bevel=0.06)
        b.box(st.stone, (0, -C, 5.5), (2.8, 1.6, 1.0), bevel=0.06)
        b.box(st.wood, (0, -C + 0.05, 2.0), (2.8, 0.2, 4.0), bevel=0.03, grain=True)
    else:
        _well(b, st, 4.6, -4.8)
    return b


def farm(st: A.Style, stage: int) -> Builder:
    b = Builder()
    # casa de labranza de una planta; la etapa amplía el granero y los campos
    A.house(b, st, -2.6, 2.8, 5.4, 4.4, 1, seed=21, along_x=True, gable_mat=st.wood)
    _field(b, -5.2, -5.2, 0.6 if stage == 1 else 5.2, -0.6, 5)
    _haystack(b, 3.4, 2.0)
    if stage >= 2:
        # granero de madera con tejado de paja
        b.box(st.wood, (3.4, 3.8, 1.6), (3.6, 3.0, 3.2), bevel=0.05, grain=True)
        b.gable_roof(st.roof, (3.4, 3.8, 3.2), 3.6 if stage == 2 else 4.4, 3.0, 1.9, overhang=0.4, thickness=0.2, ridge_along_x=False)
        _haystack(b, 0.8, 1.6, 0.9)
        _cart(b, st, -4.6, 0.6, 90)
    if stage >= 3:
        for x0, y0, x1, y1 in ((-5.4, -5.4, 5.4, -5.4), (-5.4, -5.4, -5.4, 0.2), (5.4, -5.4, 5.4, 0.2)):
            _fence(b, st, x0, y0, x1, y1, post_every=1.8)
        _well(b, st, 0.4, 4.6)
    return b


def sawmill(st: A.Style, stage: int) -> Builder:
    b = Builder()
    # cobertizo abierto con banco de sierra
    posts = [(-4.0, -1.0), (4.0, -1.0), (-4.0, 3.6), (4.0, 3.6)]
    for x, y in posts:
        b.box(st.wood, (x, y, 1.6), (0.28, 0.28, 3.2), bevel=0.03, grain=True)
    b.gable_roof(st.roof if stage > 1 else 'common.thatch', (0, 1.3, 3.2), 8.8, 5.4, 1.8, overhang=0.4, thickness=0.18)
    b.box(st.wood, (0, 1.3, 0.8), (6.0, 0.9, 0.18), bevel=0.02, grain=True)
    for x in (-2.6, 0.0, 2.6):
        b.box(st.wood, (x, 1.3, 0.38), (0.25, 0.8, 0.76), bevel=0.02)
    b.cylinder(st.wood, (-1.0, 1.3, 1.25), 0.32, 4.0, segments=10, bevel=0.0, axis='X', detail=True)
    b.box(A.IRON, (0.6, 1.3, 1.6), (0.05, 0.9, 0.7), bevel=0.0, detail=True)
    # pila de troncos
    for i in range(3 + stage):
        row = i % 3
        b.cylinder(st.wood, (-2.0 + row * 0.75 + (i // 3) * 0.37, -3.6, 0.35 + (i // 3) * 0.6), 0.34, 4.2, segments=10, bevel=0.0, axis='Y', rot_z=90)
    # tablones apilados
    for k in range(2 + stage):
        b.box(st.wood, (3.0, -3.4, 0.1 + k * 0.16), (3.0, 1.4, 0.14), bevel=0.01, grain=True)
    if stage >= 3:
        A.house(b, st, 0.0, 4.8, 6.0, 2.6, 1, seed=31, along_x=True, chimney_on=False, windows_ground=False)
    return b


def quarry(st: A.Style, stage: int) -> Builder:
    b = Builder()
    rock = 'common.rough_stone'
    # frente de cantera escalonado al fondo de la parcela
    for k in range(2 + stage):
        b.box(rock, (0, 3.6 - k * 0.0, 0.9 + k * 1.3), (9.6 - k * 1.4, 3.2 - k * 0.35, 1.8 + k * 0.1), bevel=0.25)
    for i, (x, y, s_) in enumerate(((-4.4, 1.2, 1.4), (4.2, 1.6, 1.7), (-3.6, 4.6, 2.2), (4.0, 4.8, 2.0))):
        b.rock(rock, (x, y, 0.0), (s_, s_ * 0.9, s_ * 0.8), seed=40 + i)
    # bloques escuadrados listos para transportar
    for i in range(2 + stage * 2):
        b.box(st.stone, (-3.0 + (i % 4) * 1.4, -2.8 - (i // 4) * 1.2, 0.35), (1.1, 0.8, 0.7), bevel=0.04, rot_z=(i * 13) % 20 - 10)
    # grúa de madera
    if stage >= 2:
        b.box(st.wood, (2.6, -1.2, 2.4), (0.3, 0.3, 4.8), bevel=0.03, grain=True)
        b.beam(st.wood, (2.6, -1.2, 4.6), (0.4, -3.2, 4.0), 0.18)
        b.beam(st.wood, (2.6, -1.2, 0.2), (3.6, -0.2, 0.0), 0.16)
        b.cylinder(st.wood, (2.6, -0.9, 1.0), 0.45, 0.5, segments=10, axis='Y', detail=True)
    _cart(b, st, -4.4, -4.2, 15)
    return b


def mine(st: A.Style, stage: int) -> Builder:
    b = Builder()
    rock = 'common.rough_stone'
    # ladera rocosa con bocamina entibada
    b.rock(rock, (0, 3.2, 0.0), (10.5, 6.5, 6.4), seed=50)
    b.rock(rock, (-3.8, 1.2, 0.0), (3.6, 3.2, 3.0), seed=51)
    b.rock(rock, (4.0, 1.4, 0.0), (3.4, 3.0, 2.8), seed=52)
    # entibado de la bocamina
    for sx in (-1, 1):
        b.box(st.wood, (sx * 1.2, 0.0, 1.4), (0.3, 0.3, 2.8), bevel=0.03, grain=True)
    b.box(st.wood, (0, 0.0, 2.9), (3.0, 0.4, 0.35), bevel=0.03, grain=True)
    b.box(A.IRON, (0, 0.18, 1.35), (2.1, 0.1, 2.7), bevel=0.0)
    # raíles y vagoneta
    for sx in (-0.35, 0.35):
        b.box(A.IRON, (sx, -2.6, 0.08), (0.06, 5.4, 0.06), bevel=0.0, detail=True)
    for k in range(9):
        b.box(st.wood, (0, -0.2 - k * 0.6, 0.04), (1.1, 0.16, 0.08), bevel=0.0, detail=True)
    b.box(A.IRON, (0, -3.2, 0.55), (0.9, 1.2, 0.7), bevel=0.05)
    b.rock(rock, (0, -3.2, 0.85), (0.8, 1.0, 0.5), seed=53, detail=True)
    # escombrera
    b.rock(rock, (-3.6, -3.6, 0.0), (2.8, 2.4, 1.0), seed=54)
    if stage >= 2:
        b.box(st.wood, (3.6, -2.4, 1.4), (2.8, 2.4, 2.8), bevel=0.05, grain=True)
        b.gable_roof(st.roof, (3.6, -2.4, 2.8), 2.8, 2.4, 1.2, overhang=0.3, thickness=0.14)
    if stage >= 3:
        # castillete de extracción
        for sx in (-1, 1):
            b.beam(st.wood, (sx * 1.4, 1.6, 3.0), (0, 1.6, 7.0), 0.22)
        b.cylinder(st.wood, (0, 1.6, 6.8), 0.6, 0.3, segments=12, axis='Y', detail=True)
    return b


def warehouse(st: A.Style, stage: int) -> Builder:
    b = Builder()
    w = 8.0 if stage < 3 else 9.6
    b.box(st.stone, (0, 1.4, 0.3), (w + 0.3, 6.3, 0.6), bevel=0.05)
    b.box(st.wood, (0, 1.4, 2.4), (w, 6.0, 4.8), bevel=0.05, grain=True)
    for x in (-w / 2, -w / 6, w / 6, w / 2):
        b.box(st.wood, (x, -1.62, 2.4), (0.3, 0.3, 4.8), bevel=0.03)
    b.box(st.wood, (0, -1.7, 2.0), (2.8, 0.12, 3.6), bevel=0.02)  # portón
    b.beam(A.IRON, (-1.3, -1.78, 0.6), (1.3, -1.78, 3.4), 0.06)
    A.gable_roof(b, st, 0, 1.4, w, 6.0, 4.8, along_x=True, gable_mat=st.wood)
    for i in range(3 + stage):
        _barrel(b, st, -3.6 + i * 0.75, -2.8)
    for i in range(2 + stage):
        _crate(b, st, 2.0 + (i % 3) * 0.8, -3.2 - (i // 3) * 0.8, rot=i * 9)
    if stage >= 2:
        # polea de carga bajo el hastial
        b.beam(st.wood, (w / 2 - 0.2, 1.4, 6.6), (w / 2 + 1.0, 1.4, 6.6), 0.2)
        b.box(A.IRON, (w / 2 + 0.9, 1.4, 5.8), (0.08, 0.08, 1.6), bevel=0.0, detail=True)
    return b


def hospital(st: A.Style, stage: int) -> Builder:
    b = Builder()
    A.house(b, st, 0.0, 2.4, 9.6, 5.0, 2, seed=61, along_x=True)
    # huerto de hierbas medicinales
    for i in range(2 + stage):
        x = -4.0 + i * 1.7
        b.box(st.wood, (x, -3.0, 0.15), (1.3, 2.6, 0.3), bevel=0.03, grain=True)  # bancal con tablas
        b.box('common.crop', (x, -3.0, 0.36), (1.1, 2.4, 0.2), bevel=0.06)
    _well(b, st, 4.2, -3.2)
    if stage >= 3:
        # capilla con campanil
        b.box(st.stone, (4.0, 2.4, 4.6), (2.2, 2.2, 9.2), bevel=0.06)
        b.cone_roof(st.roof, (4.0, 2.4, 9.2), 1.3, 2.4, segments=4, overhang=0.15)
        b.box(A.IRON, (4.0, 1.25, 7.6), (0.8, 0.1, 1.1), bevel=0.0, detail=True)
    return b


def temple(st: A.Style, stage: int) -> Builder:
    """Templo: capilla → iglesia con campanario → iglesia con ábside y aguja (≤ 11×11)."""
    b = Builder()
    nave_l = 6.0 + stage * 1.2
    nave_w = 4.6 + (stage >= 3) * 0.8
    y0 = 1.0
    b.box(st.stone, (0, y0, 0.3), (nave_w + 0.4, nave_l + 0.4, 0.6), bevel=0.05)
    b.box(st.stone, (0, y0, 2.9), (nave_w, nave_l, 5.8), bevel=0.06)
    # contrafuertes
    for k in range(stage + 1):
        yy = y0 - nave_l / 2 + (k + 0.5) * nave_l / (stage + 1)
        for sx in (-1, 1):
            b.box(st.stone, (sx * (nave_w / 2 + 0.3), yy, 2.2), (0.6, 0.7, 4.4), bevel=0.05, tilt=(0, -sx * 4))
        for sx in (-1, 1):
            o, a, n, L = A._face_frame(0, y0, nave_w, nave_l, 'left' if sx < 0 else 'right')
    for face in ('left', 'right'):
        o, a, n, L = A._face_frame(0, y0, nave_w, nave_l, face)
        for k in range(stage + 1):
            A.window(b, st, o, a, n, -L / 2 + (k + 1) * L / (stage + 2), 2.4, w=0.6, h=2.2, shutters=False)
    A.gable_roof(b, st, 0, y0, nave_w, nave_l, 5.8, along_x=False, gable_mat=st.stone)
    o, a, n, L = A._face_frame(0, y0, nave_w, nave_l, 'front')
    A.door(b, st, o, a, n, 0.0, w=1.5, h=2.8, arch=True)
    # rosetón
    b.cylinder(A.IRON, (0, y0 - nave_l / 2 - 0.02, 7.0), 0.7, 0.06, segments=16, bevel=0.0, axis='Y', detail=True)
    b.cylinder(st.stone, (0, y0 - nave_l / 2 - 0.05, 7.0), 0.85, 0.05, segments=16, bevel=0.0, axis='Y')
    if stage >= 2:
        # campanario adosado al frente
        tw = 2.6
        tx, ty = nave_w / 2 + tw / 2 - 0.2, y0 - nave_l / 2 + tw / 2
        th = 10.0 if stage == 2 else 12.5
        b.box(st.stone, (tx, ty, th / 2), (tw, tw, th), bevel=0.06)
        for face in ('front', 'left', 'right', 'back'):
            fo, fa, fn, fL = A._face_frame(tx, ty, tw, tw, face)
            b.box(A.IRON, (fo[0] + fn[0] * 0.02, fo[1] + fn[1] * 0.02, th - 1.6), (0.7 if face in ('front', 'back') else 0.05, 0.05 if face in ('front', 'back') else 0.7, 1.5), bevel=0.0, detail=True)
        spire = 4.0 if stage == 2 else 6.5
        b.cone_roof(st.roof, (tx, ty, th), tw * 0.72, spire, segments=4 if st.civ == 'corona' else 8, overhang=0.2)
        b.cylinder(A.IRON, (tx, ty, th + spire), 0.05, 1.4, segments=6, bevel=0.0, detail=True)
    if stage >= 3:
        # ábside semicircular
        b.cylinder(st.stone, (0, y0 + nave_l / 2, 0), nave_w / 2 - 0.1, 5.2, segments=14, bevel=0.03)
        b.cone_roof(st.roof, (0, y0 + nave_l / 2, 5.2), nave_w / 2 - 0.1, 2.2, segments=14, overhang=0.25)
    return b


def port(st: A.Style, stage: int) -> Builder:
    """Puerto (parcela costera; el frente −Y mira al mar): muelle sobre pilotes, almacén y grúa."""
    b = Builder()
    pier_l = 8.0 + stage * 1.5
    y_shore = 3.5
    # explanada de piedra en la orilla
    b.box(st.stone, (0, y_shore + 2.0, 0.35), (13.0, 4.0, 0.7), bevel=0.06)
    # muelle de tablazón sobre pilotes que se adentra en el agua (−Y)
    yc = y_shore - pier_l / 2
    b.box(st.wood, (0, yc, 0.95), (3.4, pier_l, 0.22), bevel=0.02, grain=True)
    n = int(pier_l // 2.0) + 1
    for i in range(n):
        y = y_shore - i * 2.0
        for sx in (-1.55, 1.55):
            b.cylinder(st.wood, (sx, y, -2.5), 0.17, 3.6, segments=8, bevel=0.0)
    for i in range(3):
        b.cylinder(st.wood, (1.5 * (1 if i % 2 else -1), y_shore - 2.5 - i * 2.8, 1.0), 0.12, 0.55, segments=8, bevel=0.0, detail=True)  # bolardos
    # almacén portuario
    A.house(b, st, -3.8, y_shore + 2.6, 5.0, 3.6, 1 if stage == 1 else 2, seed=71, along_x=True)
    for i in range(2 + stage):
        _barrel(b, st, 1.2 + (i % 3) * 0.75, y_shore + 0.9 + (i // 3) * 0.75, 0.7)
    _crate(b, st, 3.6, y_shore + 1.2, 0.7, 0.8, 12)
    if stage >= 2:
        # grúa de puerto de madera
        b.box(st.wood, (2.8, y_shore - 1.2, 3.2), (0.4, 0.4, 4.6), bevel=0.03, grain=True)
        b.beam(st.wood, (2.8, y_shore - 1.2, 5.3), (0.3, y_shore - 3.4, 5.0), 0.2)
        b.beam(st.wood, (2.8, y_shore - 1.2, 1.2), (2.8, y_shore - 3.2, 1.0), 0.16)
        b.cylinder(st.wood, (2.8, y_shore - 0.9, 2.0), 0.55, 0.6, segments=12, axis='Y', detail=True)
        b.box(A.IRON, (0.3, y_shore - 3.4, 4.0), (0.05, 0.05, 2.0), bevel=0.0, detail=True)
    if stage >= 3:
        # segundo espigón en L
        b.box(st.wood, (-3.0, y_shore - pier_l + 1.2, 0.95), (6.0, 2.4, 0.22), bevel=0.02, grain=True)
        for x in (-5.6, -3.6, -1.6):
            b.cylinder(st.wood, (x, y_shore - pier_l + 1.2, -2.5), 0.17, 3.6, segments=8, bevel=0.0)
        A.banner_pole(b, st, 0.0, y_shore - pier_l + 0.4, 1.06, 4.0)
    return b


def imperial_bastion(st: A.Style, stage: int) -> Builder:
    """Bastión Imperial (Corona): baluarte poligonal ataludado con garitas."""
    b = Builder()
    h = 4.5 + stage * 1.2
    b.cylinder(st.stone, (0, 0.8, 0), 5.0, h, segments=8, bevel=0.06, radius_top=4.4)
    b.cylinder(st.stone, (0, 0.8, h), 4.6, 0.5, segments=8, bevel=0.04)
    for k in range(8):
        ang = 2 * math.pi * (k + 0.5) / 8
        b.box(st.stone, (math.cos(ang) * 4.2, 0.8 + math.sin(ang) * 4.2, h + 0.95), (1.4, 0.6, 0.9), rot_z=math.degrees(ang) + 90, bevel=0.04)
    for k in range(0, 8, 2):
        ang = 2 * math.pi * k / 8
        A.round_tower(b, st, math.cos(ang) * 4.9, 0.8 + math.sin(ang) * 4.9, 0.7, h + 2.4, crenel=False, roof=True, segments=8)
    o, a, n, L = A._face_frame(0, 0.8, 8.8, 8.8, 'front')
    A.door(b, st, o, a, n, 0.0, w=1.6, h=2.8, arch=True)
    A.banner_pole(b, st, 0, 0.8, h + 0.5, 4.0)
    return b


def naval_arsenal(st: A.Style, stage: int) -> Builder:
    """Arsenal Naval (Liga): grada con casco en construcción bajo cobertizo."""
    b = Builder()
    # grada inclinada
    b.box(st.stone, (0, 0, 0.25), (5.0, 10.0, 0.5), bevel=0.05)
    # costillar del casco
    ribs = 5 + stage
    for i in range(ribs):
        y = -3.5 + i * 7.0 / (ribs - 1)
        half = 1.6 * math.sin(math.pi * (i + 0.6) / (ribs + 0.2))
        b.beam(st.wood, (-half, y, 2.4), (0, y, 0.6), 0.16)
        b.beam(st.wood, (half, y, 2.4), (0, y, 0.6), 0.16)
    b.beam(st.wood, (0, -4.6, 0.6), (0, 4.4, 0.6), 0.3)  # quilla
    b.beam(st.wood, (0, 4.4, 0.6), (0, 5.2, 3.2), 0.24)  # roda
    # cobertizo
    for x in (-2.8, 2.8):
        for y in (-4.5, 0.0, 4.5):
            b.box(st.wood, (x, y, 2.6), (0.3, 0.3, 5.2), bevel=0.03, grain=True)
    b.gable_roof(st.roof, (0, 0, 5.2), 6.2, 10.0, 2.4, overhang=0.35, thickness=0.16, ridge_along_x=False)
    for i in range(stage + 2):
        b.box(st.wood, (-4.2, -3.0 + i * 0.5, 0.1 + (i % 2) * 0.16), (1.2, 4.0, 0.14), bevel=0.01, grain=True)
    return b


GENERATORS = {
    'city_hall': city_hall,
    'farm': farm,
    'sawmill': sawmill,
    'quarry': quarry,
    'mine': mine,
    'warehouse': warehouse,
    'barracks': barracks,
    'hospital': hospital,
    'temple': temple,
    'port': port,
    'imperial_bastion': imperial_bastion,
    'naval_arsenal': naval_arsenal,
}
