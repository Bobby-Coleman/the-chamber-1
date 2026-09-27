import { clamp, type Vec3 } from '../engine/math';
import { RAPIER, type Physics } from '../engine/physics';
import type { Puppy } from './puppy';
import type { Player } from '../game/player';

const DOG_GROUP = (8 << 16) | (0xffff & ~8);
/** Massive dynamic torso and lighter dynamic paws/tail, moved with bounded forces at 120 Hz. */
export class PuppyContactBody {
  readonly body: RAPIER.RigidBody;
  private limbs: RAPIER.RigidBody[];
  private target: Vec3;
  private velocity: Vec3 = [0, 0, 0];
  private yaw = 0;
  private limbTargets: Vec3[];
  private incoming = new Map<RAPIER.RigidBody, Vec3>();
  private separationTime = 0;
  constructor(private physics: Physics, private puppy: Puppy) {
    this.target = [...puppy.pos];
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...puppy.pos).enabledRotations(false, true, false).setAngularDamping(4).setCcdEnabled(true));
    for (const [z, y, radius] of [[-0.8, 1.8, 1.35], [0.8, 1.6, 1.2]]) physics.world.createCollider(RAPIER.ColliderDesc.ball(radius).setTranslation(0, y, z).setMass(180).setFriction(0.15).setRestitution(0).setCollisionGroups(DOG_GROUP), this.body);
    physics.world.createCollider(RAPIER.ColliderDesc.ball(1.05).setTranslation(0, 2.65, 1.55).setMass(60).setFriction(0.1).setCollisionGroups(DOG_GROUP), this.body);
    physics.contactActors.add(this.body);
    const points = puppy.contactPoints().slice(2);
    this.limbTargets = points.map(p => p.pos);
    this.limbs = points.map(p => {
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p.pos).lockRotations().setCcdEnabled(true));
      const shape = p.kind === 'paw' ? RAPIER.ColliderDesc.roundCuboid(0.44, 0.19, 0.55, 0.12) : RAPIER.ColliderDesc.ball(0.35);
      physics.world.createCollider(shape.setMass(p.kind === 'paw' ? 32 : 5).setFriction(0.12).setRestitution(0).setCollisionGroups(DOG_GROUP), body);
      physics.contactActors.add(body); return body;
    });
    physics.substepHooks.push(h => {
      if (this.separationTime > 0) {
        this.separationTime = Math.max(0, this.separationTime - h);
        if (this.separationTime === 0) this.playerContacts(true);
      }
      this.drive();
    });
    physics.postStepHooks.push(() => {
      const p = this.body.translation(), q = this.body.rotation();
      puppy.physicalRoot = { pos: [p.x, p.y, p.z], yaw: Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)) };
      puppy.physicalPaws = this.limbs.slice(0, 4).map(b => { const p = b.translation(); return [p.x, p.y, p.z] as Vec3; });
      puppy.physicalTail = this.limbs.slice(4).map(b => { const p = b.translation(); return [p.x, p.y, p.z] as Vec3; });
    });
  }
  update(puppy: Puppy, dt: number) {
    const next: Vec3 = [puppy.pos[0], puppy.pos[1] + puppy.airborne, puppy.pos[2]];
    const solved = this.body.translation();
    // Locomotion is planned from the solved root. Differentiating last frame's
    // target here fed residual drift back into the motor indefinitely.
    const origin = puppy.pose === 'walk' || puppy.pose === 'idle' || puppy.pose === 'happy'
      ? [solved.x, this.target[1], solved.z] : this.target;
    this.velocity = next.map((n, i) => clamp((n - origin[i]) / Math.max(dt, 1 / 120), -12, 12)) as Vec3;
    this.target = next;
    this.yaw = puppy.yaw;
    this.limbTargets = puppy.contactPoints().slice(2).map(p => p.pos);
  }
  /** Authoring / test reset only. Gameplay never teleports the dynamic dog. */
  resetToPose() {
    this.target = [this.puppy.pos[0], this.puppy.pos[1] + this.puppy.airborne, this.puppy.pos[2]];
    this.velocity = [0, 0, 0]; this.yaw = this.puppy.yaw;
    this.body.setTranslation({ x: this.target[0], y: this.target[1], z: this.target[2] }, true);
    this.body.setRotation({ x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.limbTargets = this.puppy.contactPoints().slice(2).map(p => p.pos);
    this.limbs.forEach((body, i) => { const p = this.limbTargets[i]; body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true); body.setLinvel({ x: 0, y: 0, z: 0 }, true); });
  }

  /** Read back the solved root before planning the next locomotion step. */
  sync() {
    const p = this.body.translation();
    this.puppy.pos[0] = p.x; this.puppy.pos[2] = p.z;
  }
  /** Only an actual moving attack contact earns a shove; proximity never does. */
  attackContact(player: Player): Vec3 | null {
    if (!player.body?.isEnabled) return null;
    let fastest: Vec3 | null = null, speed = 2.2;
    for (const actor of [this.body, ...this.limbs.slice(0, 4)]) {
      const v = this.incoming.get(actor);
      if (!v || Math.hypot(...v) <= speed) continue;
      for (let i = 0; i < actor.numColliders(); i++) this.physics.world.contactPairsWith(actor.collider(i), other => {
        if (!player.body!.owns(other)) return;
        this.physics.world.contactPair(actor.collider(i), other, manifold => {
          if (!manifold.numSolverContacts() && !manifold.numContacts()) return;
          fastest = v; speed = Math.hypot(...v);
        });
      });
    }
    return fastest;
  }
  /** Brief separation after a confirmed hit avoids crushing the outgoing ragdoll. */
  separateAfterHit() { this.separationTime = 0.3; this.playerContacts(false); }
  private playerContacts(enabled: boolean) {
    for (const body of [this.body, ...this.limbs]) for (let i = 0; i < body.numColliders(); i++) {
      body.collider(i).setCollisionGroups(enabled ? DOG_GROUP : DOG_GROUP & ~0x0002);
    }
  }
  private force(body: RAPIER.RigidBody, target: Vec3, stiffness: number, damping: number, velocity: Vec3 = [0, 0, 0]) {
    const p = body.translation(), v = body.linvel(), mass = body.mass();
    const values = [p.x, p.y, p.z], speeds = [v.x, v.y, v.z];
    const a = target.map((n, i) => clamp((n - values[i]) * stiffness + (velocity[i] - speeds[i]) * damping + (i === 1 ? 20 : 0), -100, 100));
    body.resetForces(true); body.addForce({ x: a[0] * mass, y: a[1] * mass, z: a[2] * mass }, true);
  }
  private drive() {
    for (const b of [this.body, ...this.limbs]) { const v = b.linvel(); this.incoming.set(b, [v.x, v.y, v.z]); }
    this.force(this.body, this.target, 110, 22, this.velocity);
    const q = this.body.rotation(), yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const error = Math.atan2(Math.sin(this.yaw - yaw), Math.cos(this.yaw - yaw));
    this.body.resetTorques(true); this.body.addTorque({ x: 0, y: clamp(error * 18000 - this.body.angvel().y * 6500, -16000, 16000), z: 0 }, true);
    this.limbs.forEach((body, i) => this.force(body, this.limbTargets[i], 300, 26));
  }
}
