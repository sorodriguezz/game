"""Piezas modulares de muralla (Art Bible §3): el cliente las coloca en anillo.

Convención: tramo centrado en el origen a lo largo de X (14,6 m), cara exterior hacia −Y
(en el anillo, −Y de Blender = hacia fuera de la ciudad). Etapas: 1 muro bajo con
adarve, 2 muro con almenas, 3 muro alto con almenas, matacanes y torres con chapitel.
La empalizada (`palisade`) se usa cuando no hay muralla construida.
"""

from __future__ import annotations

import math

from reinos_assets import arch as A
from reinos_assets.geo import Builder

SEG_LEN = 14.6
HEIGHT = {1: 4.2, 2: 5.6, 3: 7.0}
THICK = {1: 2.0, 2: 2.4, 3: 2.6}


def segment(st: A.Style, stage: int) -> Builder:
    b = Builder()
    h, t = HEIGHT[stage], THICK[stage]
    # zarpa ataludada + lienzo
    b.box(st.stone, (0, 0, 0.5), (SEG_LEN, t + 0.7, 1.0), bevel=0.08)
    b.box(st.stone, (0, 0, h / 2), (SEG_LEN, t, h), bevel=0.06)
    # adarve (camino de ronda) y parapeto exterior almenado
    b.box(st.wood if stage == 1 else st.stone, (0, 0.1, h + 0.08), (SEG_LEN, t - 0.4, 0.16), bevel=0.02)
    b.box(st.stone, (0, -(t / 2 - 0.25), h + 0.5), (SEG_LEN, 0.5, 1.0), bevel=0.04)
    if stage >= 2:
        n = 8
        for i in range(n):
            x = -SEG_LEN / 2 + (i + 0.5) * SEG_LEN / n
            b.box(st.stone, (x, -(t / 2 - 0.25), h + 1.45), (0.95, 0.5, 0.9), bevel=0.04)
            if stage >= 3 and i % 2 == 0:
                b.box(A.IRON, (x, -(t / 2 + 0.01), h * 0.55), (0.14, 0.05, 1.1), bevel=0.0, detail=True)
    # parapeto interior bajo
    b.box(st.stone, (0, t / 2 - 0.2, h + 0.35), (SEG_LEN, 0.4, 0.7), bevel=0.03)
    if stage >= 3:
        # matacanes: ménsulas bajo el parapeto exterior
        for i in range(10):
            x = -SEG_LEN / 2 + (i + 0.5) * SEG_LEN / 10
            b.box(st.stone, (x, -(t / 2 + 0.25), h - 0.35), (0.35, 0.5, 0.7), bevel=0.03)
        b.box(st.stone, (0, -(t / 2 + 0.35), h + 0.05), (SEG_LEN, 0.7, 0.3), bevel=0.03)
    return b


def tower(st: A.Style, stage: int) -> Builder:
    b = Builder()
    h = HEIGHT[stage] + 2.4
    A.round_tower(b, st, 0, 0, 2.3 if stage < 3 else 2.6, h, crenel=True, roof=stage >= 2, segments=14)
    return b


def gate(st: A.Style, stage: int) -> Builder:
    """Puerta fortificada: dos torres, arco con rastrillo y puente de paso."""
    b = Builder()
    h = HEIGHT[stage] + 2.0
    for sx in (-1, 1):
        A.round_tower(b, st, sx * 4.2, 0.0, 2.4, h + 1.5, crenel=True, roof=stage >= 2, segments=14)
    b.box(st.stone, (0, 0, h - 1.0), (6.0, 3.6, 2.4), bevel=0.06)  # cuerpo sobre el arco
    A.crenellated_top(b, st, 0, 0, 6.0, 3.6, h + 0.2)
    for sx in (-1, 1):
        b.box(st.stone, (sx * 2.2, 0, (h - 2.2) / 2), (1.6, 3.6, h - 2.2), bevel=0.06)
    b.box(st.wood, (0, -1.5, (h - 2.2) / 2), (2.8, 0.18, h - 2.2), bevel=0.02, grain=True)  # portón
    for k in range(5):
        b.box(A.IRON, (-1.2 + k * 0.6, -1.62, (h - 2.2) / 2), (0.06, 0.05, h - 2.3), bevel=0.0, detail=True)  # rastrillo
    A.banner_pole(b, st, 0, 0, h + 1.1, 3.0)
    return b


def palisade(st: A.Style, stage: int) -> Builder:
    """Empalizada de troncos aguzados con riostras (sin muralla construida)."""
    b = Builder()
    n = 26
    for i in range(n):
        x = -SEG_LEN / 2 + (i + 0.5) * SEG_LEN / n
        h = 2.6 + ((i * 7919) % 5) * 0.08
        b.cylinder(st.wood, (x, 0, -0.3), 0.22, h + 0.3, segments=7, bevel=0.0)
        b.cylinder(st.wood, (x, 0, h), 0.22, 0.45, segments=7, bevel=0.0, radius_top=0.02)
    for z in (0.9, 2.0):
        b.beam(st.wood, (-SEG_LEN / 2, 0.25, z), (SEG_LEN / 2, 0.25, z), 0.14)
    return b


WALL_PIECES = {'wall_segment': segment, 'wall_tower': tower, 'wall_gate': gate, 'palisade': palisade}
