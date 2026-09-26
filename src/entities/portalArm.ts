import { basis, cross, length, mul, normalize, rotationY, scale, scaling, sub, toQuat, translation, type Vec3 } from '../engine/math';
import { RAPIER, type Physics } from '../engine/physics';
import { Pattern, type DrawItem } from '../engine/renderer';
import { KinematicMotion } from '../engine/kinematicMotion';

const STEEL = [0.16, 0.20, 0.25], PLATE = [0.39, 0.45, 0.49], ORANGE = [0.88, 0.37, 0.055];

function armPoints(centre: Vec3, radius: number) {
  return { base: [-13.35, 14.2, -1.8] as Vec3, elbow: [-5.8 + centre[0] * 0.36, 20.8, 0] as Vec3, wrist: [centre[0], centre[1] - 0.08, centre[2] - radius - 0.32] as Vec3 };
}
function armBeams(centre: Vec3, radius: number) {
  const { base, elbow, wrist } = armPoints(centre, radius);
  return [
    { a: base, b: elbow, width: 0.8, depth: 0.95 },
    { a: elbow, b: wrist, width: 0.65, depth: 0.8 },
    { a: [base[0] + 0.3, base[1] - 1.4, base[2] + 0.6] as Vec3, b: [elbow[0] - 1.1, elbow[1] - 0.4, elbow[2] + 0.6] as Vec3, width: 0.20, depth: 0.20 },
  ].map(({ a, b, width, depth }) => {
    const y = normalize(sub(b, a)), x = normalize(cross([0, 0, 1], y)), z = cross(x, y);
    const pos: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return { pos, rotation: toQuat(basis(x, y, z, pos)), half: [width / 2, length(sub(b, a)) / 2, depth / 2] as Vec3 };
  });
}

/** One compound kinematic body: real rim contacts can catch individual ragdoll limbs. */
export class PortalRim {
  private body: RAPIER.RigidBody;
  private underside: RAPIER.Collider;
  private motion: KinematicMotion;
  private arms: { motion: KinematicMotion; collider: RAPIER.Collider }[];
  private joints: KinematicMotion[];
  private radius: number;
  constructor(physics: Physics, centre: Vec3, radius: number) {
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...centre));
    this.radius = radius;
    this.motion = new KinematicMotion(physics, this.body);
    physics.addStaticBox([-13.35, 9.15, -1.8], [1.05, 10.3, 1.6]);
    for (const y of [4.5, 8.5]) physics.addStaticBox([-13.6, y, -1.8], [0.8, 1.1, 2.6]);
    this.arms = armBeams(centre, radius).map(p => {
      const rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...p.pos).setRotation(p.rotation));
      const collider = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(...p.half).setFriction(0.3), rb);
      return { motion: new KinematicMotion(physics, rb), collider };
    });
    this.joints = Object.values(armPoints(centre, radius)).map(p => {
      const rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...p));
      physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.625, 0.72).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }), rb);
      return new KinematicMotion(physics, rb);
    });
    this.underside = physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.075, radius).setTranslation(0, -0.11, 0).setRestitution(0.15), this.body);
    this.underside.setEnabled(false);
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      const collider = RAPIER.ColliderDesc.cuboid(0.24, 0.18, 0.26)
        .setTranslation(Math.sin(a) * (radius + 0.24), -0.04, Math.cos(a) * (radius + 0.24))
        .setRotation(toQuat(rotationY(a))).setFriction(0.6).setRestitution(0.25);
      physics.world.createCollider(collider, this.body);
    }
  }
  move(centre: Vec3, dt = 1 / 60) {
    this.motion.move(centre, dt);
    armBeams(centre, this.radius).forEach((p, i) => {
      this.arms[i].collider.setShape(new RAPIER.Cuboid(...p.half));
      this.arms[i].motion.move(p.pos, dt, p.rotation);
    });
    Object.values(armPoints(centre, this.radius)).forEach((p, i) => this.joints[i].move(p, dt));
  }
  setUndersideSolid(solid: boolean) { this.underside.setEnabled(solid); }
}

/** Articulated portal emitter, bolted to the west wall. Its wrist carries the ring at its edge. */
export function drawPortalArm(out: DrawItem[], centre: Vec3, radius: number, time: number) {
  const box = (p: Vec3, size: Vec3, color: number[]) => out.push({ mesh: 'box', model: mul(translation(p), scaling(size)), color, spec: 0.45 });
  const beam = (a: Vec3, b: Vec3, width: number, depth: number, color: number[]) => {
    const y = normalize(sub(b, a)), x = normalize(cross([0, 0, 1], y)), z = cross(x, y);
    out.push({ mesh: 'box', model: basis(scale(x, width), scale(y, length(sub(b, a))), scale(z, depth), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), color, spec: 0.55 });
  };
  const { base, elbow, wrist } = armPoints(centre, radius);
  box([-13.35, 9.15, -1.8], [1.05, 10.3, 1.6], STEEL);
  for (const y of [4.5, 8.5]) box([-13.6, y, -1.8], [0.8, 1.1, 2.6], PLATE);
  for (let y = 5; y < 14; y += 1.8) box([-12.79, y, -1.8], [0.12, 0.26, 1.75], ORANGE);
  beam(base, elbow, 0.8, 0.95, STEEL);
  beam(elbow, wrist, 0.65, 0.8, PLATE);
  beam([base[0] + 0.3, base[1] - 1.4, base[2] + 0.6], [elbow[0] - 1.1, elbow[1] - 0.4, elbow[2] + 0.6], 0.20, 0.20, [0.64, 0.67, 0.7]);
  for (const p of [base, elbow, wrist]) {
    out.push({ mesh: 'cylinder', model: basis([0.72, 0, 0], [0, 0, 1.25], [0, 0.72, 0], p), color: STEEL, spec: 0.7 });
    out.push({ mesh: 'cylinder', model: basis([0.36, 0, 0], [0, 0, 0.10], [0, 0.36, 0], [p[0], p[1], p[2] + 0.68]), color: ORANGE, spec: 0.5 });
  }
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, r = radius + 0.24;
    const p: Vec3 = [centre[0] + Math.cos(a) * r, centre[1] - 0.04, centre[2] + Math.sin(a) * r];
    out.push({ mesh: 'box', model: basis([-Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], [0, 0.36, 0], [Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52], p), color: i % 6 === 0 ? PLATE : STEEL, spec: 0.65 });
    const inner: Vec3 = [centre[0] + Math.cos(a) * (radius + 0.02), centre[1] + 0.12, centre[2] + Math.sin(a) * (radius + 0.02)];
    out.push({ mesh: 'sphere', model: mul(translation(inner), scaling([0.10, 0.08, 0.10])), color: [0.68, 0.14, 1], pattern: Pattern.emissive, shadow: false });
    if (i % 6 === 0) out.push({ mesh: 'sphere', model: mul(translation([p[0], p[1] - 0.23, p[2]]), scaling([0.13, 0.06, 0.13])), color: [0.6 + Math.sin(time * 3) * 0.08, 0.12, 1], pattern: Pattern.emissive, shadow: false });
  }
}
