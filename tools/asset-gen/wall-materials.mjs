// Arte procedural propio. Reutiliza exclusivamente texturas PBR de la biblioteca del proyecto.
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import console from 'node:console';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(
  new URL('../../packages/asset-pipeline/package.json', import.meta.url),
);
const { NodeIO } = require('@gltf-transform/core'),
  { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  root = fileURLToPath(new URL('../../apps/web/public/', import.meta.url)),
  manifestFile = `${root}assets/manifest.json`,
  manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
for (const type of ['earth_rampart', 'wood_gate', 'wood_tower'])
  for (let stage = 1; stage <= 3; stage++) {
    const earth = type === 'earth_rampart',
      doc = await io.read(
        `${root}assets/models/${earth ? 'clay_pit.common.s1' : 'palisade.liga.s1'}.glb`,
      ),
      r = doc.getRoot();
    const material =
      r.listMaterials().find((m) => m.getName() === (earth ? 'common.clay' : 'liga.wood')) ??
      r.listMaterials().find((m) => /wood|clay/.test(m.getName()));
    if (!material) throw new Error('Falta material PBR compartido');
    for (const p of [...r.listScenes(), ...r.listNodes(), ...r.listMeshes(), ...r.listAccessors()])
      p.dispose();
    for (const m of r.listMaterials()) if (m !== material) m.dispose();
    const scene = doc.createScene(type);
    r.setDefaultScene(scene);
    const buffer = r.listBuffers()[0] ?? doc.createBuffer();
    const triangles = [];
    for (let lod = 0; lod < 3; lod++) {
      const pos = [],
        norm = [],
        uv = [],
        colors = [];
      const tri = (a, b, c) => {
        const u = b.map((v, i) => v - a[i]),
          v = c.map((n, i) => n - a[i]),
          n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
          length = Math.hypot(...n) || 1;
        for (const p of [a, b, c]) {
          pos.push(...p);
          norm.push(...n.map((x) => x / length));
          uv.push(p[0] / 2, (p[1] + p[2]) / 2);
          const tint = 0.88 + 0.12 * Math.abs(Math.sin(p[0] * 2.3 + p[1] * 4.7 + p[2] * 1.9));
          colors.push(tint, tint, tint);
        }
      };
      const quad = (a, b, c, d) => {
        tri(a, b, c);
        tri(a, c, d);
      };
      const box = (x, y, z, w, h, d) => {
        const p = [
          [-w / 2, 0, -d / 2],
          [w / 2, 0, -d / 2],
          [w / 2, h, -d / 2],
          [-w / 2, h, -d / 2],
          [-w / 2, 0, d / 2],
          [w / 2, 0, d / 2],
          [w / 2, h, d / 2],
          [-w / 2, h, d / 2],
        ].map((p) => [p[0] + x, p[1] + y, p[2] + z]);
        for (const f of [
          [0, 3, 2, 1],
          [4, 5, 6, 7],
          [0, 4, 7, 3],
          [1, 2, 6, 5],
          [3, 7, 6, 2],
          [0, 1, 5, 4],
        ])
          quad(...f.map((i) => p[i]));
      };
      const log = (x, z, h, radius = 0.24, baseY = 0) => {
        const count = lod === 0 ? 8 : lod === 1 ? 6 : 4;
        for (let i = 0; i < count; i++) {
          const a = (i * 2 * Math.PI) / count,
            b = ((i + 1) * 2 * Math.PI) / count,
            p = [x + Math.sin(a) * radius, baseY, z + Math.cos(a) * radius],
            q = [x + Math.sin(b) * radius, baseY, z + Math.cos(b) * radius],
            pt = [p[0], h - 0.45, p[2]],
            qt = [q[0], h - 0.45, q[2]];
          quad(p, q, qt, pt);
          tri(pt, qt, [x, h, z]);
          tri([x, baseY, z], q, p);
        }
      };
      if (earth) {
        const segments = lod === 0 ? 16 : lod === 1 ? 8 : 4,
          height = 2.4 + stage * 0.9,
          width = 7 + stage;
        for (let i = 0; i < segments; i++) {
          const a = -7.3 + (i * 14.6) / segments,
            b = -7.3 + ((i + 1) * 14.6) / segments,
            ha = height + (i === 0 || i === segments ? 0 : 0.13 * Math.sin(i * 1.7)),
            hb = height + (i + 1 === segments ? 0 : 0.13 * Math.sin((i + 1) * 1.7));
          const p = [
              [a, 0, -width / 2],
              [a, ha, -1.1],
              [a, ha, 1.1],
              [a, 0, width / 2],
            ],
            q = [
              [b, 0, -width / 2],
              [b, hb, -1.1],
              [b, hb, 1.1],
              [b, 0, width / 2],
            ];
          for (let j = 0; j < 3; j++) quad(p[j], p[j + 1], q[j + 1], q[j]);
          quad(p[3], p[0], q[0], q[3]);
          if (i === 0) quad(p[0], p[3], p[2], p[1]);
          if (i === segments - 1) quad(q[0], q[1], q[2], q[3]);
        }
        if (lod < 2)
          for (let i = 0; i < 8; i++) {
            const x = -6.6 + i * 1.9;
            box(x, height - 0.1, -1, 0.9, 0.7, 0.65);
          }
      } else if (type === 'wood_gate') {
        for (const x of [-6.6, -5.9, 5.9, 6.6]) log(x, 0, 5.4 + stage * 0.65, 0.36);
        box(0, 4.7 + stage * 0.65, 0, 14.6, 0.5, 0.6);
        if (lod < 2) {
          box(0, 5.25 + stage * 0.65, 0, 14, 0.23, 1.1);
          for (let i = 0; i < 14; i++)
            log(-6.5 + i, 0, 6.1 + stage * 0.65, 0.11, 5.4 + stage * 0.65);
        }
      } else {
        const height = 5.2 + stage * 1.25;
        for (const x of [-2.2, 2.2]) for (const z of [-2.2, 2.2]) log(x, z, height + 1, 0.25);
        box(0, height - 1, 0, 5, 0.35, 5);
        box(0, height - 2.3, -2.3, 4.8, 1.3, 0.2);
        box(0, height - 2.3, 2.3, 4.8, 1.3, 0.2);
        const logs = lod === 0 ? 16 : lod === 1 ? 8 : 4;
        for (let i = 0; i < logs; i++) {
          const a = (i * Math.PI * 2) / logs;
          log(Math.sin(a) * 2.8, Math.cos(a) * 2.8, height + 0.3, 0.17);
        }
        if (lod < 2) for (let y = 0.5; y < height - 1; y += 0.55) box(0, y, 2.5, 1.1, 0.11, 0.2);
      }
      const accessor = (type, array) =>
        doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', pos))
        .setAttribute('NORMAL', accessor('VEC3', norm))
        .setAttribute('TEXCOORD_0', accessor('VEC2', uv))
        .setAttribute('COLOR_0', accessor('VEC3', colors))
        .setMaterial(material);
      scene.addChild(
        doc.createNode(`LOD${lod}`).setMesh(doc.createMesh(`${type}-LOD${lod}`).addPrimitive(prim)),
      );
      triangles.push(pos.length / 9);
    }
    const assetId = `${type}.common.s${stage}`,
      file = `assets/models/${assetId}.glb`;
    await io.write(`${root}${file}`, doc);
    const entry = {
      assetId,
      kind: 'prop',
      type,
      status: 'PENDING_REVIEW',
      file,
      visualStage: stage,
      units: 'meters',
      lodCount: 3,
      facing: 'outward',
      belowGroundOk: false,
      triangles,
      materials: [material.getName()],
      bytes: statSync(`${root}${file}`).size,
      thumbnail: null,
      version: 1,
      source: {
        workflow: 'tools/asset-gen/wall-materials.mjs → glTF Transform',
        provider: 'Generación procedural propia y biblioteca PBR del proyecto',
        author: 'Reinos de la Frontera',
        license: 'Propia del proyecto',
        createdAt: '2026-11-05',
      },
      validation: {
        geometry: 'PENDING',
        materials: 'PENDING',
        engineScreenshot: 'PENDING',
        performance: 'PENDING',
        humanApproval: 'PENDING',
      },
    };
    const at = manifest.assets.findIndex((a) => a.assetId === assetId);
    if (at >= 0) manifest.assets[at] = entry;
    else manifest.assets.push(entry);
    console.log(assetId, triangles);
  }
manifest.assets.sort((a, b) => a.assetId.localeCompare(b.assetId));
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
