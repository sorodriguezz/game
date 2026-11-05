"""Vegetación y rocas para instanciar en ciudad, mapa y arena (Art Bible §7).

Árboles: roble (caducifolio), pino y abedul, cada uno en 2–3 variantes sembradas.
Copas como racimos de volúmenes desplazados (sin tarjetas alfa: robusto en WebGL y barato).
"""

from __future__ import annotations

import math
import random

from reinos_assets.geo import Builder


def _trunk(b: Builder, h: float, r: float, seed: int, lean: float = 0.0) -> None:
    b.cylinder('common.bark', (0, 0, -0.2), r, h + 0.2, segments=8, bevel=0.0, radius_top=r * 0.55)
    rng = random.Random(seed)
    for k in range(3):  # raíces que entran en el suelo
        a = 2 * math.pi * k / 3 + rng.uniform(-0.3, 0.3)
        b.beam('common.bark', (0, 0, 0.6), (math.cos(a) * r * 2.2, math.sin(a) * r * 2.2, -0.15), r * 0.55)


def oak(variant: int) -> Builder:
    rng = random.Random(1000 + variant)
    b = Builder()
    h = 3.2 + variant * 0.5
    _trunk(b, h, 0.32 + variant * 0.04, variant)
    for k in range(3):
        a = 2 * math.pi * k / 3 + rng.uniform(-0.4, 0.4)
        b.beam('common.bark', (0, 0, h * 0.7), (math.cos(a) * 1.6, math.sin(a) * 1.6, h + 1.2), 0.16)
    clumps = 6 + variant
    for k in range(clumps):
        a = 2 * math.pi * k / clumps + rng.uniform(-0.3, 0.3)
        d = rng.uniform(1.0, 2.2)
        s = rng.uniform(2.6, 3.6)
        b.blob('common.foliage', (math.cos(a) * d, math.sin(a) * d, h - 0.2 + rng.uniform(0, 1.6)), (s, s, s * 0.8), seed=variant * 50 + k)
    b.blob('common.foliage', (0, 0, h + 1.0), (3.8, 3.8, 3.2), seed=variant * 50 + 99)
    return b


def pine(variant: int) -> Builder:
    rng = random.Random(2000 + variant)
    b = Builder()
    h = 9.0 + variant * 1.5
    _trunk(b, h * 0.85, 0.28, variant + 10)
    tiers = 5 + variant
    for k in range(tiers):
        t = k / tiers
        r = (1.0 - t) * 2.3 + 0.5
        z = 1.8 + t * (h - 2.6)
        b.blob('common.foliage_pine', (rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), z), (r * 2, r * 2, 2.6), seed=variant * 40 + k, shape='cone', jitter=0.12)
    return b


def birch(variant: int) -> Builder:
    rng = random.Random(3000 + variant)
    b = Builder()
    h = 5.5 + variant * 0.8
    _trunk(b, h, 0.18, variant + 20)
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-0.4, 0.4)
        d = rng.uniform(0.4, 1.2)
        s = rng.uniform(1.6, 2.3)
        b.blob('common.foliage', (math.cos(a) * d, math.sin(a) * d, h * 0.55 + rng.uniform(0, h * 0.4)), (s, s, s * 1.3), seed=variant * 30 + k)
    return b


def bush(variant: int) -> Builder:
    rng = random.Random(4000 + variant)
    b = Builder()
    for k in range(3 + variant):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0.0, 0.7)
        s = rng.uniform(0.9, 1.5)
        b.blob('common.foliage', (math.cos(a) * d, math.sin(a) * d, -0.15), (s, s, s * 0.75), seed=variant * 20 + k)
    return b


def rock(variant: int) -> Builder:
    rng = random.Random(5000 + variant)
    b = Builder()
    s = 1.4 + variant * 0.6
    b.rock('common.rough_stone', (0, 0, 0), (s * 1.3, s, s * 0.8), seed=variant * 7)
    for k in range(variant + 1):
        a = rng.uniform(0, 2 * math.pi)
        b.rock('common.rough_stone', (math.cos(a) * s * 0.7, math.sin(a) * s * 0.7, 0), (s * 0.5, s * 0.45, s * 0.4), seed=variant * 7 + k + 1)
    return b


NATURE = {
    'tree_oak': (oak, 3),
    'tree_pine': (pine, 2),
    'tree_birch': (birch, 2),
    'bush': (bush, 2),
    'rock': (rock, 3),
}
