import { basis, clamp, cross, easeInOut, length, mul, normalize, rotationX, rotationY, rotationZ, scale, scaling, sub, transformPoint, translation, type Mat4, type Vec3 } from '../engine/math';
import { Pattern, type DrawItem, type MeshName } from '../engine/renderer';
import { pawSweepPoint } from '../levels/puppy/mechanics';

const GOLD = [0.69, 0.36, 0.12], HONEY = [0.91, 0.60, 0.28], CREAM = [0.99, 0.84, 0.60];
const DARK = [0.035, 0.022, 0.019], PINK = [0.97, 0.25, 0.39];
export type PuppyPose = 'idle' | 'walk' | 'lick' | 'pounce' | 'paw' | 'happy';
export interface PuppyContact { pos: Vec3; radius: number; kind: 'body' | 'paw' | 'tail' }

/** Rounded, procedural golden retriever; +z is its nose. No external assets. */
export class Puppy {
  pos: Vec3 = [0, 0, -10.5];
  yaw = 0;
  physicalRoot: { pos: Vec3; yaw: number } | null = null;
  physicalPaws: Vec3[] | null = null;
  physicalTail: Vec3[] | null = null;
  time = 0;
  pose: PuppyPose = 'idle';
  charge = 0;
  tongue = 0;
  airborne = 0;
  pawSide = 1;
  stroke = 0;
  pawSweep = 0;
  jumpPhase = 0;
  private gait = 0;
  private stride = 0;
  private oldPos: Vec3 = [0, 0, -10.5];
  private oldYaw = 0;
  private bow = 0;
  private nod = 0;
  private paw = 0;
  private blinkClock = 1;
  private nextBlink = 2.8;
  private barkClock = 1;

  bark() { this.barkClock = 0; }

  animate(dt: number) {
    this.blinkClock += dt; this.barkClock += dt;
    if (this.time > this.nextBlink) { this.blinkClock = 0; this.nextBlink = this.time + 2.8 + Math.random() * 2.6; }
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
    this.oldPos = [...this.pos]; this.oldYaw = this.yaw;
  }

  get forward(): Vec3 { return [Math.sin(this.yaw), 0, Math.cos(this.yaw)]; }

  private rootFrame(physical = false) {
    if (physical && this.physicalRoot) return mul(translation(this.physicalRoot.pos), rotationY(this.physicalRoot.yaw));
    const jump = this.airborne > 0.1 ? Math.sin(this.jumpPhase * Math.PI) : 0;
    return mul(translation([this.pos[0], this.pos[1] + this.airborne, this.pos[2]]), rotationY(this.yaw), rotationX(jump * Math.sin(this.jumpPhase * Math.PI * 2) * -0.16));
  }

  private pawPosition(side: number, front: number): Vec3 {
    const phase = ((this.gait / (Math.PI * 2) + (side * front > 0 ? 0 : 0.5)) % 1 + 1) % 1;
    const stance = phase < 0.62, t = stance ? phase / 0.62 : (phase - 0.62) / 0.38;
    const lift = stance ? 0 : Math.sin(t * Math.PI) * this.stride * 0.46;
    const swing = (stance ? 0.7 - t * 1.4 : -0.7 + easeInOut(t) * 1.4) * this.stride;
    const swipe = front > 0 && side === this.pawSide ? this.paw : 0;
    const jump = this.airborne > 0.1 ? Math.sin(this.jumpPhase * Math.PI) : 0;
    const arc = pawSweepPoint(this.pawSide, this.pawSweep);
    return [side * 1.05 * (1 - swipe) + arc[0] * swipe, (0.30 + lift + jump * 0.6) * (1 - swipe) + arc[1] * swipe, (front * 1.25 + swing + jump * front * 0.45) * (1 - swipe) + arc[2] * swipe];
  }

  private tailFrame(root: Mat4) {
    const light = easeInOut(clamp((this.pos[2] + 9.8) / 4.3, 0, 1));
    const bounce = (1 - Math.cos(this.gait * 2)) * this.stride * 0.045;
    return mul(root, translation([0, 2.25 + bounce, -2.0]), rotationY(Math.sin(this.time * 8) * 0.65), rotationX(-1.1 + light * 0.35));
  }

  /** Physics follows the very same paw and tail transforms as the visible model. */
  contactPoints(): PuppyContact[] {
    const root = this.rootFrame(), tail = this.tailFrame(root);
    const points: PuppyContact[] = [
      { pos: transformPoint(root, [0, 1.8 - this.bow * 0.3, -0.8]), radius: 1.35, kind: 'body' },
      { pos: transformPoint(root, [0, 1.6 - this.bow, 0.8]), radius: 1.2, kind: 'body' },
    ];
    for (const side of [-1, 1]) for (const front of [-1, 1]) points.push({ pos: transformPoint(root, this.pawPosition(side, front)), radius: 0.58, kind: 'paw' });
    for (const z of [-1.1, -2.0]) points.push({ pos: transformPoint(tail, [0, 0.15, z]), radius: 0.4, kind: 'tail' });
    return points;
  }

  draw(out: DrawItem[]) {
    const wag = Math.sin(this.time * 8);
    const bark = Math.sin(clamp(this.barkClock / 0.32, 0, 1) * Math.PI);
    const blink = Math.sin(clamp(this.blinkClock / 0.2, 0, 1) * Math.PI);
    const bow = this.bow;
    const breath = Math.sin(this.time * 2.3) * 0.04;
    const bounce = (1 - Math.cos(this.gait * 2)) * this.stride * 0.045;
    const jump = this.airborne > 0.1 ? Math.sin(this.jumpPhase * Math.PI) : 0;
    const root = this.rootFrame(true);
    // Darkness is local to the vault. The same mesh gradually acquires light as it walks out.
    const light = easeInOut(clamp((this.pos[2] + 9.8) / 4.3, 0, 1));
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
        const swipe = front > 0 && side === this.pawSide ? this.paw : 0;
        const hip: Vec3 = [side * 1.03, 1.9 + bounce - bow * (front > 0 ? 1 : 0.5), front * 1.25 - 0.2];
        let foot = this.pawPosition(side, front);
        const solved = this.physicalPaws?.[(side === -1 ? 0 : 2) + (front === -1 ? 0 : 1)];
        if (solved) {
          const x = solved[0] - root[12], y = solved[1] - root[13], z = solved[2] - root[14];
          foot = [root[0] * x + root[1] * y + root[2] * z, root[4] * x + root[5] * y + root[6] * z, root[8] * x + root[9] * y + root[10] * z];
        }
        const knee: Vec3 = [side * 1.05 + swipe * side * 0.45, (hip[1] + foot[1]) / 2 + swipe * 0.15, (hip[2] + foot[2]) / 2 - 0.23];
        bone(root, hip, knee, 0.34, HONEY); bone(root, knee, foot, 0.28, HONEY);
        shape('sphere', root, foot, [0.59, 0.33, 0.71], CREAM);
        for (const toe of [-0.22, 0, 0.22]) shape('sphere', root, [foot[0] + toe, foot[1] - 0.05, foot[2] + 0.55], [0.075, 0.07, 0.09], GOLD);
      }
    }
    const head = mul(root, translation([0, 2.65 - bow - this.nod * 0.4 + breath + bounce + bark * 0.07, 1.55]), rotationX(this.nod - bark * 0.12), rotationZ(Math.sin(this.time * 1.7) * 0.04));
    shape('sphere', head, [0, 0, 0], [1.38, 1.28, 1.16], HONEY);
    for (const s of [-1, 1]) {
      const ear = mul(head, translation([s * 1.18, 0.05, -0.08]), rotationZ(s * (0.12 + wag * 0.06 + jump * 0.32 + bark * 0.08)));
      shape('sphere', ear, [s * 0.12, -0.56, 0], [0.49, 1.0, 0.51], GOLD);
      const eye = mul(head, translation([s * 0.58, 0.26, 0.97]), scaling([1, 1 - blink * light * 0.96, 1]));
      shape('sphere', eye, [0, 0, 0], [0.32, 0.38, 0.18], CREAM);
      shape('sphere', eye, [0, -0.03, 0.15], [0.18, 0.25, 0.10], DARK);
      shape('sphere', eye, [-0.045, 0.06, 0.235], [0.055, 0.075, 0.025], [1, 1, 1]);
      if (light < 0.98) {
        out.push({ mesh: 'sphere', model: mul(head, translation([s * 0.58, 0.23, 1.215]), scaling([0.24, 0.19, 0.035])), color: [1 - light, (1 - light) * 0.42, (1 - light) * 0.025], pattern: Pattern.emissive });
        out.push({ mesh: 'sphere', model: mul(head, translation([s * 0.58, 0.23, 1.26]), scaling([0.07, 0.17, 0.02])), color: [0, 0, 0], pattern: Pattern.emissive });
      }
      shape('sphere', head, [s * 0.45, -0.38, 1.05], [0.66, 0.51, 0.63], CREAM);
      shape('roundbox', head, [s * 0.59, 0.80 + bark * 0.08, 0.87], [0.55, 0.15, 0.19], GOLD);
      // Upturned mouth corners and a soft lower jaw keep the barks visibly playful.
      shape('sphere', head, [s * 0.66, -0.59, 1.30], [0.15, 0.18, 0.13], DARK);
    }
    shape('sphere', head, [0, -0.19, 1.58], [0.46, 0.30, 0.29], DARK);
    shape('sphere', head, [0, -0.79 - bark * 0.1, 1.08], [0.76, 0.35 + bark * 0.22, 0.49], DARK);
    shape('sphere', head, [0, -1.02 - bark * 0.3, 1.02], [0.64, 0.18, 0.45], CREAM);
    // Tongue curls visibly upward at the release, connecting the wind-up to the launch.
    const reach = this.tongue, flick = this.stroke;
    // A curved ribbon built along a cubic Bezier: extend low, curl up, then retract along the same path.
    const p0: Vec3 = [0, -0.84 - bark * 0.16, 1.28];
    const pant = Math.sin(this.time * 5) * 0.035 * (1 - reach);
    const p1: Vec3 = [0, -0.88, 1.42 + reach * 0.58];
    const p2: Vec3 = [0, -0.99 + pant + flick * 0.65, 1.50 + reach * 1.5];
    const p3: Vec3 = [0, -1.10 + pant + flick * 2.76, 1.54 + reach * 2.01 - flick * 0.25];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, s = 1 - t;
      const p = p0.map((_, a) => s ** 3 * p0[a] + 3 * s * s * t * p1[a] + 3 * s * t * t * p2[a] + t ** 3 * p3[a]) as Vec3;
      const tangent = normalize(p0.map((_, a) => 3 * s * s * (p1[a] - p0[a]) + 6 * s * t * (p2[a] - p1[a]) + 3 * t * t * (p3[a] - p2[a])) as Vec3);
      const up: Vec3 = [0, tangent[2], -tangent[1]];
      const frame = mul(head, basis([1, 0, 0], up, tangent, p));
      shape('sphere', frame, [0, 0, 0], [(0.24 + reach * 0.11) - t * 0.05, 0.055, 0.055 + reach * 0.125], PINK);
    }
    // Broad teal collar and a brass tag help the reveal read as a pet immediately.
    const collar = mul(root, translation([0, 2.1 - bow + bounce, 1.21]), rotationX(Math.PI / 2));
    shape('cylinder', collar, [0, 0, 0], [1.4, 0.31, 1.25], [0.035, 0.42, 0.42]);
    shape('sphere', root, [0, 1.2 - bow * 0.7 + bounce, 2.01], [0.32, 0.39, 0.1], [1, 0.71, 0.17]);
    const tail = this.tailFrame(root);
    if (this.physicalTail) {
      bone(translation([0, 0, 0]), transformPoint(root, [0, 2.25 + bounce, -2]), this.physicalTail[0], 0.38, HONEY);
      bone(translation([0, 0, 0]), this.physicalTail[0], this.physicalTail[1], 0.35, CREAM);
    } else {
      shape('sphere', tail, [0, 0.15, -0.95], [0.38, 0.42, 1.45], HONEY);
      shape('sphere', tail, [0, 0.15, -2.0], [0.37, 0.4, 0.58], CREAM);
    }
  }
}
