import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import { assetManifestSchema, type AssetEntry, type AssetManifest } from './manifest.js';
import { inspectDocument } from './inspect.js';

/**
 * Optimización + validación + publicación (pasos 8–10 del pipeline, ver
 * docs/visual-redesign/ASSET_PIPELINE.md). Lee los GLB exportados por
 * tools/asset-gen (`assets/build/*.glb` + `assets/reports/*.json`), los optimiza
 * de forma reproducible, los inspecciona y los publica en
 * `apps/web/public/assets/models/`, actualizando el manifiesto central.
 *
 * Nunca marca APPROVED: sin revisión humana el estado máximo es PENDING_REVIEW.
 *
 * Uso: tsx src/publish.ts <raíz-del-repo>
 */

interface BuildReport {
  assetId: string;
  kind: AssetEntry['kind'];
  type: string;
  civilization?: 'imperial_crown' | 'sea_league';
  visualStage?: 1 | 2 | 3;
  variant?: number;
  triangles: number[];
  materials: string[];
  dimensionsMeters: [number, number, number];
  problems: string[];
  generator: string;
  previews?: string[];
  animations?: string[];
  belowGroundOk?: boolean;
  facing?: 'plaza' | 'outward';
}

const OUTWARD = new Set(['port']);
const BELOW_GROUND = new Set(['port', 'quarry', 'mine', 'palisade', 'ship_cog', 'ship_galley']);

export async function optimizeGlb(input: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.readBinary(input);
  // En mallas con esqueleto la cuantización de posición se traslada a las matrices de
  // enlace inverso: válido, pero impide verificar límites y pivote. Se deja en float.
  const skinned = doc.getRoot().listSkins().length > 0;
  await doc.transform(
    // Los materiales exportados son idénticos (sin texturas) y solo se distinguen por el
    // nombre, que el cliente usa para asignar el material compartido: no se deduplican.
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    weld(),
    // Las UV están en metros (fuera de [0,1]) y el cliente sustituye los materiales:
    // se cuantizan posición, normal y color, no TEXCOORD (evita KHR_texture_transform).
    quantize({
      pattern: skinned ? /^(NORMAL|COLOR_0)$/ : /^(POSITION|NORMAL|COLOR_0)$/,
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeColor: 8,
    }),
    // Las texturas se asignan en el cliente: conservar UV y color aunque ningún material los use aquí.
    prune({ keepAttributes: true }),
  );
  return io.writeBinary(doc);
}

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? '../..');
  const buildDir = join(root, 'assets', 'build');
  const reportDir = join(root, 'assets', 'reports');
  const publicDir = join(root, 'apps', 'web', 'public');
  const modelsDir = join(publicDir, 'assets', 'models');
  const manifestPath = join(publicDir, 'assets', 'manifest.json');
  await mkdir(modelsDir, { recursive: true });

  const library = JSON.parse(
    await readFile(join(publicDir, 'assets', 'materials', 'library.json'), 'utf8'),
  ) as { materials: Record<string, unknown> };
  const libraryNames = new Set(Object.keys(library.materials));
  const manifest = assetManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  ) as AssetManifest;
  const byId = new Map(manifest.assets.map((a) => [a.assetId, a]));

  const files = (await readdir(buildDir)).filter((f) => f.endsWith('.glb')).sort();
  let totalIn = 0;
  let totalOut = 0;
  let failures = 0;
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  for (const file of files) {
    const id = basename(file, '.glb');
    const report = JSON.parse(await readFile(join(reportDir, `${id}.json`), 'utf8')) as BuildReport;
    const raw = new Uint8Array(await readFile(join(buildDir, file)));
    const out = await optimizeGlb(raw);
    const rel = `assets/models/${id}.glb`;
    await writeFile(join(publicDir, rel), out);
    totalIn += raw.byteLength;
    totalOut += out.byteLength;

    const belowGroundOk = report.kind === 'prop' || BELOW_GROUND.has(report.type);
    const inspection = await inspectDocument(
      await io.readBinary(out),
      { kind: report.kind, animations: [], belowGroundOk },
      out.byteLength,
      { materialLibrary: libraryNames, requireAttributes: true },
    );
    const problems = [...report.problems, ...inspection.problems];
    for (const clip of report.animations ?? [])
      if (!inspection.animations.includes(clip))
        problems.push(`clip ${clip} ausente en el GLB publicado`);
    const expected = new Set(report.materials);
    const got = new Set(inspection.materialNames);
    if (expected.size !== got.size || [...expected].some((m) => !got.has(m)))
      problems.push(
        `materiales publicados ${[...got].join(',')} ≠ exportados ${[...expected].join(',')}`,
      );
    if (problems.length) failures++;
    const previous = byId.get(id);
    const entry: AssetEntry = {
      assetId: id,
      kind: report.kind,
      type: report.type,
      status:
        previous?.status === 'APPROVED' && problems.length === 0 ? 'APPROVED' : 'PENDING_REVIEW',
      file: rel,
      civilization: report.civilization,
      visualStage: report.visualStage,
      units: 'meters',
      lodCount: inspection.trianglesPerLod.length,
      ...(inspection.animations.length ? { animations: inspection.animations } : {}),
      ...(report.kind === 'building'
        ? { facing: OUTWARD.has(report.type) ? ('outward' as const) : ('plaza' as const) }
        : {}),
      belowGroundOk,
      triangles: inspection.trianglesPerLod,
      materials: inspection.materialNames,
      dimensionsMeters: report.dimensionsMeters,
      bytes: out.byteLength,
      thumbnail:
        report.previews?.[0]?.replace(/^assets\//, '../../assets/') ?? previous?.thumbnail ?? null,
      version:
        (previous?.version ?? 0) +
        (previous && previous.bytes !== out.byteLength ? 1 : previous ? 0 : 1),
      source: {
        workflow: 'tools/asset-gen (Blender bpy) → glTF Transform → validación',
        provider: 'generación procedural propia',
        author: 'Reinos de la Frontera (scripts del repositorio)',
        license: 'Propia del proyecto',
        createdAt: new Date().toISOString().slice(0, 10),
      },
      validation: {
        geometry: problems.length === 0 ? 'PASS' : 'FAIL',
        materials: inspection.problems.some((p) => p.includes('material')) ? 'FAIL' : 'PASS',
        engineScreenshot: previous?.validation?.engineScreenshot ?? 'PENDING',
        performance: inspection.problems.some((p) => /triángulos|tamaño|textura/.test(p))
          ? 'FAIL'
          : 'PASS',
        humanApproval: previous?.validation?.humanApproval ?? 'PENDING',
      },
    };
    byId.set(id, entry);
    const tag = problems.length ? 'WARN' : 'OK  ';
    console.log(
      `[${tag}] ${id}: ${inspection.trianglesPerLod.join('/')} tris · ${(raw.byteLength / 1024).toFixed(0)} → ${(out.byteLength / 1024).toFixed(0)} KB`,
    );
    for (const p of problems) console.log(`       - ${p}`);
  }

  // Los tipos con variantes publicadas ya no necesitan su entrada BLOCKOUT genérica.
  const typesWithVariants = new Set(
    [...byId.values()].filter((a) => a.type && a.file).map((a) => a.type!),
  );
  // La muralla genérica se sustituye por sus piezas modulares.
  if (typesWithVariants.has('wall_segment')) typesWithVariants.add('wall');
  for (const [id, a] of byId)
    if (a.status === 'BLOCKOUT' && typesWithVariants.has(id)) byId.delete(id);

  const next: AssetManifest = {
    ...manifest,
    assets: [...byId.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)),
  };
  assetManifestSchema.parse(next);
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `Publicados ${files.length} GLB: ${(totalIn / 1048576).toFixed(1)} MB → ${(totalOut / 1048576).toFixed(1)} MB; con avisos: ${failures}`,
  );
}

await main();
