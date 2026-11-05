"""Corrección, LOD, exportación GLB y previsualización con Cycles."""

from __future__ import annotations

import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

from . import geo
from . import materials as M


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _vertex_tint(obj: bpy.types.Object, seed: int, ground_dark: float = 0.6, ground_h: float = 1.6) -> None:
    """Color de vértice 'Col' = oscurecimiento de contacto con el suelo × variación por pieza.

    El cliente multiplica el color base por este atributo (sombras de contacto
    y piezas que no parecen clonadas). Se calcula, no se pinta a mano.
    """
    mesh = obj.data
    if 'Col' not in mesh.color_attributes:
        mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    attr = mesh.color_attributes['Col']
    mesh.color_attributes.active_color = attr
    bm = bmesh.new()
    bm.from_mesh(mesh)
    col = bm.loops.layers.color.get('Col')
    rng = random.Random(seed)
    seen: set = set()
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        if f in seen:
            continue
        # isla conectada = una pieza (viga, bloque, teja...)
        stack, island = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        k = 1.0 + rng.uniform(-0.07, 0.07)
        for g in island:
            for loop in g.loops:
                z = loop.vert.co.z
                t = min(1.0, max(0.0, z / ground_h))
                ao = ground_dark + (1 - ground_dark) * (t * t * (3 - 2 * t))
                v = max(0.0, min(1.0, ao * k))
                loop[col] = (v, v, v, 1.0)
    bm.to_mesh(mesh)
    bm.free()


def _check_geometry(obj: bpy.types.Object, below_ground_ok: bool = False) -> list[str]:
    """Validación geométrica básica: base en el suelo, sin islas flotantes, normales."""
    problems: list[str] = []
    mesh = obj.data
    zs = [v.co.z for v in mesh.vertices]
    if not zs:
        return ['sin geometría']
    if min(zs) > 0.05 or (min(zs) < -0.05 and not below_ground_ok):
        problems.append(f'base fuera del suelo (min z = {min(zs):.3f})')
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    # islas flotantes: islas cuyo punto más bajo está > 0.25 m sobre cualquier otra
    # geometría por debajo de su huella no se pueden detectar sin raycast; se usa
    # una regla conservadora: islas grandes (> 0.5 m) que no tocan nada.
    seen: set = set()
    islands = []
    for f in bm.faces:
        if f in seen:
            continue
        stack, verts = [f], set()
        seen.add(f)
        while stack:
            g = stack.pop()
            verts.update(g.verts)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        islands.append(verts)
    boxes = []
    for vs in islands:
        mn = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
        mx = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
        boxes.append((mn, mx))
    eps = 0.06
    floating = 0
    for i, (mn, mx) in enumerate(boxes):
        if mn.z < 0.05:
            continue
        touches = False
        for j, (mn2, mx2) in enumerate(boxes):
            if i == j:
                continue
            if all(mn[k] <= mx2[k] + eps and mx[k] >= mn2[k] - eps for k in range(3)):
                touches = True
                break
        if not touches:
            floating += 1
    if floating:
        problems.append(f'{floating} pieza(s) flotante(s) sin contacto')
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-7)
    if zero:
        problems.append(f'{zero} cara(s) degeneradas')
    bm.free()
    return problems


def _decimate(obj: bpy.types.Object, ratio: float) -> None:
    if ratio >= 0.999:
        return
    mod = obj.modifiers.new('lod', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def tris(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def build_lods(builder: geo.Builder, asset_id: str, seed: int, lod_ratios: tuple[float, float] = (0.6, 0.3), recenter: bool = True) -> list[bpy.types.Object]:
    """LOD0 con detalle; LOD1/LOD2 sin piezas de detalle y decimados.

    `recenter` desplaza todos los LOD para que la huella (XY) quede centrada en
    el pivote: el pivote es el centro de la parcela.
    """
    lod0 = builder.build('LOD0', include_detail=True)
    lod1 = builder.build('LOD1', include_detail=False)
    lod2 = builder.build('LOD2', include_detail=False)
    if recenter:
        xs = [v.co.x for v in lod0.data.vertices]
        ys = [v.co.y for v in lod0.data.vertices]
        off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0))
        for o in (lod0, lod1, lod2):
            for v in o.data.vertices:
                v.co -= off
    _decimate(lod1, lod_ratios[0])
    _decimate(lod2, lod_ratios[1])
    root = bpy.data.objects.new(asset_id, None)
    bpy.context.scene.collection.objects.link(root)
    for o in (lod0, lod1, lod2):
        o.parent = root
        _vertex_tint(o, seed)
    return [lod0, lod1, lod2]


def export_glb(path: str) -> int:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_image_format='NONE',
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=True,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    return os.path.getsize(path)


def preview(path: str, tex_dir: str, lod0: bpy.types.Object, *, size: tuple[int, int] = (720, 540), views=('iso', 'front')) -> list[str]:
    """Render con Cycles (CPU) del LOD0 con los materiales reales, desde varias vistas."""
    scene = bpy.context.scene
    for slot in lod0.material_slots:
        if slot.material:
            slot.material = M.blender_material(slot.material.name, tex_dir)
    others = [o for o in scene.objects if o.type == 'MESH' and o is not lod0]
    for o in others:
        o.hide_render = True
    # suelo
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.01))
    ground = bpy.context.active_object
    gmat = M.blender_material('terrain.grass', tex_dir, vertex_color=False)
    ground.data.materials.append(gmat)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.reset()
    bpy.ops.object.mode_set(mode='OBJECT')
    for loop in ground.data.uv_layers.active.data:
        loop.uv = (loop.uv[0] * 80 / 6.0, loop.uv[1] * 80 / 6.0)
    # luz y cielo
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 4.2
    sun_data.angle = math.radians(2.5)
    sun_data.color = (1.0, 0.95, 0.88)
    sun = bpy.data.objects.new('sun', sun_data)
    sun.rotation_euler = (math.radians(42), 0, math.radians(35))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'HOSEK_WILKIE'
    except TypeError:
        pass
    world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.45
    scene.world = world
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    dims = lod0.dimensions
    bb = [lod0.matrix_world @ Vector(c) for c in lod0.bound_box]
    center = sum(bb, Vector()) / 8
    radius = max(dims.x, dims.y, dims.z) * 0.5 + 1.5
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((center.x, center.y, dims.z * 0.36))
    out = []
    for view in views:
        if view == 'iso':
            d = Vector((1.0, -1.25, 1.05)).normalized()
        elif view == 'front':
            d = Vector((0.12, -1.0, 0.42)).normalized()
        else:  # top (cámara de juego alta)
            d = Vector((0.35, -0.55, 1.4)).normalized()
        cam.location = target + d * radius * 3.7
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        file = f'{path}_{view}.png'
        scene.render.filepath = os.path.abspath(file)
        bpy.ops.render.render(write_still=True)
        out.append(file)
    return out


def write_report(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w') as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
