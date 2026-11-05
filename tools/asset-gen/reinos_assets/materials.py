"""Biblioteca de materiales PBR compartidos (Art Bible §5–6).

Los GLB de edificios NO incrustan texturas: cada malla referencia un material
por nombre (`corona.stone`, `liga.roof`…) y el cliente asigna el material
compartido de la biblioteca publicada en `apps/web/public/assets/materials/`.
Así cada textura se descarga una vez por civilización.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable

import bpy

from . import imageio as IO
from . import textures as T

# nombre lógico -> (generador, metros por repetición de textura)
TexFn = Callable[[int], T.PbrSet]

LIBRARY: dict[str, tuple[TexFn, float]] = {
    # Imperio de la Corona: caliza, revoque ocre, roble, teja
    'corona.stone': (lambda n: T.ashlar(n, 101, '#C2B595', rows=7), 2.4),
    'corona.plaster': (lambda n: T.plaster(n, 102, '#D9C9A3'), 3.0),
    'corona.wood': (lambda n: T.wood(n, 103, '#4A3524', planks=8), 2.0),
    'corona.roof': (lambda n: T.roof_tiles(n, 104, '#9A4B32', rows=9, cols=10), 2.0),
    'corona.cloth': (lambda n: T.cloth(n, 105, '#8E1E22'), 1.5),
    # Liga de los Mares: encalado, pizarra, pino curtido
    'liga.stone': (lambda n: T.ashlar(n, 201, '#A7A39A', rows=8, mortar='#7d7a72'), 2.4),
    'liga.plaster': (lambda n: T.plaster(n, 202, '#E6E0D2'), 3.0),
    'liga.wood': (lambda n: T.wood(n, 203, '#7A6248', planks=8), 2.0),
    'liga.roof': (lambda n: T.slate(n, 204, '#4C5A66', rows=11, cols=8), 2.0),
    'liga.cloth': (lambda n: T.cloth(n, 205, '#1F6F8B'), 1.5),
    # Compartidos
    'common.iron': (lambda n: T.iron(n, 301), 1.0),
    'common.thatch': (lambda n: T.thatch(n, 302, '#B89A5A'), 2.5),
    'common.rough_stone': (lambda n: T.ground(n, 303, 'rock'), 3.0),
    'common.dirt': (lambda n: T.ground(n, 304, 'dirt'), 4.0),
    'common.crop': (lambda n: T.ground(n, 305, 'dry_grass'), 3.0),
    'common.water': (lambda n: T.water(n, 310), 9.0),
    'common.foliage': (lambda n: T.foliage(n, 311, '#4A6B2E'), 2.5),
    'common.foliage_pine': (lambda n: T.foliage(n, 312, '#34502A'), 2.0),
    'common.bark': (lambda n: T.bark(n, 313, '#5A4634'), 1.5),
    'terrain.grass': (lambda n: T.ground(n, 401, 'grass'), 6.0),
    'terrain.dirt': (lambda n: T.ground(n, 402, 'dirt'), 5.0),
    'terrain.rock': (lambda n: T.ground(n, 403, 'rock'), 6.0),
    'terrain.sand': (lambda n: T.ground(n, 404, 'sand'), 5.0),
}

TEXTURE_SIZE = 512


def publish_textures(out_dir: str, size: int = TEXTURE_SIZE, only: list[str] | None = None) -> dict:
    """Genera y publica las texturas (WebP) y un índice JSON consumido por el cliente."""
    index: dict[str, dict] = {}
    for name, (fn, tile) in LIBRARY.items():
        if only and name not in only:
            continue
        pbr = fn(size)
        base = os.path.join(out_dir, name.replace('.', '/'))
        IO.save(f'{base}_base.webp', pbr.base, quality=86)
        IO.save(f'{base}_normal.webp', pbr.normal, quality=92, linear=True)
        # ORM a mitad de resolución: rugosidad/oclusión toleran menos detalle (presupuesto de VRAM).
        orm = pbr.orm.reshape(size // 2, 2, size // 2, 2, 3).mean(axis=(1, 3))
        IO.save(f'{base}_orm.webp', orm, quality=90, linear=True)
        rel = name.replace('.', '/')
        index[name] = {
            'base': f'{rel}_base.webp',
            'normal': f'{rel}_normal.webp',
            'orm': f'{rel}_orm.webp',
            'tileMeters': tile,
            'size': size,
        }
    path = os.path.join(out_dir, 'library.json')
    existing = {}
    if only and os.path.exists(path):
        with open(path) as fh:
            existing = json.load(fh).get('materials', {})
    existing.update(index)
    with open(path, 'w') as fh:
        json.dump({'version': 1, 'materials': existing}, fh, indent=2, sort_keys=True)
    return existing


def blender_material(name: str, tex_dir: str, vertex_color: bool = True) -> bpy.types.Material:
    """Material de Blender con las mismas texturas (para previsualizar con Cycles)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    rel = name.replace('.', '/')
    paths = {k: os.path.join(tex_dir, f'{rel}_{k}.webp') for k in ('base', 'normal', 'orm')}
    if not all(os.path.exists(p) for p in paths.values()):
        bsdf.inputs['Base Color'].default_value = (0.6, 0.6, 0.6, 1)
        return mat

    def img(key: str, non_color: bool):
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(paths[key], check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = 'Non-Color'
        return node

    base = img('base', False)
    if not vertex_color:
        nt.links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(base.outputs['Color'], mul.inputs[6])
    nt.links.new(attr.outputs['Color'], mul.inputs[7])
    if vertex_color:
        nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    orm = img('orm', True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nrm = img('normal', True)
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat
