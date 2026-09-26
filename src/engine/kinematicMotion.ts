import { lerp3, type Quat, type Vec3 } from './math';
import type { Physics, RAPIER } from './physics';

/** Spread machine animation across fixed physics steps instead of one velocity spike per frame. */
export class KinematicMotion {
  private from: Vec3;
  private to: Vec3;
  private fromRotation: Quat;
  private toRotation: Quat;
  private elapsed = 0;
  private duration = 1;
  constructor(physics: Physics, readonly body: RAPIER.RigidBody) {
    const p = body.translation(); this.from = this.to = [p.x, p.y, p.z];
    this.fromRotation = this.toRotation = body.rotation();
    physics.substepHooks.push(h => this.step(h));
  }
  move(pos: Vec3, dt: number, rotation = this.body.rotation()) {
    const p = this.body.translation(); this.from = [p.x, p.y, p.z]; this.to = pos;
    this.fromRotation = this.body.rotation(); this.toRotation = rotation;
    this.elapsed = 0; this.duration = Math.max(dt, 1 / 120);
  }
  private step(h: number) {
    this.elapsed += h;
    const t = Math.min(1, this.elapsed / this.duration), p = lerp3(this.from, this.to, t);
    this.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
    const a = this.fromRotation, b = this.toRotation;
    const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
    const q = { x: a.x * (1 - t) + b.x * sign * t, y: a.y * (1 - t) + b.y * sign * t, z: a.z * (1 - t) + b.z * sign * t, w: a.w * (1 - t) + b.w * sign * t };
    const length = Math.hypot(q.x, q.y, q.z, q.w);
    this.body.setNextKinematicRotation({ x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length });
  }
}
