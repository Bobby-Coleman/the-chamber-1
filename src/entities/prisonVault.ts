import { mul, rotationZ, scaling, translation, type Vec3 } from '../engine/math';
import type { Physics, RAPIER } from '../engine/physics';
import { Pattern, type DrawItem } from '../engine/renderer';

const METAL = [0.075, 0.09, 0.105], EDGE = [0.21, 0.24, 0.26], BLACK = [0.003, 0.004, 0.006];

/** A roofed, 16m-wide prison embedded against the north wall. */
export class PrisonVault {
  open = 0;
  private gates: RAPIER.Collider[] = [];
  private scenery: DrawItem[] = [];
  constructor(physics: Physics) {
    const box = (p: Vec3, size: Vec3, color: number[], collider = true) => {
      this.scenery.push({ mesh: 'box', model: mul(translation(p), scaling(size)), color });
      if (collider) physics.addStaticBox(p, size);
    };
    box([-7.6, 4.5, -10.1], [1.2, 9, 7.4], METAL);
    box([7.6, 4.5, -10.1], [1.2, 9, 7.4], METAL);
    box([0, 8.85, -10.1], [16.4, 0.75, 7.8], METAL);
    box([0, 4.4, -13.7], [15, 8.7, 0.4], BLACK);
    box([0, 8.1, -6.28], [16.1, 1.0, 0.75], EDGE);
    box([-7.9, 4.0, -6.35], [0.48, 8, 0.8], EDGE);
    box([7.9, 4.0, -6.35], [0.48, 8, 0.8], EDGE);
    box([0, 0.08, -10.1], [14.3, 0.15, 7.5], BLACK, false);
    // Bolted faceplate, inset panels, floor anchors and external hydraulic pistons.
    for (const s of [-1, 1]) {
      box([s * 8.0, 0.22, -5.8], [1.45, 0.44, 1.7], METAL);
      box([s * 6.85, 4.0, -6.0], [0.45, 7.4, 0.5], EDGE);
      for (let y = 0.6; y < 8.5; y += 1.05) this.scenery.push({ mesh: 'sphere', model: mul(translation([s * 7.87, y, -5.88]), scaling([0.115, 0.115, 0.075])), color: [0.4, 0.42, 0.43], spec: 0.8 });
    }
    for (let x = -6; x <= 6; x += 1.0) this.scenery.push({ mesh: 'box', model: mul(translation([x, 7.72, -5.88]), rotationZ(-0.5), scaling([0.30, 0.38, 0.06])), color: [0.70, 0.43, 0.06] });
    // Four telescoping sections retract sideways into the thick door pockets.
    for (const x of [-5.25, -1.75, 1.75, 5.25]) this.gates.push(physics.addStaticBox([x, 3.8, -6.45], [3.5, 7.6, 0.3]));
    for (const s of [-1, 1]) box([s * 9.45, 4.0, -6.65], [3.25, 8.0, 0.65], METAL);
  }

  update(open: number) {
    this.open = open;
    this.gates.forEach((gate, i) => {
      const from = [-5.25, -1.75, 1.75, 5.25][i];
      gate.setTranslation({ x: from + (Math.sign(from) * 9.4 - from) * open, y: 3.8, z: -6.45 - (i % 2) * 0.2 });
    });
  }

  draw(out: DrawItem[], time: number) {
    out.push(...this.scenery);
    // Solid darkness conceals the silhouette from every normal viewing angle until release.
    out.push({ mesh: 'box', model: mul(translation([0, 3.75, -9.9]), scaling([14, 7.45, 0.06])), color: [0, 0, 0], pattern: Pattern.emissive });
    for (const [i, from] of [-5.25, -1.75, 1.75, 5.25].entries()) {
      const x = from + (Math.sign(from) * 9.4 - from) * this.open;
      const z = -6.3 - (i % 2) * 0.2;
      for (let off = -1.4; off <= 1.5; off += 0.7) out.push({ mesh: 'cylinder', model: mul(translation([x + off, 3.8, z]), scaling([0.13, 7.6, 0.13])), color: EDGE, spec: 0.65 });
      for (const y of [0.25, 3.0, 7.25]) out.push({ mesh: 'box', model: mul(translation([x, y, z]), scaling([3.5, 0.22, 0.25])), color: EDGE });
    }
    for (const s of [-1, 1]) {
      out.push({ mesh: 'sphere', model: mul(translation([s * 7.5, 8.75, -5.9]), scaling([0.22, 0.20, 0.14])), color: [0.9 + Math.sin(time * 5) * 0.1, 0.015, 0.008], pattern: Pattern.emissive });
    }
  }
}
