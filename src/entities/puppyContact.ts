import { clamp, type Vec3 } from '../engine/math';
import { RAPIER, type Physics } from '../engine/physics';
import type { Player } from '../game/player';
import type { Puppy, PuppyContact } from './puppy';

/** Animation-driven, solid shapes: small bumps push; fast turns and wags knock you down. */
export class PuppyContactBody {
  private bodies: RAPIER.RigidBody[];
  private previous: PuppyContact[];
  constructor(physics: Physics, puppy: Puppy) {
    this.previous = puppy.contactPoints();
    this.bodies = this.previous.map(p => {
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...p.pos));
      physics.world.createCollider(RAPIER.ColliderDesc.ball(p.radius).setFriction(0.15).setRestitution(0), body);
      return body;
    });
  }
  update(puppy: Puppy, player: Player, dt: number, canKnock: boolean): boolean {
    const points = puppy.contactPoints();
    let impact: Vec3 | null = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], old = this.previous[i].pos;
      const velocity: Vec3 = p.pos.map((n, axis) => (n - old[axis]) / Math.max(dt, 0.001)) as Vec3;
      const speed = Math.hypot(...velocity);
      // A reset/QA teleport isn't a 1000 m/s attack.
      if (speed > 35) this.bodies[i].setTranslation({ x: p.pos[0], y: p.pos[1], z: p.pos[2] }, false);
      this.bodies[i].setNextKinematicTranslation({ x: p.pos[0], y: p.pos[1], z: p.pos[2] });
      if (!canKnock || speed > 35 || player.mode !== 'control' || player.gettingUp || player.stun > 0 || player.knockProtection > 0) continue;
      const dx = player.pos[0] - p.pos[0], dz = player.pos[2] - p.pos[2], distance = Math.hypot(dx, dz);
      const y = player.pos[1] + (p.kind === 'paw' ? 0.35 : 0.9);
      if (distance > p.radius + 0.55 || Math.abs(y - p.pos[1]) > p.radius + 0.6) continue;
      const nx = distance > 0.01 ? dx / distance : puppy.forward[0];
      const nz = distance > 0.01 ? dz / distance : puppy.forward[2];
      const into = velocity[0] * nx + velocity[2] * nz;
      if (into > 1.4) {
        const force = clamp(4 + into * 0.85, 5, 10);
        impact = [nx * force, 2.4, nz * force];
      }
    }
    this.previous = points;
    if (!impact) return false;
    player.knock(impact, 0.22);
    player.knockProtection = 1.2;
    return true;
  }
}
