import { basis, clamp, cross, easeInOut, length, mul, normalize, rotationX, rotationY, rotationZ, scale, scaling, sub, translation, type Mat4, type Vec3 } from '../engine/math';
import { Pattern, type DrawItem, type MeshName } from '../engine/renderer';

const GOLD = [0.69, 0.36, 0.12], HONEY = [0.91, 0.60, 0.28], CREAM = [0.99, 0.84, 0.60];
const DARK = [0.035, 0.022, 0.019], PINK = [0.97, 0.25, 0.39];
export type PuppyPose = 'idle' | 'walk' | 'lick' | 'pounce' | 'tail' | 'paw' | 'happy';

/** Rounded, procedural golden retriever; +z is its nose. No external assets. */
export class Puppy {
  pos: Vec3 = [0, 0, -9.5];
  yaw = 0;
  time = 0;
  pose: PuppyPose = 'idle';
  charge = 0;
  tongue = 0;
  airborne = 0;
  pawSide = 1;
  stroke = 0;
  private gait = 0;
  private stride = 0;
  private oldPos: Vec3 = [0, 0, -9.5];
  private oldYaw = 0;
  private bow = 0;
  private nod = 0;
  private paw = 0;
  private tailPower = 0;

  animate(dt: number) {
    const distance = Math.hypot(this.pos[0] - this.oldPos[0], this.pos[2] - this.oldPos[2]);
    const turn = Math.abs(Math.atan2(Math.sin(this.yaw - this.oldYaw), Math.cos(this.yaw - this.oldYaw)));
    const stepping = this.airborne < 0.1 && (this.pose === 'walk' || this.pose === 'idle');
    const travel = stepping ? Math.min(distance, dt * 5) + turn * 0.9 : 0;
    this.gait += travel * 2.7;
    const k = 1 - Math.exp(-dt * 9);
    this.stride += (clamp(travel / Math.max(0.001, dt) / 2.1, 0, 1) - this.stride) * k;
    this.bow += ((this.pose === 'pounce' ? this.charge * 0.9 : 0) - this.bow) * k;
    this.nod += ((this.pose === 'lick' ? this.charge * 0.5 - this.stroke * 0.65 : 0) - this.nod) * k;
    this.paw += ((this.pose === 'paw' ? this.charge : 0) - this.paw) * (1 - Math.exp(-dt * 15));
    this.tailPower += ((this.pose === 'tail' ? 1 : 0) - this.tailPower) * k;
    this.oldPos = [...this.pos]; this.oldYaw = this.yaw;
  }

  get forward(): Vec3 { return [Math.sin(this.yaw), 0, Math.cos(this.yaw)]; }

  draw(out: DrawItem[]) {
    const wag = Math.sin(this.time * 6);
    const bow = this.bow;
    const breath = Math.sin(this.time * 2.3) * 0.04;
    const bounce = (1 - Math.cos(this.gait * 2)) * this.stride * 0.045;
    const root = mul(translation([this.pos[0], this.pos[1] + this.airborne, this.pos[2]]), rotationY(this.yaw));
    // Darkness is local to the vault. The same mesh gradually acquires light as it walks out.
    const light = easeInOut(clamp((this.pos[2] + 9.1) / 3.6, 0, 1));
    const shape = (mesh: MeshName, frame: Mat4, pos: Vec3, size: Vec3, color: number[]) => {
      out.push({ mesh, model: mul(frame, translation(pos), scaling(size)), color: light < 1 ? color.map(c => c * light) : color, pattern: light < 0.02 ? Pattern.emissive : Pattern.plain, spec: 0.12 * light });
    };
    const bone = (frame: Mat4, a: Vec3, b: Vec3, radius: number, color: number[]) => {
      const axis = normalize(sub(b, a));
      const u = normalize(cross(Math.abs(axis[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0], axis));
      const w = cross(u, axis);
      const centre: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      out.push({ mesh: 'sphere', model: mul(frame, basis(scale(u, radius), scale(axis, length(sub(b, a)) / 2 + radius * 0.7), scale(w, radius), centre)), color: color.map(c => c * light), pattern: light < 0.02 ? Pattern.emissive : Pattern.plain });
    };
    shape('sphere', root, [0, 2.0 + breath + bounce - bow * 0.32, -0.3], [1.5, 1.45 - bow * 0.10, 2.05], GOLD);
    shape('sphere', root, [0, 1.75 - bow + bounce, 1.0], [1.32, 1.28, 1.16], HONEY);
    shape('sphere', root, [0, 1.4 - bow, 1.8], [0.96, 0.99, 0.39], CREAM);
    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        const phase = this.gait + (side * front > 0 ? 0 : Math.PI);
        const lift = Math.max(0, Math.sin(phase)) * this.stride * 0.4;
        const swing = Math.cos(phase) * this.stride * 0.52;
        const swipe = front > 0 && side === this.pawSide ? this.paw : 0;
        const hip: Vec3 = [side * 1.03, 1.9 + bounce - bow * (front > 0 ? 1 : 0.5), front * 1.25 - 0.2];
        const foot: Vec3 = [side * (1.05 + swipe * 0.6), 0.30 + lift + swipe * 1.7, front * 1.25 + swing + swipe * 2.4];
        const knee: Vec3 = [side * 1.05, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2 - 0.23];
        bone(root, hip, knee, 0.34, HONEY); bone(root, knee, foot, 0.28, HONEY);
        shape('sphere', root, foot, [0.54, 0.30, 0.64], CREAM);
        for (const toe of [-0.22, 0, 0.22]) shape('sphere', root, [foot[0] + toe, foot[1] - 0.05, foot[2] + 0.55], [0.075, 0.07, 0.09], GOLD);
      }
    }
    const head = mul(root, translation([0, 2.65 - bow - this.nod * 0.4 + breath + bounce, 1.55]), rotationX(this.nod), rotationZ(Math.sin(this.time * 1.7) * 0.025));
    shape('sphere', head, [0, 0, 0], [1.38, 1.28, 1.16], HONEY);
    for (const s of [-1, 1]) {
      const ear = mul(head, translation([s * 1.18, 0.05, -0.08]), rotationZ(s * (0.12 + wag * 0.06)));
      shape('sphere', ear, [s * 0.12, -0.56, 0], [0.49, 1.0, 0.51], GOLD);
      shape('sphere', head, [s * 0.58, 0.26, 0.97], [0.32, 0.40, 0.18], CREAM);
      shape('sphere', head, [s * 0.58, 0.23, 1.12], [0.18, 0.25, 0.10], DARK);
      shape('sphere', head, [s * 0.58 - 0.045, 0.32, 1.205], [0.055, 0.075, 0.025], [1, 1, 1]);
      if (light < 0.98) {
        out.push({ mesh: 'sphere', model: mul(head, translation([s * 0.58, 0.23, 1.215]), scaling([0.24, 0.19, 0.035])), color: [1 - light, (1 - light) * 0.42, (1 - light) * 0.025], pattern: Pattern.emissive });
        out.push({ mesh: 'sphere', model: mul(head, translation([s * 0.58, 0.23, 1.26]), scaling([0.07, 0.17, 0.02])), color: [0, 0, 0], pattern: Pattern.emissive });
      }
      shape('sphere', head, [s * 0.45, -0.38, 1.05], [0.66, 0.51, 0.63], CREAM);
      shape('roundbox', head, [s * 0.59, 0.80, 0.87], [0.55, 0.15, 0.19], GOLD);
    }
    shape('sphere', head, [0, -0.19, 1.58], [0.46, 0.30, 0.29], DARK);
    shape('sphere', head, [0, -0.75, 0.98], [0.71, 0.37, 0.49], DARK);
    // Tongue curls visibly upward at the release, connecting the wind-up to the launch.
    const reach = this.tongue, flick = this.stroke;
    // A curved ribbon built along a cubic Bezier: extend low, curl up, then retract along the same path.
    const p0: Vec3 = [0, -0.74, 1.28];
    const p1: Vec3 = [0, -0.90, 1.65 + reach * 0.35];
    const p2: Vec3 = [0, -1.05 + flick * 0.65, 1.9 + reach * 1.1];
    const p3: Vec3 = [0, -0.94 + flick * 2.6, 1.9 + reach * 1.65 - flick * 0.25];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, s = 1 - t;
      const p = p0.map((_, a) => s ** 3 * p0[a] + 3 * s * s * t * p1[a] + 3 * s * t * t * p2[a] + t ** 3 * p3[a]) as Vec3;
      const tangent = normalize(p0.map((_, a) => 3 * s * s * (p1[a] - p0[a]) + 6 * s * t * (p2[a] - p1[a]) + 3 * t * t * (p3[a] - p2[a])) as Vec3);
      const up: Vec3 = [0, tangent[2], -tangent[1]];
      const frame = mul(head, basis([1, 0, 0], up, tangent, p));
      shape('sphere', frame, [0, 0, 0], [0.35 - t * 0.05, 0.065, 0.18], PINK);
    }
    // Broad teal collar and a brass tag help the reveal read as a pet immediately.
    const collar = mul(root, translation([0, 2.1 - bow + bounce, 1.21]), rotationX(Math.PI / 2));
    shape('cylinder', collar, [0, 0, 0], [1.4, 0.31, 1.25], [0.035, 0.42, 0.42]);
    shape('sphere', root, [0, 1.2 - bow * 0.7 + bounce, 2.01], [0.32, 0.39, 0.1], [1, 0.71, 0.17]);
    const tail = mul(root, translation([0, 2.25 + bounce, -2.0]), rotationY(wag * (0.65 + this.tailPower * 0.7)), rotationX(-0.75));
    shape('sphere', tail, [0, 0.15, -0.95], [0.38, 0.42, 1.45], HONEY);
    shape('sphere', tail, [0, 0.15, -2.0], [0.37, 0.4, 0.58], CREAM);
  }
}
