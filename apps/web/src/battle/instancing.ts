import {
  BUFFER_DYNAMIC,
  BoundingBox,
  Entity,
  Mat4,
  Quat,
  Vec3,
  VertexBuffer,
  VertexFormat,
  type AppBase,
  type StandardMaterial,
} from 'playcanvas';

/**
 * Pieza de soldado dibujada con instancing por hardware (G0-06, ADR-0030):
 * todos los soldados de un tipo de pieza y material en UNA llamada de dibujo.
 * Los soldados son solo visuales; la simulación es por formación.
 */
export class InstancedPart {
  readonly entity: Entity;
  private readonly vb: VertexBuffer;
  private readonly data: Float32Array;
  private count = 0;
  private readonly m = new Mat4();
  private readonly q = new Quat();
  private readonly p = new Vec3();
  private readonly s = new Vec3();

  constructor(
    app: AppBase,
    type: 'box' | 'capsule' | 'sphere' | 'cylinder' | 'cone',
    material: StandardMaterial,
    private readonly capacity: number,
    castShadows = true,
  ) {
    this.entity = new Entity(`inst-${type}`);
    this.entity.addComponent('render', { type, material, castShadows, receiveShadows: true });
    this.data = new Float32Array(capacity * 16);
    this.vb = new VertexBuffer(
      app.graphicsDevice,
      VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),
      capacity,
      {
        usage: BUFFER_DYNAMIC,
        data: this.data,
      },
    );
    const mi = this.entity.render!.meshInstances[0]!;
    mi.setInstancing(this.vb);
    mi.instancingCount = 0;
    // Las instancias se reparten por todo el campo: AABB fija del escenario.
    mi.cull = false;
    mi.setCustomAabb?.(new BoundingBox(new Vec3(100, 0, 70), new Vec3(150, 30, 120)));
    app.root.addChild(this.entity);
  }

  begin(): void {
    this.count = 0;
  }

  /** Añade una instancia (posición en metros, giro en grados alrededor de Y, escala por eje). */
  push(
    x: number,
    y: number,
    z: number,
    yawDeg: number,
    sx: number,
    sy: number,
    sz: number,
    pitchDeg = 0,
  ): void {
    if (this.count >= this.capacity) return;
    this.q.setFromEulerAngles(pitchDeg, yawDeg, 0);
    this.m.setTRS(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.data.set(this.m.data, this.count * 16);
    this.count++;
  }

  end(): void {
    this.vb.setData(this.data);
    this.entity.render!.meshInstances[0]!.instancingCount = this.count;
  }

  get instances(): number {
    return this.count;
  }

  destroy(): void {
    this.entity.destroy();
    this.vb.destroy();
  }
}
