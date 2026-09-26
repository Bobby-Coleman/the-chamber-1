import { clamp, mul, scaling, translation } from '../engine/math';
import { RAPIER, type Physics } from '../engine/physics';
import { Pattern, type DrawItem } from '../engine/renderer';
import { REAR_PIT } from '../levels/puppy/mechanics';

/** Telescoping steel floor withdraws toward the back wall after the puppy clears it. */
export class VaultBridge {
  retraction = 0;
  private collider: RAPIER.Collider;
  constructor(physics: Physics) {
    this.collider = physics.addStaticBox([0, -0.16, REAR_PIT.z], [REAR_PIT.width, 0.32, REAR_PIT.depth]);
  }
  update(retraction: number) {
    this.retraction = clamp(retraction, 0, 1);
    const depth = REAR_PIT.depth * (1 - this.retraction);
    this.collider.setEnabled(depth > 0.02);
    if (depth > 0.02) {
      this.collider.setShape(new RAPIER.Cuboid(REAR_PIT.width / 2, 0.16, depth / 2));
      this.collider.setTranslation({ x: 0, y: -0.16, z: REAR_PIT.z - REAR_PIT.depth * this.retraction / 2 });
    }
  }
  supports(x: number, z: number) {
    return this.retraction < 0.997 && Math.abs(x) <= REAR_PIT.width / 2 && z >= REAR_PIT.z - REAR_PIT.depth / 2 && z <= REAR_PIT.z + REAR_PIT.depth / 2 - REAR_PIT.depth * this.retraction;
  }
  draw(out: DrawItem[]) {
    const depth = REAR_PIT.depth * (1 - this.retraction);
    if (depth < 0.02) return;
    const z = REAR_PIT.z - REAR_PIT.depth * this.retraction / 2;
    out.push({ mesh: 'box', model: mul(translation([0, -0.16, z]), scaling([REAR_PIT.width, 0.32, depth])), color: [0.12, 0.15, 0.18], pattern: Pattern.panels, param: 1 });
    out.push({ mesh: 'box', model: mul(translation([0, 0.015, z + depth / 2 - 0.08]), scaling([REAR_PIT.width, 0.035, 0.16])), color: [0.9, 0.37, 0.02] });
  }
}
