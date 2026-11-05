"""Kit de geometría arquitectónica sobre bmesh (Blender, Z arriba, frente hacia −Y).

Cada pieza se añade a un bmesh por material. Las UV se asignan al crear la
pieza en escala de mundo (metros / `tile`), con V alineada al eje vertical en
muros y a la pendiente en tejados; en piezas de madera U sigue la fibra (eje largo).
Al exportar a glTF (+Y arriba) el frente −Y de Blender queda en +Z.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import bmesh
import bpy
from mathutils import Matrix, Vector

# metros que cubre una repetición de textura, por material lógico
TILE = {
    'skin': 0.5,
    'leather': 0.8,
    'sail': 1.0,
    'canvas': 2.0,
    'rope': 0.6,
    'hull_tar': 2.0,
    'foliage_pine': 2.0,
    'foliage': 2.5,
    'bark': 1.5,
    'water': 9.0,
    'stone': 2.4,
    'plaster': 3.0,
    'wood': 2.0,
    'roof': 2.0,
    'iron': 1.0,
    'cloth': 1.5,
    'thatch': 2.5,
    'ground': 4.0,
}


def tile_of(mat: str) -> float:
    for k, v in TILE.items():
        if k in mat:
            return v
    return 2.0


@dataclass
class Builder:
    """Acumula geometría por material; `build()` crea un objeto con un slot por material."""

    parts: dict[str, bmesh.types.BMesh] = field(default_factory=dict)
    detail: dict[str, bmesh.types.BMesh] = field(default_factory=dict)

    def bm(self, mat: str, is_detail: bool = False) -> bmesh.types.BMesh:
        store = self.detail if is_detail else self.parts
        if mat not in store:
            b = bmesh.new()
            b.loops.layers.uv.new('UVMap')
            store[mat] = b
        return store[mat]

    # ------------------------------------------------------------ primitivas

    def box(
        self,
        mat: str,
        center: tuple[float, float, float],
        size: tuple[float, float, float],
        *,
        bevel: float = 0.03,
        rot_z: float = 0.0,
        grain: bool = False,
        detail: bool = False,
        tilt: tuple[float, float] = (0.0, 0.0),
    ) -> None:
        """Caja biselada. `rot_z` en grados; `tilt` (rx, ry) en grados para tornapuntas."""
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cube(tmp, size=1.0)
        sx, sy, sz = size
        bmesh.ops.scale(tmp, vec=Vector((sx, sy, sz)), verts=tmp.verts)
        bev = min(bevel, 0.45 * min(sx, sy, sz))
        if bev > 0.002:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bev, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
        long_axis = max(range(3), key=lambda i: size[i])
        _uv_box(tmp, uv_l, tile_of(mat), grain=grain, long_axis=long_axis)
        m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z')
        if tilt != (0.0, 0.0):
            m = m @ Matrix.Rotation(math.radians(tilt[0]), 4, 'X') @ Matrix.Rotation(math.radians(tilt[1]), 4, 'Y')
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        _merge_into(b, tmp)

    def beam(self, mat: str, p0: tuple[float, float, float], p1: tuple[float, float, float], w: float, *, detail: bool = False) -> None:
        """Viga de sección cuadrada `w` entre dos puntos (entramados, tornapuntas, vallas)."""
        a, c = Vector(p0), Vector(p1)
        d = c - a
        length = d.length
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector((length, w, w)), verts=tmp.verts)
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=min(0.02, w * 0.2), segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
        _uv_box(tmp, uv_l, tile_of(mat), grain=True, long_axis=0)
        rot = Vector((1, 0, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(tmp, matrix=Matrix.Translation((a + c) / 2) @ rot, verts=tmp.verts)
        _merge_into(b, tmp)

    def tube(self, mat: str, p0: tuple[float, float, float], p1: tuple[float, float, float], r0: float, r1: float, *, segments: int = 8, detail: bool = False) -> None:
        """Tronco de cono orientado entre dos puntos (miembros, astiles), con tapas."""
        a, c = Vector(p0), Vector(p1)
        d = c - a
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segments, radius1=r0, radius2=r1, depth=d.length)
        bmesh.ops.translate(tmp, vec=Vector((0, 0, d.length / 2)), verts=tmp.verts)
        _uv_cylindrical(tmp, uv_l, tile_of(mat), max(r0, r1))
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(tmp, matrix=Matrix.Translation(a) @ rot, verts=tmp.verts)
        _merge_into(b, tmp)

    def cylinder(
        self,
        mat: str,
        base: tuple[float, float, float],
        radius: float,
        height: float,
        *,
        segments: int = 16,
        bevel: float = 0.03,
        radius_top: float | None = None,
        cap_top: bool = True,
        detail: bool = False,
        axis: str = 'Z',
        rot_z: float = 0.0,
    ) -> None:
        """Cilindro/tronco de cono. `axis='Y'` lo tumba (discos verticales, ejes de rueda)."""
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        rt = radius if radius_top is None else radius_top
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=rt, depth=height)
        bmesh.ops.translate(tmp, vec=Vector((0, 0, height / 2)), verts=tmp.verts)
        if not cap_top:
            top = [f for f in tmp.faces if f.normal.z > 0.9]
            bmesh.ops.delete(tmp, geom=top, context='FACES')
        if bevel > 0.002:
            rims = [e for e in tmp.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
            bmesh.ops.bevel(tmp, geom=rims, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
        _uv_cylindrical(tmp, uv_l, tile_of(mat), radius)
        m = Matrix.Translation(Vector(base)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z')
        if axis == 'Y':
            m = m @ Matrix.Rotation(math.radians(90), 4, 'X')
        elif axis == 'X':
            m = m @ Matrix.Rotation(math.radians(90), 4, 'Y')
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        _merge_into(b, tmp)

    def cone_roof(self, mat: str, base: tuple[float, float, float], radius: float, height: float, *, segments: int = 16, overhang: float = 0.35, thickness: float = 0.12) -> None:
        """Chapitel cónico con alero y canto visible."""
        r = radius + overhang
        b = self.bm(mat)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=True, segments=segments, radius1=r, radius2=0.0, depth=height)
        bmesh.ops.translate(tmp, vec=Vector((0, 0, height / 2 + thickness)), verts=tmp.verts)
        # canto del alero
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r, depth=thickness)
        _uv_slope(tmp, uv_l, tile_of(mat))
        bmesh.ops.translate(tmp, vec=Vector(base), verts=tmp.verts)
        _merge_into(b, tmp)

    def gable_roof(
        self,
        mat: str,
        center: tuple[float, float, float],
        width: float,
        depth: float,
        rise: float,
        *,
        overhang: float = 0.45,
        thickness: float = 0.16,
        ridge_along_x: bool = True,
        rot_z: float = 0.0,
        ridge_mat: str | None = None,
    ) -> None:
        """Tejado a dos aguas con grosor, alero y cumbrera. `center` = centro del alero (z de arranque)."""
        b = self.bm(mat)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        L = (width if ridge_along_x else depth) + 2 * overhang  # longitud de cumbrera
        S = (depth if ridge_along_x else width) / 2 + overhang  # semiluz horizontal con alero
        slope_rise = rise * S / max(1e-6, S - overhang)
        for side in (-1, 1):
            # faldón: losa inclinada de grosor `thickness`
            p = [
                Vector((-L / 2, 0, slope_rise)),
                Vector((L / 2, 0, slope_rise)),
                Vector((L / 2, side * S, 0)),
                Vector((-L / 2, side * S, 0)),
            ]
            n = (p[1] - p[0]).cross(p[3] - p[0]).normalized()
            if n.z < 0:
                n = -n
            top = [tmp.verts.new(v + n * thickness * 0.5) for v in p]
            bot = [tmp.verts.new(v - n * thickness * 0.5) for v in p]
            faces = [top, bot[::-1]] + [[top[i], bot[i], bot[(i + 1) % 4], top[(i + 1) % 4]] for i in range(4)]
            for f in faces:
                try:
                    tmp.faces.new(f)
                except ValueError:
                    pass
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        _uv_slope(tmp, uv_l, tile_of(mat))
        m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(math.radians(rot_z + (0 if ridge_along_x else 90)), 4, 'Z')
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        _merge_into(b, tmp)
        # cumbrera
        if ridge_mat:
            cx, cy, cz = center
            ang = math.radians(rot_z + (0 if ridge_along_x else 90))
            dx, dy = math.cos(ang) * L / 2, math.sin(ang) * L / 2
            self.beam(ridge_mat, (cx - dx, cy - dy, cz + slope_rise + thickness * 0.4), (cx + dx, cy + dy, cz + slope_rise + thickness * 0.4), 0.22)

    def gable_wall(self, mat: str, center: tuple[float, float, float], span: float, rise: float, thickness: float, *, rot_z: float = 0.0) -> None:
        """Hastial triangular (cierra el tejado a dos aguas). `span` a lo ancho (X local)."""
        b = self.bm(mat)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        h = thickness / 2
        pts = [(-span / 2, 0.0), (span / 2, 0.0), (0.0, rise)]
        front = [tmp.verts.new((x, -h, z)) for x, z in pts]
        back = [tmp.verts.new((x, h, z)) for x, z in pts]
        tmp.faces.new(front)
        tmp.faces.new(back[::-1])
        for i in range(3):
            j = (i + 1) % 3
            tmp.faces.new([front[i], back[i], back[j], front[j]])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        bmesh.ops.transform(tmp, matrix=Matrix.Translation(Vector(center)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z'), verts=tmp.verts)
        _uv_world(tmp, uv_l, tile_of(mat))
        _merge_into(b, tmp)

    def flag(self, mat: str, top: tuple[float, float, float], w: float, h: float, *, rot_z: float = 0.0, waves: int = 6) -> None:
        """Estandarte de tela con ondulación (malla subdividida para animarlo en motor)."""
        b = self.bm(mat, True)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        cols, rows = waves * 2, 4
        grid = []
        for r in range(rows + 1):
            row = []
            for c in range(cols + 1):
                u, v = c / cols, r / rows
                x = u * w
                y = math.sin(u * math.pi * 2.0) * 0.08 * u
                z = -v * h
                row.append(tmp.verts.new((x, y, z)))
            grid.append(row)
        for r in range(rows):
            for c in range(cols):
                f = tmp.faces.new([grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1]])
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_l].uv = (co.x / w, 1 + co.z / h)
        bmesh.ops.transform(tmp, matrix=Matrix.Translation(Vector(top)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z'), verts=tmp.verts)
        _merge_into(b, tmp)

    def rock(self, mat: str, center: tuple[float, float, float], size: tuple[float, float, float], *, seed: int = 0, rot_z: float = 0.0, detail: bool = False) -> None:
        """Roca irregular: icosfera desplazada de forma determinista (semilla)."""
        import random as _r

        rng = _r.Random(seed)
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=0.5)
        for v in tmp.verts:
            k = 1.0 + rng.uniform(-0.18, 0.14)
            v.co *= k
            if v.co.z < -0.15:
                v.co.z = -0.15 + (v.co.z + 0.15) * 0.3  # base aplanada que entra en el suelo
        bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
        # `center[2]` es la cota de apoyo: la roca descansa en ella y se hunde un 8 % de su alto
        zmin = min(v.co.z for v in tmp.verts)
        bmesh.ops.translate(tmp, vec=Vector((0, 0, -zmin - 0.08 * size[2])), verts=tmp.verts)
        _uv_world(tmp, uv_l, tile_of(mat))
        m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z')
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        _merge_into(b, tmp)

    def blob(self, mat: str, base: tuple[float, float, float], size: tuple[float, float, float], *, seed: int = 0, shape: str = 'sphere', jitter: float = 0.16, detail: bool = False) -> None:
        """Volumen orgánico (copa, arbusto, capa de pino): icosfera o cono con desplazamiento sembrado."""
        import random as _r

        rng = _r.Random(seed)
        b = self.bm(mat, detail)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        if shape == 'cone':
            bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=True, segments=9, radius1=0.5, radius2=0.0, depth=1.0)
            bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.5)), verts=tmp.verts)
            bmesh.ops.subdivide_edges(tmp, edges=[e for e in tmp.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.3], cuts=1, use_grid_fill=False)
        else:
            bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=0.5)
            bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.5)), verts=tmp.verts)
        for v in tmp.verts:
            k = 1.0 + rng.uniform(-jitter, jitter)
            v.co.x *= k
            v.co.y *= k
            v.co.z = 0.5 + (v.co.z - 0.5) * (1.0 + rng.uniform(-jitter, jitter) * 0.5)
        bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
        _uv_world(tmp, uv_l, tile_of(mat))
        bmesh.ops.translate(tmp, vec=Vector(base), verts=tmp.verts)
        _merge_into(b, tmp)

    def loft(self, mat: str, rings: list[list[tuple[float, float, float]]], *, close_ends: bool = True, grain_along: bool = True) -> None:
        """Superficie por secciones (cascos): une anillos consecutivos con caras; UV U = distancia a lo largo, V = perímetro."""
        b = self.bm(mat)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        tile = tile_of(mat)
        vrows = [[tmp.verts.new(p) for p in ring] for ring in rings]
        # coordenadas UV: u acumulada a lo largo (eje Y), v acumulada por el perímetro de cada anillo
        ucoord = [0.0]
        for i in range(1, len(rings)):
            ucoord.append(ucoord[-1] + (Vector(rings[i][len(rings[i]) // 2]) - Vector(rings[i - 1][len(rings[i - 1]) // 2])).length)
        vcoord = []
        for ring in rings:
            acc = [0.0]
            for j in range(1, len(ring)):
                acc.append(acc[-1] + (Vector(ring[j]) - Vector(ring[j - 1])).length)
            vcoord.append(acc)
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n - 1):
                quad = [vrows[i][j], vrows[i + 1][j], vrows[i + 1][j + 1], vrows[i][j + 1]]
                try:
                    f = tmp.faces.new(quad)
                except ValueError:
                    continue
                uvs = [(ucoord[i], vcoord[i][j]), (ucoord[i + 1], vcoord[i + 1][j]), (ucoord[i + 1], vcoord[i + 1][j + 1]), (ucoord[i], vcoord[i][j + 1])]
                for loop, (u, v) in zip(f.loops, uvs):
                    loop[uv_l].uv = ((v if not grain_along else u) / tile, (u if not grain_along else v) / tile)
        if close_ends:
            for row in (vrows[0], vrows[-1]):
                try:
                    f = tmp.faces.new(row)
                    for loop in f.loops:
                        co = loop.vert.co
                        loop[uv_l].uv = (co.x / tile, co.z / tile)
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=0.001)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        _merge_into(b, tmp)

    def sail(self, mat: str, top_center: tuple[float, float, float], width: float, height: float, *, billow: float = 0.6, taper: float = 0.0, cols: int = 10, rows: int = 8, rot_z: float = 0.0) -> None:
        """Vela de lona hinchada hacia −Y (proa), con dos caras separadas 1,5 cm (visible por ambos lados)."""
        b = self.bm(mat)
        tmp = bmesh.new()
        uv_l = tmp.loops.layers.uv.new('UVMap')
        for side, off in ((1, 0.0), (-1, 0.015)):
            grid = []
            for r in range(rows + 1):
                v = r / rows
                w = width * (1 - taper * v)
                row = []
                for c in range(cols + 1):
                    u = c / cols
                    x = (u - 0.5) * w
                    bel = math.sin(math.pi * u) * math.sin(math.pi * (0.15 + 0.85 * v)) * billow
                    row.append(tmp.verts.new((x, -bel + off, -v * height)))
                grid.append(row)
            for r in range(rows):
                for c in range(cols):
                    quad = [grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1]]
                    f = tmp.faces.new(quad if side > 0 else quad[::-1])
                    for loop in f.loops:
                        co = loop.vert.co
                        loop[uv_l].uv = (co.x / width + 0.5, 1 + co.z / height)
        bmesh.ops.transform(tmp, matrix=Matrix.Translation(Vector(top_center)) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z'), verts=tmp.verts)
        _merge_into(b, tmp)

    # ------------------------------------------------------------- salida

    def build(self, name: str, include_detail: bool = True) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(name)
        out = bmesh.new()
        out.loops.layers.uv.new('UVMap')
        mats: list[str] = []
        stores = [self.parts] + ([self.detail] if include_detail else [])
        for store in stores:
            for mat, src in store.items():
                if mat not in mats:
                    mats.append(mat)
                idx = mats.index(mat)
                before = set(out.faces)
                _merge_into(out, src)
                for f in out.faces:
                    if f not in before:
                        f.material_index = idx
        bmesh.ops.remove_doubles(out, verts=out.verts, dist=0.0005)
        bmesh.ops.recalc_face_normals(out, faces=out.faces)
        out.to_mesh(mesh)
        out.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for mname in mats:
            mat = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
            mesh.materials.append(mat)
        for poly in mesh.polygons:
            poly.use_smooth = False
        return obj


# --------------------------------------------------------------------- UV


def _merge_into(dst: bmesh.types.BMesh, src: bmesh.types.BMesh) -> None:
    uv_d = dst.loops.layers.uv.active or dst.loops.layers.uv.new('UVMap')
    uv_s = src.loops.layers.uv.active
    vmap = {}
    for v in src.verts:
        vmap[v] = dst.verts.new(v.co)
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = f.material_index
        if uv_s is not None:
            for l_new, l_old in zip(nf.loops, f.loops):
                l_new[uv_d].uv = l_old[uv_s].uv


def _uv_box(b, uv_l, tile: float, *, grain: bool, long_axis: int) -> None:
    """UV planar por cara en el marco local de la caja (antes de transformarla)."""
    axes = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))]
    for f in b.faces:
        n = f.normal
        k = max(range(3), key=lambda i: abs(n[i]))
        others = [i for i in range(3) if i != k]
        if grain and long_axis in others:
            u_ax, v_ax = long_axis, [i for i in others if i != long_axis][0]
        elif 2 in others:  # cara vertical: V = arriba
            u_ax, v_ax = [i for i in others if i != 2][0], 2
        else:
            u_ax, v_ax = others
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_l].uv = (co.dot(axes[u_ax]) / tile, co.dot(axes[v_ax]) / tile)


def _uv_world(b, uv_l, tile: float) -> None:
    up = Vector((0, 0, 1))
    for f in b.faces:
        n = f.normal
        u = up.cross(n)
        if u.length < 1e-4:
            u = Vector((1, 0, 0))
        u.normalize()
        v = n.cross(u).normalized()
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_l].uv = (co.dot(u) / tile, co.dot(v) / tile)


def _uv_slope(b, uv_l, tile: float) -> None:
    """Tejados: U horizontal a lo largo del alero, V subiendo por la pendiente."""
    _uv_world(b, uv_l, tile)


def _uv_cylindrical(b, uv_l, tile: float, radius: float) -> None:
    circ = 2 * math.pi * max(radius, 0.05)
    reps = max(1, round(circ / tile))
    for f in b.faces:
        if abs(f.normal.z) > 0.8:
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_l].uv = (co.x / tile, co.y / tile)
            continue
        angs = [math.atan2(l.vert.co.y, l.vert.co.x) for l in f.loops]
        # evitar el salto de −π a π dentro de una cara
        if max(angs) - min(angs) > math.pi:
            angs = [a + 2 * math.pi if a < 0 else a for a in angs]
        for loop, a in zip(f.loops, angs):
            loop[uv_l].uv = (a / (2 * math.pi) * reps, loop.vert.co.z / tile)
