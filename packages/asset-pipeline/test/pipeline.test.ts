import { readFileSync } from 'node:fs';
import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { assetEntrySchema, assetManifestSchema, inspectDocument } from '../src/index.js';

/** Caja de w×h×d con la base en y=0 (o desplazada) y material PBR. */
function boxDoc(w: number, h: number, d: number, yOffset = 0): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const x = w / 2;
  const z = d / 2;
  const y0 = yOffset;
  const y1 = yOffset + h;
  const positions = new Float32Array([
    -x,
    y0,
    -z,
    x,
    y0,
    -z,
    x,
    y1,
    -z,
    -x,
    y1,
    -z,
    -x,
    y0,
    z,
    x,
    y0,
    z,
    x,
    y1,
    z,
    -x,
    y1,
    z,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5,
    6, 1, 6, 2,
  ]);
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
    .setMaterial(
      doc
        .createMaterial('piedra')
        .setBaseColorFactor([0.6, 0.6, 0.55, 1])
        .setRoughnessFactor(0.8)
        .setMetallicFactor(0),
    );
  const mesh = doc.createMesh('caja').addPrimitive(prim);
  const node = doc.createNode('caja').setMesh(mesh);
  doc.createScene('escena').addChild(node);
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]!);
  return doc;
}

describe('inspección GLB', () => {
  it('acepta un edificio en metros con pivote en la base', async () => {
    const r = await inspectDocument(boxDoc(8, 6, 8), { kind: 'building' });
    expect(r.triangles).toBe(12);
    expect(r.problems).toEqual([]);
  });

  it('detecta pivote desplazado, escala absurda y animaciones ausentes', async () => {
    const r = await inspectDocument(boxDoc(800, 600, 800, 50), {
      kind: 'unit',
      animations: ['idle', 'walk'],
    });
    expect(r.problems.join('|')).toMatch(/escala sospechosa/);
    expect(r.problems.join('|')).toMatch(/pivote/);
    expect(r.problems.join('|')).toMatch(/falta animación idle/);
  });
});

describe('manifest de assets', () => {
  it('el manifest del cliente es válido', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('../../../apps/web/public/assets/manifest.json', import.meta.url),
        'utf8',
      ),
    );
    expect(assetManifestSchema.safeParse(raw).success).toBe(true);
  });

  it('APPROVED exige GLB, licencia verificada, validaciones PASS y clips de unidad', () => {
    const res = assetEntrySchema.safeParse({
      assetId: 'imperial_infantry',
      kind: 'unit',
      status: 'APPROVED',
      file: 'assets/optimized/imperial_infantry.glb',
      source: {
        workflow: 'IA asistida + Blender',
        provider: 'local',
        author: 'equipo',
        license: 'REQUIRED_BEFORE_APPROVAL',
      },
      validation: {
        geometry: 'PASS',
        materials: 'PASS',
        engineScreenshot: 'PENDING',
        performance: 'PASS',
        humanApproval: 'PASS',
      },
      animations: ['idle', 'walk'],
    });
    expect(res.success).toBe(false);
    const msgs = res.error!.issues.map((i) => i.message).join('|');
    expect(msgs).toMatch(/licencia verificada/);
    expect(msgs).toMatch(/engineScreenshot = PENDING/);
    expect(msgs).toMatch(/animación attack/);
    expect(msgs).toMatch(/miniatura/);
  });

  it('BLOCKOUT no exige nada (es explícitamente provisional)', () => {
    expect(
      assetEntrySchema.safeParse({
        assetId: 'farm',
        kind: 'building',
        status: 'BLOCKOUT',
        file: null,
      }).success,
    ).toBe(true);
  });
});
