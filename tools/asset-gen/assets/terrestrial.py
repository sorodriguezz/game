"""Original medieval assets for the terrestrial ruleset.

Shared material library, meters, base pivot and three growing visual stages.
Generated geometry is original project work; no external game models/textures.
"""

from __future__ import annotations

import math

from reinos_assets import arch as A
from reinos_assets.geo import Builder
from assets.buildings import _barrel, _cart, _crate, _fence, _weapon_rack


def _base(b: Builder, st: A.Style, size: float = 10.6) -> None:
    b.box(st.stone, (0, 0, 0.10), (size, size, 0.20), bevel=0.08)


def _shed(b: Builder, st: A.Style, x: float, y: float, w: float, d: float, h: float = 3.4) -> None:
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(st.wood, (x + sx * (w / 2 - .2), y + sy * (d / 2 - .2), h / 2), (.26, .26, h), grain=True)
    b.gable_roof(st.roof, (x, y, h), w, d, d * .43, overhang=.25)
    for sx in (-1, 1):
        b.beam(st.wood, (x + sx * (w / 2 - .2), y, h - 1.1), (x + sx * (w / 2 - 1.0), y, h), .16)


def _banner(b: Builder, st: A.Style, x: float, y: float, z: float, h: float) -> None:
    # Broad team pennant remains in the distance LODs as a silhouette landmark.
    b.cylinder(st.wood, (x, y, z), .07, h, segments=8, bevel=0)
    b.box(st.cloth, (x + .65, y, z + h - .55), (1.3, .04, .9), bevel=0)


def lumber_mill(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    _shed(b, st, 0, 1.7, 9, 5, 3.7)
    # Trestle saw bench, iron saw wheel, stacks of logs and finished boards.
    b.box(st.wood, (0, 1.2, 1.15), (6.8, 1.3, .22), grain=True)
    for x in (-2.7, 0, 2.7):
        for y in (.75, 1.65):
            b.box(st.wood, (x, y, .57), (.2, .2, 1.14))
    b.cylinder(A.IRON, (.4, .9, 1.3), .85, .08, segments=24, axis='Y', bevel=0)
    for i in range(12):
        a = i * math.pi / 6
        b.box(A.IRON, (.4 + math.cos(a) * .82, .86, 1.3 + math.sin(a) * .82), (.22, .08, .18), bevel=0, tilt=(0, -math.degrees(a)), detail=True)
    for i in range(3 + stage):
        b.cylinder(st.wood, (-3.5 + (i % 3) * .65, -1.3, .52 + (i // 3) * .53), .3, 3.4, segments=10, axis='Y', bevel=0)
    for i in range(2 + stage):
        b.box(st.wood, (2.8, -2.6, .3 + i * .19), (3.3, 2, .17), grain=True)
    if stage >= 2:
        b.box(st.wood, (-3.8, 2.1, 2.0), (.28, .28, 4))
        b.beam(st.wood, (-3.8, 2.1, 3.7), (-3.8, -1.6, 3.7), .22)
        b.tube(A.IRON, (-3.8, -1.5, 3.7), (-3.8, -1.5, 1.2), .025, .025, segments=6)
        _cart(b, st, 3.4, -.5)
    if stage >= 3:
        A.house(b, st, 0, 2.8, 4.8, 3.4, 2, seed=311, windows_ground=False, chimney_on=False)
    return b


def brickyard(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    # Kiln with dark arched mouth, square flue and tiers of drying bricks.
    b.cylinder(st.roof, (-1.8, 1.8, .2), 2.35, 2.8, segments=20, radius_top=1.9)
    b.cone_roof(st.roof, (-1.8, 1.8, 3), 1.9, 1.1, segments=20, overhang=.1)
    b.box(A.IRON, (-1.8, -.48, 1.15), (1.5, .09, 1.6), bevel=.2)
    A.chimney(b, st, -1.8, 1.8, 3.6, 6.7 + stage * .5)
    _shed(b, st, 3, 1.5, 3, 4, 3)
    for row in range(3 + stage):
        for col in range(5):
            for tier in range(1 + (row % 2)):
                b.box(st.roof, (-3.9 + col * .8, -1.6 - row * .61, .36 + tier * .3), (.68, .48, .28), bevel=.025)
    if stage >= 2:
        b.cylinder(st.wood, (3.3, -2, .2), 1.0, .9, segments=12, radius_top=1.1)
        b.box(st.roof, (3.3, -2, 1.06), (1.4, 1.4, .12), bevel=.1)
    if stage >= 3:
        _shed(b, st, -.2, -2.8, 4.5, 3.7, 3.1)
    return b


def iron_foundry(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    A.house(b, st, -.9, 1, 6.4, 6, 1, seed=410, chimney_on=False, windows_ground=False)
    for i in range(stage):
        x = -3.2 + i * 2.0
        b.cylinder(st.stone, (x, 2.0, .2), .8, 8.3 + i * .7, segments=12, radius_top=.64)
        b.cylinder(A.IRON, (x, 2.0, 7.6 + i * .7), .87, .32, segments=12)
        b.box(A.IRON, (x, -2.1, 1.15), (1, .1, 1.6), bevel=.08)
    # Open forge shelter, anvil and charcoal/ingot storage.
    _shed(b, st, 3.4, .2, 2.6, 4.4, 3.1)
    b.box(A.IRON, (3.4, -.5, .65), (.65, .6, .9))
    b.box(A.IRON, (3.4, -.5, 1.2), (1.5, .45, .25), bevel=.08)
    for i in range(5 + stage):
        b.box(A.IRON, (-3.5 + (i % 5) * .85, -3.7, .35 + (i // 5) * .25), (.65, .95, .23), bevel=.04)
    if stage >= 2:
        _crate(b, st, 3.7, -3.6, .2, s=.9)
        b.box(st.wood, (0, -2.6, .9), (1.8, 1.0, 1.4), bevel=.08)
    if stage >= 3:
        b.box(st.stone, (0, -4.6, .8), (8.4, .5, 1.2))
    return b


def grain_mill(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    h = 6.2 + stage * .6
    b.cylinder(st.stone, (0, 1.1, .2), 2.1, h, segments=20, radius_top=1.65)
    b.cone_roof(st.roof, (0, 1.1, h + .2), 1.75, 2.4, segments=20)
    A.door(b, st, (0, -1.0), (1, 0), (0, -1), 0, z=.2)
    # Four visibly broad wooden sails, hub and supporting spars.
    hz = h - .9
    b.cylinder(st.wood, (0, -1.0, hz), .36, 1.2, segments=12, axis='Y')
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        ux, uz = math.cos(ang), math.sin(ang)
        b.beam(st.wood, (ux * .15, -2.1, hz + uz * .15), (ux * 3.7, -2.1, hz + uz * 3.7), .18)
        for j in range(6):
            d = 1.2 + j * .4
            x, z = ux * d, hz + uz * d
            b.beam(st.wood, (x, -2.1, z), (x - uz * .85, -2.1, z + ux * .85), .17)
    if stage >= 2:
        A.house(b, st, 3.1, 2.4, 2.5, 3.2, 1, seed=450, chimney_on=False, windows_ground=False)
    for i in range(2 + stage):
        b.cylinder(st.plaster, (-3.7 + (i % 2) * .75, -3.5 + (i // 2) * .7, .2), .3, .8, segments=10, radius_top=.19)
    if stage >= 3:
        _cart(b, st, 3.4, -2.2)
        b.box(st.wood, (3.1, 2.4, 3.9), (2.8, 3.4, 1.0), bevel=.04)
        A.gable_roof(b, st, 3.1, 2.4, 2.8, 3.4, 4.4, along_x=False)
    return b


def bakery(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    A.house(b, st, -.9, 1.3, 6.1, 5.2, 1 if stage < 3 else 2, seed=510, chimney_on=True, windows_ground=False)
    # Exterior bread oven and serving counter below timber canopy.
    b.cylinder(st.stone, (3.2, 1.5, .2), 1.35, 1.1, segments=16)
    b.cone_roof(st.roof, (3.2, 1.5, 1.3), 1.35, 1.4, segments=16, overhang=0)
    b.box(A.IRON, (3.2, .17, .95), (.75, .06, .7), bevel=.2)
    A.chimney(b, st, 3.2, 1.5, 2.2, 5.0)
    _shed(b, st, -.6, -2.5, 4.5 if stage == 1 else 6.3, 2.0, 2.6)
    b.box(st.wood, (-.6, -3.0, .9), (4.8, .8, .18), grain=True)
    for x in (-2.5, 1.3):
        b.box(st.wood, (x, -3, .45), (.2, .5, .9))
    for i in range(4 + stage):
        b.cylinder('common.crop', (-2.4 + i * .62, -3.0, 1.0), .21, .22, segments=8, radius_top=.13, detail=True)
    if stage >= 2:
        _barrel(b, st, -4.3, -1.4, .2)
        _barrel(b, st, -4.3, -.5, .2)
    return b


def castle(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st, 14.0)
    h = 7.4 + stage * 1.6
    b.box(st.stone, (0, 1, h / 2), (7.0, 6.6, h), bevel=.09)
    A.crenellated_top(b, st, 0, 1, 7.4, 7, h)
    A.door(b, st, (0, -2.3), (1, 0), (0, -1), 0, w=1.8, h=3.1, arch=True)
    for x in (-3.5, 3.5):
        for y in (-2.3, 4.3):
            A.round_tower(b, st, x, y, 1.3, h + 1.5, segments=14)
    for z in (4.2, 7.2) if stage > 1 else (4.2,):
        for x in (-1.8, 1.8):
            A.window(b, st, (0, -2.3), (1, 0), (0, -1), x, z, shutters=False)
    _banner(b, st, 0, 1, h + .2, 3.3)
    if stage >= 2:
        for x in (-5.4, 5.4):
            b.box(st.stone, (x, -.7, 2.0), (.8, 10, 4), bevel=.06)
        b.box(st.stone, (0, -5.5, 1.6), (10.8, .8, 3.2), bevel=.06)
        A.door(b, st, (0, -5.9), (1, 0), (0, -1), 0, w=2.2, h=2.4)
    if stage >= 3:
        for x in (-5.4, 5.4):
            A.round_tower(b, st, x, -5.4, 1.3, 6.8, roof=False, crenel=True, segments=14)
    return b


def rally_point(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    b.cylinder(st.stone, (0, 0, .2), 2.3, .35, segments=24)
    b.cylinder(st.stone, (0, 0, .55), 1.7, .25, segments=24)
    b.box(st.wood, (0, 0, 1.22), (2.5, 1.7, .22), grain=True)
    for x in (-.9, .9):
        b.box(st.wood, (x, 0, .9), (.22, 1, .7))
    b.box(st.plaster, (0, 0, 1.35), (1.8, 1.1, .04), bevel=0)
    for i in range(3):
        _banner(b, st, -3.4 + i * 3.4, 3.8, .2, 4.6 + stage * .6)
    _weapon_rack(b, st, -3.7, -.4, 90)
    if stage >= 2:
        for x in (-3.4, 3.4):
            b.box(st.wood, (x, -3.5, .7), (2.4, .5, .15), grain=True)
            for dx in (-.9, .9):
                b.box(st.wood, (x + dx, -3.5, .4), (.17, .35, .6))
    if stage >= 3:
        _shed(b, st, 0, 1.2, 6.2, 4.2, 4.0)
    return b


def watchtower(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st, 7.8)
    A.round_tower(b, st, 0, 0, 1.6, 5.2 + stage, crenel=True, roof=stage >= 2, segments=16)
    A.door(b, st, (0, -1.6), (1, 0), (0, -1), 0, w=1.0)
    if stage >= 2:
        for x in (-2.7, 2.7):
            b.box(st.stone, (x, 0, 2.0), (.7, 3, 4), bevel=.05)
    if stage >= 3:
        _banner(b, st, 3.0, 0, .2, 5.0)
    return b


def war_camp(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    for x in (-2.7, 2.7):
        # Canvas roofs reach the floor, closed gables carry the tent outline.
        b.gable_roof(st.cloth, (x, 1.6, .3), 3.4, 4.4, 2.5, overhang=0, thickness=.05, ridge_along_x=False)
        for y in (-.6, 3.8):
            b.gable_wall(st.cloth, (x, y, .3), 3.4, 2.5, .06)
        b.box(st.wood, (x, -.6, 1.4), (.10, .10, 2.8), grain=True)
        b.box(A.IRON, (x, -.66, 1.05), (.55, .04, 1.5), bevel=.1)
    _weapon_rack(b, st, -3.2, -3.4)
    _banner(b, st, 0, 4.3, .2, 4.0 + stage * .5)
    if stage >= 2:
        _fence(b, st, -5, -5, -5, 5)
        _fence(b, st, 5, -5, 5, 5)
        _crate(b, st, 3, -3.4, .2, .9)
    if stage >= 3:
        b.gable_roof(st.cloth, (0, -2.5, .3), 3.2, 3.2, 2.8, overhang=0, ridge_along_x=False)
        for y in (-4.1, -.9):
            b.gable_wall(st.cloth, (0, y, .3), 3.2, 2.8, .06)
    return b


def trapper(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    A.house(b, st, 0, 2.5, 6, 3.6, 1, seed=660, windows_ground=False, chimney_on=False)
    # Visible cages, timber bars and trigger plates distinguish the workshop.
    for i in range(stage + 1):
        x, y = -3.0 + i * 2.0, -2.1
        b.box(st.wood, (x, y, .32), (1.7, 2, .22))
        b.box(st.wood, (x, y, 2.15), (1.7, 2, .17))
        for sx in (-.75, .75):
            for j in range(4):
                b.box(st.wood, (x + sx, y - .8 + j * .53, 1.2), (.1, .1, 1.8))
        for j in range(4):
            b.box(st.wood, (x - .65 + j * .43, y - .9, 1.2), (.1, .1, 1.8))
        b.box(A.IRON, (x, y - 1.05, .27), (.8, .8, .12), bevel=.04)
    if stage >= 2:
        _fence(b, st, -4.7, -4.6, 4.7, -4.6)
    if stage >= 3:
        _shed(b, st, 0, -1.8, 8.4, 3.6, 3.2)
    return b


def clay_pit(st: A.Style, stage: int) -> Builder:
    b = Builder()
    # A low earthen platform with descending extraction benches: the empty
    # centre is the pit, not a pile of grey quarry stones.
    clay = 'common.clay'
    b.box('common.dirt', (0, 0, .08), (10.6, 10.6, .16), bevel=.1)
    b.box(clay, (-.9, -.8, .19), (6.8, 6.8, .22), bevel=.12)
    for tier in range(3):
        h = .35 + tier * .34
        left = -4.4 + tier * .42
        right = 2.5 - tier * .42
        back = 2.7 - tier * .36
        b.box(clay, (left, -.4, h / 2 + .2), (.6, 6.1 - tier * .7, h), bevel=.14)
        b.box(clay, (right, -.4, h / 2 + .2), (.6, 6.1 - tier * .7, h), bevel=.14)
        b.box(clay, ((left + right) / 2, back, h / 2 + .2), (right - left, .6, h), bevel=.14)
    # Rough clay banks are brown-red organic masses, with shovel work along
    # the front slope and a shelter storing cut blocks for the brickyard.
    for i in range(3 + stage):
        b.rock(clay, (-4.0 + i * 1.1, 3.6, .25), (1.6, 1.5, 1.2 + (i % 2) * .4), seed=720+i)
    _shed(b, st, 3.8, 1.3, 2.4, 4.2, 2.6)
    _cart(b, st, 3.7, -3.4, rot=10)
    # Shovel: iron blade, shaft against a timber support.
    b.beam(st.wood, (-1.9, -3.5, .3), (-1.9, -3.0, 2.1), .08)
    b.box(A.IRON, (-1.9, -3.5, .35), (.38, .12, .55), bevel=.1)
    for i in range(stage + 1):
        b.box(clay, (3.7, .3 + i * .7, .4), (1.4, .55, .45), bevel=.12)
    if stage >= 2:
        b.box(st.wood, (-1, -.3, .55), (3.0, .7, .16), rot_z=-20, grain=True)
        for x in (-2.1, .1):
            b.box(st.wood, (x, -.3, .3), (.16, .5, .6))
    if stage >= 3:
        _shed(b, st, -1.0, 3.7, 6.2, 2.2, 3.2)
    return b


def _horse(b: Builder, st: A.Style, x: float, y: float) -> None:
    """Unrigged standing horse prop in anatomical proportions, facing +X."""
    coat = 'common.leather'
    # Barrel, chest, rump, sloping neck, elongated head and muzzle.
    b.blob(coat, (x, y, 1.0), (2.1, .66, .86), seed=800, jitter=.035)
    b.blob(coat, (x-.75, y, .88), (.9, .7, 1.05), seed=801, jitter=.03)
    b.tube(coat, (x+.65, y, 1.5), (x+1.0, y, 2.03), .32, .22, segments=10)
    b.blob(coat, (x+1.0, y, 1.88), (.65, .34, .48), seed=802, jitter=.025)
    b.blob(coat, (x+1.35, y, 1.85), (.52, .3, .31), seed=803, jitter=.02)
    for fx in (-.7, .65):
        for sy in (-.23, .23):
            b.tube(coat, (x+fx, y+sy, .15), (x+fx-.1, y+sy, 1.14), .07, .11, segments=8)
            b.box(A.IRON, (x+fx+.015, y+sy, .12), (.22, .18, .24), bevel=.035)
    for sy in (-.12, .12):
        b.tube(coat, (x+1.0, y+sy, 2.2), (x+.94, y+sy, 2.47), .065, .025, segments=6)
        b.box(A.IRON, (x+1.19, y+sy*1.45, 2.15), (.045, .035, .045), bevel=.005, detail=True)
    b.tube(st.wood, (x-.95, y, 1.6), (x-1.3, y, .45), .11, .06, segments=8)
    b.beam(st.wood, (x+.67, y, 1.65), (x+.97, y, 2.16), .1)


def stable(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    w, d, cy = 8.7, 4.6, 2.1
    # Three stall doors, half-height stone foundation and timber hay loft.
    b.box(st.stone, (0, cy, .45), (w, d, .9), bevel=.05)
    b.box(st.wood, (0, cy, 2.0), (w-.1, d-.1, 2.5), bevel=.04, grain=True)
    for x in (-2.8, 0, 2.8):
        b.box(st.wood, (x, -.22, 1.45), (2.25, .08, 2.0), bevel=.03)
        b.beam(st.wood, (x-1.0, -.3, .6), (x+1.0, -.3, 2.2), .13)
        for sx in (-1.12, 1.12):
            b.box(st.wood, (x+sx, -.32, 1.5), (.15, .14, 2.6))
    roof_z = 3.4
    if stage >= 3:
        b.box(st.wood, (0, cy, 4.2), (w+.1, d+.1, 1.6), bevel=.04, grain=True)
        b.box(st.wood, (0, -.28, 4.2), (1.8, .1, 1.4), bevel=.03)
        roof_z = 5.0
    A.gable_roof(b, st, 0, cy, w, d, roof_z, along_x=True, gable_mat=st.wood)
    _horse(b, st, -1.5, -2.5)
    _fence(b, st, -4.8, -4.6, 4.8, -4.6)
    _fence(b, st, -4.8, -4.6, -4.8, -.3)
    _fence(b, st, 4.8, -4.6, 4.8, -.3)
    # Trough with visible golden hay instead of a decorative water texture.
    b.box(st.wood, (3.3, -3.5, .55), (2, .8, .7), bevel=.04)
    b.box('common.crop', (3.3, -3.5, .92), (1.7, .6, .14), bevel=.06)
    if stage >= 2:
        _horse(b, st, 1.1, -1.1)
        _shed(b, st, -3.7, -1.8, 2.0, 2.2, 2.8)
    if stage >= 3:
        b.beam(st.wood, (0, -.5, .3), (0, -.5, 4.8), .2)
        b.beam(st.wood, (0, -.5, 4.8), (2.5, -.5, 4.8), .18)
        b.tube(A.IRON, (2.4, -.5, 4.8), (2.4, -.5, 2.7), .025, .025, segments=6)
    return b


def workshop(st: A.Style, stage: int) -> Builder:
    b = Builder()
    _base(b, st)
    _shed(b, st, 0, 2.6, 9, 3.9, 3.6)
    b.box(st.wood, (0, 3.1, 1), (6, 1.0, .2), grain=True)
    for x in (-2.5, 0, 2.5):
        b.box(st.wood, (x, 3.1, .5), (.22, .8, 1))
    # Four-wheeled siege ram with suspended timber, iron head and an A-frame.
    b.box(st.wood, (0, -2.4, .95), (5.2, 2.2, .25), grain=True)
    for x in (-1.75, 1.75):
        b.cylinder(A.IRON, (x, -1.2, .6), .1, 2.5, segments=8, axis='Y')
        for y in (-1.2, -3.6):
            b.cylinder(st.wood, (x, y, .6), .61, .18, segments=16, axis='Y')
            b.cylinder(A.IRON, (x, y-.02, .6), .17, .24, segments=10, axis='Y')
        for y in (-3.3, -1.5):
            b.beam(st.wood, (x, y, 1.1), (x, -2.4, 2.75), .16)
    b.beam(st.wood, (-2.0, -2.4, 2.75), (2.0, -2.4, 2.75), .24)
    b.cylinder(st.wood, (-2.3, -2.4, 1.75), .35, 4.6, segments=14, axis='X')
    b.cylinder(A.IRON, (2.1, -2.4, 1.75), .42, .35, segments=14, axis='X')
    for x in (-1.4, 1.4):
        b.tube(A.IRON, (x, -2.4, 2.75), (x, -2.4, 1.9), .035, .035, segments=6)
    # Hand tools and spare wheels stacked against the shop.
    for i in range(2 + stage):
        x = -2.7 + i * .95
        b.beam(st.wood, (x, 2.5, 1.1), (x, 2.5, 2.1), .075)
        b.box(A.IRON, (x, 2.5, 2.1), (.5, .15, .2), bevel=.025)
    if stage >= 2:
        b.cylinder(st.wood, (3.5, 1.1, .7), .7, .2, segments=16, axis='Y')
        b.cylinder(st.wood, (3.5, 1.4, .7), .7, .2, segments=16, axis='Y')
        _crate(b, st, -3.8, 1, .2, .9)
    if stage >= 3:
        A.house(b, st, 0, 2.6, 5.3, 3.8, 2, seed=850, windows_ground=False, chimney_on=False)
    return b


GENERATORS = {name: globals()[name] for name in (
    'lumber_mill', 'brickyard', 'iron_foundry', 'grain_mill', 'bakery',
    'castle', 'rally_point', 'watchtower', 'war_camp', 'trapper',
    'clay_pit', 'stable', 'workshop',
)}
