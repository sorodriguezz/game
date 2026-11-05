"""Unidades a pie (F1.1 / F3): cuerpo humanoide común + equipo por tipo + clips compartidos."""

from __future__ import annotations

import math

from reinos_assets import character as C
from reinos_assets.geo import Builder

IRON = 'common.iron'
WOOD = 'common.bark'  # astiles: madera natural con veta longitudinal


def _kettle_helmet(b: Builder) -> None:
    b.blob(IRON, (0, 0.0, 1.6), (0.235, 0.255, 0.2), seed=7, jitter=0.01)  # cúpula
    b.cylinder(IRON, (0, 0, 1.63), 0.2, 0.025, segments=14, bevel=0.0, radius_top=0.2)  # ala
    b.cylinder(IRON, (0, 0, 1.6), 0.25, 0.03, segments=14, bevel=0.0, radius_top=0.21)


def _shield(b: Builder, face: str) -> None:
    # escudo redondo en el antebrazo izquierdo, mirando hacia fuera-adelante
    b.cylinder(face, (0.36, -0.1, 1.02), 0.38, 0.04, segments=16, bevel=0.0, axis='X')
    b.cylinder(IRON, (0.4, -0.1, 1.02), 0.07, 0.05, segments=10, bevel=0.0, axis='X')  # umbo
    b.cylinder(IRON, (0.355, -0.1, 1.02), 0.39, 0.02, segments=16, bevel=0.0, axis='X')  # canto


def _spear(b: Builder) -> None:
    b.tube(WOOD, (-0.26, 0.55, 0.05), (-0.26, -0.75, 2.55), 0.022, 0.018, segments=6)
    b.tube(IRON, (-0.26, -0.75, 2.55), (-0.26, -0.83, 2.72), 0.03, 0.002, segments=6)


def spearman(civ: str) -> C.Body:
    body = C.humanoid('common.gambeson', f'{civ}.cloth')
    body.part('head', _kettle_helmet)
    body.part('forearm.L', lambda b: _shield(b, f'{civ}.cloth'))
    body.part('hand.R', _spear)
    return body


# clips compartidos (todas las unidades a pie)
def clips() -> dict[str, list]:
    stance: C.Pose = {'upper_arm.L': (-20, 0, 8), 'forearm.L': (-55, 0, 0), 'upper_arm.R': (-10, 0, -6), 'forearm.R': (-40, 0, 0)}
    idle = [
        (1, {**stance, 'chest': (0, 0, 0)}, (0, 0, 0)),
        (31, {**stance, 'chest': (2.5, 0, 0), 'head': (-2, 4, 0)}, (0, -0.005, 0)),
        (61, {**stance, 'chest': (0, 0, 0)}, (0, 0, 0)),
    ]
    walk = [(f, {**stance, **p}, r) for f, p, r in C.walk_cycle(26, 4, 14, 0.03, 30)]
    run = [(f, {**stance, **p}, r) for f, p, r in C.walk_cycle(40, 12, 22, 0.06, 20)]
    attack = [
        (1, stance, (0, 0, 0)),
        (8, {**stance, 'upper_arm.R': (25, 0, -10), 'forearm.R': (-70, 0, 0), 'chest': (0, 0, -12)}, (0, 0, 0)),
        (13, {**stance, 'upper_arm.R': (-70, 0, -4), 'forearm.R': (-5, 0, 0), 'chest': (8, 0, 14), 'thigh.R': (-20, 0, 0), 'thigh.L': (15, 0, 0)}, (0, -0.04, 0)),
        (24, stance, (0, 0, 0)),
    ]
    hit = [
        (1, stance, (0, 0, 0)),
        (5, {**stance, 'chest': (-14, 0, 6), 'head': (-12, 0, 0), 'spine': (-6, 0, 0)}, (0, 0, 0)),
        (14, stance, (0, 0, 0)),
    ]
    death = [
        (1, stance, (0, 0, 0)),
        (10, {**stance, 'hips': (-25, 0, 0), 'thigh.L': (30, 0, 0), 'thigh.R': (20, 0, 0), 'shin.L': (-40, 0, 0), 'head': (-15, 0, 0)}, (0, -0.2, 0)),
        (22, {'hips': (-82, 0, 6), 'thigh.L': (20, 0, 0), 'upper_arm.L': (-40, 0, 40), 'upper_arm.R': (-30, 0, -50), 'head': (-10, 15, 0)}, (0, -0.78, 0)),
        (30, {'hips': (-88, 0, 6), 'thigh.L': (12, 0, 0), 'upper_arm.L': (-45, 0, 45), 'upper_arm.R': (-35, 0, -55), 'head': (-5, 20, 0)}, (0, -0.84, 0)),
    ]
    return {'idle': idle, 'walk': walk, 'run': run, 'attack_melee': attack, 'hit': hit, 'death': death}


UNITS = {'unit_spearman': spearman}
