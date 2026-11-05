"""Personajes humanoides con esqueleto compartido y clips comunes (Art Bible §4, §8).

Esqueleto de 17 huesos (≤ 22) para todas las unidades a pie: la variación entre
unidades es de malla y material (casco, arma, escudo, túnica), no de animación.
Cada pieza se pesa rígidamente a su hueso; las piezas se solapan en las
articulaciones para que no se abran al girar. Frente hacia −Y (glTF +Z).
"""

from __future__ import annotations

import math
from collections.abc import Callable

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from .geo import Builder

# hueso: (cabeza, cola, padre)
SKELETON: dict[str, tuple[tuple[float, float, float], tuple[float, float, float], str | None]] = {
    'hips': ((0, 0, 0.94), (0, 0, 1.04), None),
    'spine': ((0, 0, 1.04), (0, 0, 1.22), 'hips'),
    'chest': ((0, 0, 1.22), (0, 0, 1.44), 'spine'),
    'neck': ((0, 0, 1.44), (0, 0, 1.54), 'chest'),
    'head': ((0, 0, 1.54), (0, 0, 1.76), 'neck'),
    'upper_arm.L': ((0.19, 0, 1.42), (0.23, 0.0, 1.14), 'chest'),
    'forearm.L': ((0.23, 0.0, 1.14), (0.25, -0.02, 0.89), 'upper_arm.L'),
    'hand.L': ((0.25, -0.02, 0.89), (0.255, -0.03, 0.80), 'forearm.L'),
    'upper_arm.R': ((-0.19, 0, 1.42), (-0.23, 0.0, 1.14), 'chest'),
    'forearm.R': ((-0.23, 0.0, 1.14), (-0.25, -0.02, 0.89), 'upper_arm.R'),
    'hand.R': ((-0.25, -0.02, 0.89), (-0.255, -0.03, 0.80), 'forearm.R'),
    'thigh.L': ((0.1, 0, 0.93), (0.105, 0.0, 0.50), 'hips'),
    'shin.L': ((0.105, 0.0, 0.50), (0.11, 0.02, 0.08), 'thigh.L'),
    'foot.L': ((0.11, 0.02, 0.08), (0.11, -0.14, 0.02), 'shin.L'),
    'thigh.R': ((-0.1, 0, 0.93), (-0.105, 0.0, 0.50), 'hips'),
    'shin.R': ((-0.105, 0.0, 0.50), (-0.11, 0.02, 0.08), 'thigh.R'),
    'foot.R': ((-0.11, 0.02, 0.08), (-0.11, -0.14, 0.02), 'shin.R'),
}

SKIN = 'common.skin'


def make_armature(name: str = 'Armature') -> bpy.types.Object:
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for bone, (h, t, parent) in SKELETON.items():
        eb = data.edit_bones.new(bone)
        eb.head = Vector(h)
        eb.tail = Vector(t)
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


class Body:
    """Acumula piezas (Builder) por hueso; `build()` produce una malla con grupos de vértices."""

    def __init__(self) -> None:
        self.parts: list[tuple[str, Builder, bool]] = []

    def part(self, bone: str, fn: Callable[[Builder], None], *, detail: bool = False) -> None:
        b = Builder()
        fn(b)
        self.parts.append((bone, b, detail))

    def build(self, name: str, include_detail: bool = True) -> bpy.types.Object:
        objs = []
        for bone, builder, detail in self.parts:
            if detail and not include_detail:
                continue
            o = builder.build(f'{name}_{bone}_{len(objs)}', include_detail=True)
            vg = o.vertex_groups.new(name=bone)
            vg.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
            objs.append(o)
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = name
        obj.data.name = name
        return obj


def bind(mesh: bpy.types.Object, arm: bpy.types.Object) -> None:
    mesh.parent = arm
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


# ------------------------------------------------------------------ anatomía


def _limb(b: Builder, mat: str, p0, p1, r0: float, r1: float, segs: int = 8) -> None:
    """Miembro: tronco de cono entre articulaciones con una esfera en la articulación superior."""
    b.tube(mat, p0, p1, r0, r1, segments=segs)
    b.blob(mat, (p0[0], p0[1], p0[2] - r0 * 0.95), (r0 * 2.0, r0 * 2.0, r0 * 1.9), seed=int(abs(p0[2]) * 1000) & 0xFF, jitter=0.02)


def _torso(b: Builder, mat: str, widths: list[tuple[float, float, float]]) -> None:
    """Tronco por secciones elípticas: (z, semiancho X, semifondo Y)."""
    rings = []
    seg = 14
    for z, wx, wy in widths:
        ring = []
        for k in range(seg + 1):
            a = -math.pi / 2 + 2 * math.pi * k / seg
            ring.append((math.cos(a) * wx, math.sin(a) * wy, z))
        rings.append(ring)
    # loft: los anillos ya están en orden vertical; geo.loft usa Y como longitud para UV, basta para tela
    b.loft(mat, rings, close_ends=True, grain_along=False)


def humanoid(cloth: str, tunic: str, *, skin: str = SKIN, robe: bool = False) -> Body:
    """Cuerpo base: piel, gambesón/túnica, cinturón, calzas y botas."""
    body = Body()
    sk = SKELETON
    # cabeza con mandíbula y nariz
    body.part('head', lambda b: (b.blob(skin, (0, 0.0, 1.535), (0.19, 0.21, 0.24), seed=3, jitter=0.03), b.box(skin, (0, -0.1, 1.64), (0.035, 0.04, 0.06), bevel=0.012)))
    body.part('neck', lambda b: b.cylinder(skin, (0, 0, 1.43), 0.055, 0.14, segments=8, bevel=0.0))
    # tronco acolchado (gambesón): pecho ancho, cintura estrecha
    body.part('chest', lambda b: _torso(b, cloth, [(1.22, 0.15, 0.11), (1.34, 0.19, 0.125), (1.44, 0.2, 0.12), (1.48, 0.12, 0.09)]))
    body.part('spine', lambda b: _torso(b, cloth, [(1.02, 0.15, 0.105), (1.12, 0.145, 0.1), (1.24, 0.155, 0.11)]))
    # caderas + faldón de la túnica (acampanado)
    if robe:
        body.part('hips', lambda b: _torso(b, tunic, [(0.06, 0.24, 0.2), (0.5, 0.2, 0.16), (0.9, 0.165, 0.12), (1.06, 0.15, 0.105)]))
    else:
        body.part('hips', lambda b: _torso(b, tunic, [(0.62, 0.22, 0.17), (0.8, 0.185, 0.14), (0.96, 0.16, 0.115), (1.06, 0.15, 0.105)]))
    body.part('hips', lambda b: _torso(b, 'common.leather', [(0.99, 0.158, 0.112), (1.04, 0.158, 0.112)]), detail=False)
    for side in ('L', 'R'):
        sx = 1 if side == 'L' else -1
        h, t, _ = sk[f'upper_arm.{side}']
        body.part(f'upper_arm.{side}', lambda b, h=h, t=t: _limb(b, cloth, h, t, 0.06, 0.05))
        h2, t2, _ = sk[f'forearm.{side}']
        body.part(f'forearm.{side}', lambda b, h=h2, t=t2: _limb(b, cloth, h, t, 0.05, 0.04))
        h3, t3, _ = sk[f'hand.{side}']
        body.part(f'hand.{side}', lambda b, h=h3, sx=sx: b.box(skin, (h[0] + sx * 0.005, h[1] - 0.005, h[2] - 0.05), (0.06, 0.08, 0.1), bevel=0.02))
        if not robe:
            ht, tt, _ = sk[f'thigh.{side}']
            body.part(f'thigh.{side}', lambda b, h=ht, t=tt: _limb(b, cloth, h, t, 0.085, 0.06))
        hs, ts, _ = sk[f'shin.{side}']
        body.part(f'shin.{side}', lambda b, h=hs, t=ts: _limb(b, 'common.leather', h, t, 0.06, 0.045))
        hf, tf, _ = sk[f'foot.{side}']
        body.part(f'foot.{side}', lambda b, h=hf: b.box('common.leather', (h[0], h[1] - 0.06, 0.045), (0.1, 0.26, 0.09), bevel=0.03))
    return body


# ------------------------------------------------------------------ animación

Pose = dict[str, tuple[float, float, float]]  # hueso → rotación XYZ en grados


def _key(arm: bpy.types.Object, frame: int, pose: Pose, root_offset: tuple[float, float, float] = (0, 0, 0)) -> None:
    for name, pb in arm.pose.bones.items():
        pb.rotation_mode = 'XYZ'
        rx, ry, rz = pose.get(name, (0.0, 0.0, 0.0))
        pb.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ')
        pb.keyframe_insert('rotation_euler', frame=frame)
    hips = arm.pose.bones['hips']
    hips.location = Vector(root_offset)
    hips.keyframe_insert('location', frame=frame)


def add_clip(arm: bpy.types.Object, name: str, keys: list[tuple[int, Pose, tuple[float, float, float]]]) -> None:
    """Crea una acción con las poses clave y la empuja a una pista NLA con el nombre del clip."""
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for frame, pose, root in keys:
        _key(arm, frame, pose, root)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(keys[0][0]), act)
    arm.animation_data.action = None


def walk_cycle(stride: float, lean: float, arm_swing: float, bob: float, frames: int) -> list[tuple[int, Pose, tuple[float, float, float]]]:
    out = []
    n = 4
    for i in range(n + 1):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        c = math.cos(ph)
        pose: Pose = {
            'thigh.L': (stride * s, 0, 0),
            'thigh.R': (-stride * s, 0, 0),
            'shin.L': (-max(0.0, -c) * stride * 1.3, 0, 0),
            'shin.R': (-max(0.0, c) * stride * 1.3, 0, 0),
            'upper_arm.L': (-arm_swing * s, 0, 6),
            'upper_arm.R': (arm_swing * s, 0, -6),
            'forearm.L': (-12 - 8 * max(0.0, s), 0, 0),
            'forearm.R': (-12 - 8 * max(0.0, -s), 0, 0),
            'spine': (lean, 0, 3 * s),
            'chest': (lean * 0.5, 0, -4 * s),
        }
        out.append((1 + round(frames * i / n), pose, (0, 0, -abs(c) * bob)))
    return out
