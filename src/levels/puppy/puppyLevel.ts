import { add, approachAngle, clamp, easeInOut, lerp, lerp3, mul, normalize, rotationY, scaling, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem, type Environment } from '../../engine/renderer';
import { drawPortal, PORTAL_SQUEEZE_TIME, PortalArrival } from '../../entities/portal';
import { PrisonVault } from '../../entities/prisonVault';
import { Button } from '../../entities/props';
import { Puppy } from '../../entities/puppy';
import { drawPortalArm, PortalRim } from '../../entities/portalArm';
import { preparePuppyAudio, puppySound } from '../../entities/puppyAudio';
import { type CameraShot, type Level, type LevelContext, type LevelStatus, type WorldLabel } from '../level';
import { FLIGHT_GRAVITY, HOOP_RADIUS, HOOP_Y, HOOP_Z, hoopCrossing, hoopX, inPit, LICK_WINDUP, lickVelocity, PAW_SWEEP_TIME, PAW_WINDUP, pawSweepPoint, PITS, rimImpact } from './mechanics';

type Phase = 'sealed' | 'opening' | 'reveal' | 'play' | 'escape' | 'dead';
type Move = 'chase' | 'lick' | 'paw' | 'pounce' | 'tail' | 'recover';
/** Pressure, dodge, opportunity. Close-range play must not collapse into an endless lick loop. */
const ATTACK_CYCLE: readonly Move[] = ['pounce', 'paw', 'lick', 'pounce', 'paw', 'pounce', 'lick'];
const BUTTON: Vec3 = [0, 0, 4.6];
const ENV: Environment = {
  sunDir: [0.3, 1, 0.5], sunColor: [1.65, 1.53, 1.4], skyColor: [0.22, 0.29, 0.4],
  groundColor: [0.19, 0.18, 0.20], fogColor: [0.35, 0.42, 0.52], fogDensity: 0.003,
};

/** Level 4: the monster is friendly. Its affection is not remotely safe. */
export class PuppyLevel implements Level {
  readonly number = 4;
  readonly title = 'Good Boy';
  readonly chamber = { pits: PITS, halfSize: 14 };
  status: LevelStatus = 'playing';
  private arrival: PortalArrival;
  private vault: PrisonVault;
  private rim: PortalRim;
  private puppy = new Puppy();
  private phase: Phase = 'sealed';
  private phaseTime = 0;
  private time = 0;
  private hoopTime = 0;
  private move: Move = 'chase';
  private moveTime = 0;
  private attackHit = false;
  private recoverTime = 1.4;
  private target: Vec3 = [0, 0, 0];
  private pounceStart: Vec3 = [0, 0, 0];
  private flight: Vec3 | null = null;
  private flightTime = 0;
  private jumpAge = 10;
  private immunity = 0;
  private attempts = 0;
  private perfectLaunch = false;
  private scenery: DrawItem[] = [];
  private dogSpeed = 0;
  private attackIndex = 0;
  private flightYaw = 0;
  private flightViewBlend = 0;
  private flightCamera: CameraShot | null = null;
  private landingCameraTime = 0;
  private highFlight = false;
  private bodyObstacle = [{ x: 0, z: -10.5, r: 1.85 }];
  private approachTarget: Vec3 = [0, 0, -3.4];
  private approachLook: Vec3 = [0, 0, 0];
  private pawStart: Vec3 = [0, 0, 0];
  private tumbling = false;
  private tumbleTime = 0;
  private settledTime = 0;
  private pitCamera: CameraShot | null = null;
  private pounceWindup = 0.72;
  private pounceAirtime = 0.5;
  private nextBark = 3;

  constructor(private ctx: LevelContext) {
    ctx.hud.setLevel('The Chamber · Level 4');
    ctx.hud.hint('');
    this.arrival = new PortalArrival(ctx, [0, 0, 6.5]);
    this.vault = new PrisonVault(ctx.physics);
    this.rim = new PortalRim(ctx.physics, [hoopX(0), HOOP_Y, HOOP_Z], HOOP_RADIUS);
    new Button(ctx.physics, BUTTON, [0.87, 0.045, 0.018], () => this.release());
    this.buildRoom();
    preparePuppyAudio();
  }

  private buildRoom() {
    const box = (p: Vec3, size: Vec3, color: number[], emissive = false) => this.scenery.push({ mesh: 'box', model: mul(translation(p), scaling(size)), color, pattern: emissive ? Pattern.emissive : Pattern.plain });
    for (const p of PITS) {
      // A deep shaft with progressively darker walls, rather than a shallow black tray.
      box([p.x, -38, p.z], [p.width, 0.1, p.depth], [0, 0, 0], true);
      for (const s of [-1, 1]) {
        this.ctx.physics.addStaticBox([p.x + s * (p.width / 2 + 0.06), -18, p.z], [0.12, 36, p.depth]);
        this.ctx.physics.addStaticBox([p.x, -18, p.z + s * (p.depth / 2 + 0.06)], [p.width, 36, 0.12]);
        for (let depth = 0; depth < 36; depth += 3) {
          const shade = 0.12 * Math.exp(-depth / 5);
          box([p.x + s * p.width / 2, -depth - 1.5, p.z], [0.12, 3.04, p.depth], [shade, shade * 1.1, shade * 1.3], true);
          box([p.x, -depth - 1.5, p.z + s * p.depth / 2], [p.width, 3.04, 0.12], [shade, shade * 1.1, shade * 1.3], true);
        }
        // Steel lips, inset retaining ribs and low lamps give a visible sense of scale/depth.
        box([p.x + s * p.width / 2, -0.18, p.z], [0.18, 0.36, p.depth], [0.19, 0.23, 0.28]);
        box([p.x, -0.18, p.z + s * p.depth / 2], [p.width, 0.36, 0.18], [0.19, 0.23, 0.28]);
        for (let z = -p.depth / 2 + 1; z < p.depth / 2; z += 3) {
          box([p.x + s * (p.width / 2 - 0.04), -2.5, p.z + z], [0.1, 4.8, 0.14], [0.06, 0.08, 0.1], true);
          box([p.x + s * (p.width / 2 - 0.1), -2.2, p.z + z], [0.06, 0.14, 0.26], [0.16, 0.25, 0.32], true);
        }
        box([p.x + s * (p.width / 2 + 0.1), 0.025, p.z], [0.20, 0.05, p.depth + 0.4], [0.93, 0.43, 0.025], true);
        box([p.x, 0.025, p.z + s * (p.depth / 2 + 0.1)], [p.width, 0.05, 0.20], [0.93, 0.43, 0.025], true);
        box([p.x + s * p.width / 2, -1.1, p.z], [0.04, 0.08, p.depth], [0.7, 0.02, 0.01], true);
        for (let z = -p.depth / 2; z < p.depth / 2; z += 0.42) box([p.x + s * (p.width / 2 + 0.1), 0.054, p.z + z], [0.21, 0.015, 0.15], [0.035, 0.035, 0.035]);
      }
    }
    // Floor marks offer a natural approach toward the vault without spelling out the puzzle.
    for (let z = -4; z <= 3; z += 1.2) box([-3.8, 0.014, z], [0.06, 0.025, 0.65], [0.28, 0.31, 0.34]);
    for (let z = -4; z <= 3; z += 1.2) box([3.8, 0.014, z], [0.06, 0.025, 0.65], [0.28, 0.31, 0.34]);
  }

  private release() {
    if (this.phase !== 'sealed' || !this.arrival.done) return;
    this.phase = 'opening'; this.phaseTime = 0;
    this.ctx.hud.hint('Containment released. Probably a perfectly reasonable decision.');
  }

  update(dt: number) {
    const { player, input } = this.ctx;
    this.time += dt;
    this.phaseTime += dt;
    this.jumpAge += dt;
    if (input.wasPressed('Space') && player.mode === 'control' && !player.gettingUp && player.stun <= 0 && player.pos[1] < 1.4) this.jumpAge = 0;
    this.immunity = Math.max(0, this.immunity - dt);
    this.landingCameraTime = Math.max(0, this.landingCameraTime - dt);
    this.puppy.time = this.time;
    this.puppy.animate(dt);
    this.arrival.update(dt);
    const beforeHoop = this.hoopTime;
    if (this.phase !== 'escape') this.hoopTime += dt;
    this.rim.move([hoopX(this.hoopTime), HOOP_Y, HOOP_Z]);
    this.updatePitCamera();
    if (this.phase === 'dead') {
      if (this.phaseTime > 1.2) this.status = 'lost';
      return;
    }
    if (this.phase === 'escape') {
      this.puppy.pose = 'happy';
      if (this.phaseTime > PORTAL_SQUEEZE_TIME + 0.7) this.status = 'exited';
      return;
    }
    if (this.tumbling) this.updateTumble(dt);
    else if (this.flight) this.updateFlight(dt, beforeHoop);
    else if (player.pos[1] < -1.8) this.die();
    if (this.phase === 'dead' as Phase || this.phase === 'escape' as Phase) return;
    switch (this.phase) {
      case 'sealed': break;
      case 'opening':
        this.vault.update(easeInOut(clamp((this.phaseTime - 0.3) / 2.8, 0, 1)));
        if (this.phaseTime > 3.2) { this.phase = 'reveal'; this.phaseTime = 0; }
        break;
      case 'reveal': {
        const k = easeInOut(clamp(this.phaseTime / 4.4, 0, 1));
        this.puppy.pos[2] = lerp(-10.5, -3.4, k);
        this.puppy.pose = this.phaseTime < 4.4 ? 'walk' : 'happy';
        if (this.phaseTime - dt < 2.8 && this.phaseTime >= 2.8) this.ctx.hud.hint('“Oh. A puppy. Aw, that’s not so bad.”');
        if (this.phaseTime > 4.9) { this.phase = 'play'; this.phaseTime = 0; this.setMove('chase'); this.ctx.hud.hint(''); }
        break;
      }
      case 'play': this.updateBoss(dt); break;
    }
  }

  private setMove(move: Move) {
    this.move = move; this.moveTime = 0; this.attackHit = false;
    this.puppy.charge = 0; this.puppy.tongue = 0; this.puppy.stroke = 0; this.puppy.airborne = 0; this.puppy.pawSweep = 0;
    this.puppy.jumpPhase = 0;
    this.dogSpeed = 0;
    if (move === 'chase') this.planApproach();
    if (move === 'paw') this.pawStart = [...this.puppy.pos];
    if (move === 'pounce') {
      this.pounceWindup = 0.48 + Math.random() * 0.4;
      this.pounceAirtime = 0.44 + Math.random() * 0.1;
    }
  }

  private bark() { this.puppy.bark(); puppySound('bark'); }

  private updatePitCamera() {
    const { player, camera } = this.ctx;
    const height = this.flight || this.tumbling ? 0.9 : -0.15;
    if (!this.pitCamera && this.arrival.done && player.pos[1] < height && inPit(player.pos[0], player.pos[2])) {
      const from = camera.pos ?? add(player.pos, [0.6, 3.2, 3.1]);
      this.pitCamera = {
        pos: [clamp(from[0], -13.5, 13.5), Math.max(3.2, from[1]), clamp(from[2], -13.5, 13.5)],
        target: [player.pos[0], -2, player.pos[2]], sharpness: 7,
      };
    }
    if (this.pitCamera) this.pitCamera.target = [player.pos[0], Math.max(-7, player.pos[1] + 0.8), player.pos[2]];
  }

  /** Pick a short run once, then commit. The dog does not continuously home in on the player. */
  private planApproach() {
    const dog = this.puppy, p = this.ctx.player.pos;
    const d = normalize([p[0] - dog.pos[0], 0, p[2] - dog.pos[2]]);
    const side = this.attackIndex % 2 === 0 ? 1 : -1;
    const scheduled = ATTACK_CYCLE[this.attackIndex % ATTACK_CYCLE.length];
    this.approachLook = [...p];
    this.approachTarget = scheduled === 'pounce'
      ? [dog.pos[0] + d[2] * side * 1.2 + d[0] * 0.8, 0, dog.pos[2] - d[0] * side * 1.2 + d[2] * 0.8]
      : [p[0] - d[0] * 3.8, 0, p[2] - d[2] * 3.8];
    this.approachTarget[0] = clamp(this.approachTarget[0], -5.8, 5.8);
    this.approachTarget[2] = clamp(this.approachTarget[2], -3.4, 5.0);
  }

  private turnDog(yaw: number, dt: number) {
    const dog = this.puppy;
    const delta = Math.atan2(Math.sin(yaw - dog.yaw), Math.cos(yaw - dog.yaw));
    dog.yaw += clamp(delta, -3.8 * dt, 3.8 * dt);
    return Math.abs(delta);
  }

  private localPlayer() {
    const p = this.ctx.player.pos, dog = this.puppy, f = dog.forward;
    const dx = p[0] - dog.pos[0], dz = p[2] - dog.pos[2];
    return { side: dx * f[2] - dz * f[0], front: dx * f[0] + dz * f[2], distance: Math.hypot(dx, dz) };
  }

  private beginAttack(move: Move) {
    const { player } = this.ctx;
    const local = this.localPlayer();
    if (move === 'pounce') {
      this.target = [clamp(player.pos[0], -5.0, 5.0), 0, clamp(player.pos[2], -2.2, 4.4)];
      this.pounceStart = [...this.puppy.pos];
    } else if (move === 'paw') {
      this.puppy.pawSide = Math.abs(local.side) > 0.5 ? Math.sign(local.side) : this.attackIndex % 2 === 0 ? 1 : -1;
      if (local.front < -0.7) move = 'tail';
    }
    this.attackIndex++;
    this.setMove(move);
  }

  private updateBoss(dt: number) {
    const { player, camera } = this.ctx;
    const dog = this.puppy;
    this.moveTime += dt;
    this.nextBark -= dt;
    if (this.nextBark <= 0 && (this.move === 'chase' || this.move === 'recover')) {
      this.bark(); this.nextBark = 3.5 + Math.random() * 3;
    }
    const local = this.localPlayer();
    const grounded = !this.flight && player.mode === 'control' && player.pos[1] < 2.5;
    switch (this.move) {
      case 'chase': {
        dog.pose = 'walk';
        if (!grounded || this.immunity > 0 || player.gettingUp) { dog.pose = 'happy'; break; }
        const scheduled = ATTACK_CYCLE[this.attackIndex % ATTACK_CYCLE.length];
        // A rear approach can provoke a sweep, while the overall pattern still advances.
        if (local.distance < 5.0 && local.front < -0.7 && this.moveTime > 0.6) { this.beginAttack('tail'); break; }
        const dx = this.approachTarget[0] - dog.pos[0], dz = this.approachTarget[2] - dog.pos[2];
        const remaining = Math.hypot(dx, dz);
        if (remaining > 0.20 && this.moveTime < 1.4) {
          const angle = this.turnDog(Math.atan2(dx, dz), dt);
          const desired = angle < 0.8 ? Math.min(4.2, remaining * 5) : 0;
          this.dogSpeed += (desired - this.dogSpeed) * (1 - Math.exp(-dt * 9));
          const f = dog.forward, travel = Math.min(remaining, this.dogSpeed * dt);
          dog.pos[0] += f[0] * travel; dog.pos[2] += f[2] * travel;
        } else {
          dog.pose = 'idle';
          const angle = this.turnDog(Math.atan2(this.approachLook[0] - dog.pos[0], this.approachLook[2] - dog.pos[2]), dt);
          if (this.moveTime > 0.7 && (angle < 0.15 || this.moveTime > 2.1)) {
            this.beginAttack(local.distance > 7 ? 'pounce' : scheduled);
          }
        }
        break;
      }
      case 'lick': {
        dog.pose = 'lick'; dog.charge = clamp(this.moveTime / LICK_WINDUP, 0, 1);
        // Tracking ends early enough that the player can deliberately align with the tongue.
        if (this.moveTime < 0.55) dog.yaw = approachAngle(dog.yaw, Math.atan2(player.pos[0] - dog.pos[0], player.pos[2] - dog.pos[2]), dt * 2.5);
        const retract = 1 - easeInOut(clamp((this.moveTime - LICK_WINDUP - 0.24) / 0.48, 0, 1));
        dog.tongue = easeInOut(clamp((this.moveTime - 0.45) / 0.75, 0, 1)) * retract;
        dog.stroke = easeInOut(clamp((this.moveTime - LICK_WINDUP + 0.18) / 0.36, 0, 1)) * retract;
        if (this.moveTime >= LICK_WINDUP && !this.attackHit) {
          this.attackHit = true;
          const hit = this.localPlayer();
          if (grounded && this.immunity <= 0 && hit.front > 1.3 && hit.front < 5.4 && Math.abs(hit.side) < 1.85) {
            const result = lickVelocity(hit.side, dog.forward, this.jumpAge);
            puppySound('lick'); this.launch(result.velocity, result.perfect);
          }
        }
        if (this.moveTime > LICK_WINDUP + 0.78) { this.recoverTime = 1.35; this.setMove('recover'); }
        break;
      }
      case 'paw': {
        dog.pose = 'paw';
        if (this.moveTime < 0.28) this.turnDog(Math.atan2(player.pos[0] - dog.pos[0], player.pos[2] - dog.pos[2]), dt);
        const sweep = clamp((this.moveTime - PAW_WINDUP) / PAW_SWEEP_TIME, 0, 1);
        dog.charge = this.moveTime < PAW_WINDUP ? easeInOut(this.moveTime / PAW_WINDUP) : 1 - easeInOut(clamp((this.moveTime - PAW_WINDUP - PAW_SWEEP_TIME) / 0.35, 0, 1));
        dog.pawSweep = sweep;
        const f = dog.forward, lunge = easeInOut(sweep) * 0.75;
        dog.pos[0] = this.pawStart[0] + f[0] * lunge; dog.pos[2] = this.pawStart[2] + f[2] * lunge;
        if (this.moveTime >= PAW_WINDUP && this.moveTime <= PAW_WINDUP + PAW_SWEEP_TIME && !this.attackHit) {
          const hit = this.localPlayer(), arc = pawSweepPoint(dog.pawSide, sweep);
          if (grounded && Math.hypot(hit.side - arc[0], hit.front - arc[2]) < 1.05 && this.immunity <= 0) {
            this.attackHit = true;
            const side = -dog.pawSide;
            this.bark();
            this.launch([f[2] * side * 10 + f[0] * 2, 7, -f[0] * side * 10 + f[2] * 2], false);
          }
        }
        if (this.moveTime > PAW_WINDUP + PAW_SWEEP_TIME + 0.4) { this.recoverTime = 1.6; this.setMove('recover'); }
        break;
      }
      case 'tail': {
        dog.pose = 'tail'; dog.charge = clamp(this.moveTime / 1.0, 0, 1);
        if (this.moveTime >= 1.0 && !this.attackHit) {
          this.attackHit = true;
          if (grounded && local.front < 0.7 && local.distance < 5.4 && player.pos[1] < 0.65 && this.immunity <= 0) {
            const f = dog.forward, s = local.side >= 0 ? 1 : -1;
            this.launch([f[2] * s * 9, 6.5, -f[0] * s * 9], false);
          }
        }
        if (this.moveTime > 1.45) { this.recoverTime = 1.5; this.setMove('recover'); }
        break;
      }
      case 'pounce': {
        dog.pose = 'pounce';
        const windup = this.pounceWindup, airtime = this.pounceAirtime;
        const k = clamp((this.moveTime - windup) / airtime, 0, 1);
        dog.jumpPhase = k;
        dog.charge = this.moveTime < windup ? easeInOut(clamp(this.moveTime / (windup * 0.8), 0, 1)) : k < 1 ? 0 : Math.sin(clamp((this.moveTime - windup - airtime) / 0.3, 0, 1) * Math.PI) * 0.7;
        // Track only the first half of the bow. The last moment remains a fair dodge window.
        if (this.moveTime < windup * 0.5) {
          this.target = [clamp(player.pos[0] + player.vel[0] * 0.12, -6, 6), 0, clamp(player.pos[2] + player.vel[2] * 0.12, -2.2, 7.5)];
          this.turnDog(Math.atan2(this.target[0] - dog.pos[0], this.target[2] - dog.pos[2]), dt);
        }
        if (this.moveTime - dt < windup * 0.58 && this.moveTime >= windup * 0.58) this.bark();
        if (this.moveTime >= windup) {
          const travel = k;
          dog.pos = [lerp(this.pounceStart[0], this.target[0], travel), 0, lerp(this.pounceStart[2], this.target[2], travel)];
          dog.airborne = 4 * k * (1 - k) * 2.6;
        }
        if (k >= 1 && !this.attackHit) {
          this.attackHit = true; camera.addShake(0.28); puppySound('land');
          const d = Math.hypot(player.pos[0] - dog.pos[0], player.pos[2] - dog.pos[2]);
          if (grounded && d < 4.3 && player.pos[1] < 1.15 && this.immunity <= 0) {
            const angle = Math.atan2(player.pos[0] - dog.pos[0], player.pos[2] - dog.pos[2]) + (Math.random() - 0.5) * 2.6;
            const speed = 8.5 + Math.random() * 3;
            this.launch([Math.sin(angle) * speed, 8 + Math.random() * 2, Math.cos(angle) * speed], false);
          }
        }
        if (this.moveTime > windup + airtime + 0.32) { this.recoverTime = 0.65 + Math.random() * 0.5; this.setMove('recover'); }
        break;
      }
      case 'recover':
        dog.pose = 'happy';
        if (this.moveTime > this.recoverTime && !this.flight && !this.tumbling && !player.gettingUp && this.immunity <= 0) this.setMove('chase');
        break;
    }
    // A solid body stops the character walking inside the puppy, without invisible launch hits.
    if (grounded && local.distance < 1.9) {
      const f = dog.forward;
      const dx = player.pos[0] - dog.pos[0], dz = player.pos[2] - dog.pos[2], d = Math.hypot(dx, dz);
      player.pos[0] = dog.pos[0] + (d > 0.01 ? dx / d : f[0]) * 1.9;
      player.pos[2] = dog.pos[2] + (d > 0.01 ? dz / d : f[2]) * 1.9;
    }
  }

  private launch(velocity: Vec3, perfect: boolean) {
    const { player, camera, hud } = this.ctx;
    this.flight = velocity; this.flightTime = 0; this.perfectLaunch = perfect;
    this.highFlight = velocity[1] > 20;
    this.attempts++;
    player.pos = add(player.pos, [0, 0.95, 0]);
    player.mode = 'flying'; player.onGround = false;
    player.flightStyle = 'flail'; player.flightAge = 0;
    player.vel = [...velocity]; player.flightDir = normalize(velocity);
    player.collider?.setEnabled(false);
    camera.addShake(perfect ? 0.18 : 0.35);
    // Caption only after the player experiences the mechanic; no pre-reveal instructions.
    hud.hint(perfect ? 'GOOD TIMING. Questionable life choices.' : this.attempts <= 2 ? 'That was affection. Allegedly.' : '');
    this.flightYaw = Math.atan2(Math.sin(camera.yaw), Math.cos(camera.yaw));
    this.flightViewBlend = 0;
    this.flightCamera = null;
    this.landingCameraTime = 0;
  }

  private updateFlight(dt: number, beforeHoop: number) {
    const { player, input, camera } = this.ctx;
    const v = this.flight!;
    this.flightTime += dt;
    player.flightAge = this.flightTime;
    // Blend the controls with the camera: follow on the way up, north-up overhead on descent.
    let x = Number(input.isDown('KeyD')) - Number(input.isDown('KeyA'));
    let z = Number(input.isDown('KeyS')) - Number(input.isDown('KeyW'));
    const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
    this.flightViewBlend += ((this.highFlight ? easeInOut(clamp((9 - v[1]) / 15, 0, 1)) : 0) - this.flightViewBlend) * (1 - Math.exp(-dt * 4.5));
    const yaw = this.flightYaw * (1 - this.flightViewBlend);
    const wx = x * Math.cos(yaw) + z * Math.sin(yaw), wz = z * Math.cos(yaw) - x * Math.sin(yaw);
    const steering = 7.8;
    v[0] = (v[0] + wx * steering * dt) * Math.exp(-0.45 * dt);
    v[2] = (v[2] + wz * steering * dt) * Math.exp(-0.45 * dt);
    const old: Vec3 = [...player.pos];
    player.pos = [old[0] + v[0] * dt, old[1] + v[1] * dt - FLIGHT_GRAVITY * dt * dt / 2, old[2] + v[2] * dt];
    v[1] -= FLIGHT_GRAVITY * dt;
    player.vel = [...v];
    const spin = Math.max(0, 1 - this.flightTime * 2.5);
    player.flightDir = normalize([v[0] * 0.15 + Math.sin(this.flightTime * 20) * spin, 1, v[2] * 0.12]);
    this.aimFlightCamera(player.pos, v);
    const rimHit = rimImpact(old, player.pos, beforeHoop, this.hoopTime);
    if (rimHit) {
      player.pos = rimHit;
      const dx = rimHit[0] - hoopX(this.hoopTime), dz = rimHit[2] - HOOP_Z;
      player.startTumble(v, [dz * 2.4, 1.2, -dx * 2.4]);
      this.flight = null; this.tumbling = true; this.tumbleTime = 0; this.settledTime = 0;
      camera.addShake(0.3);
      this.ctx.hud.hint('Oof. Caught the rim.');
      return;
    }
    if (hoopCrossing(old, player.pos, beforeHoop, this.hoopTime)) {
      this.phase = 'escape'; this.phaseTime = 0; this.flight = null;
      player.pos = [hoopX(this.hoopTime), HOOP_Y, HOOP_Z];
      player.shrinkInto([...player.pos], PORTAL_SQUEEZE_TIME);
      this.ctx.hud.hint(''); this.ctx.hud.show('FETCH COMPLETE', 'You were the ball.', 1.1);
      return;
    }
    // Chamber walls and the vault remain solid during scripted flight.
    const wall = this.chamber.halfSize - 0.75;
    for (const axis of [0, 2] as const) {
      if (Math.abs(player.pos[axis]) > wall) {
        player.pos[axis] = clamp(player.pos[axis], -wall, wall);
        v[axis] *= -0.45; camera.addShake(0.25);
      }
    }
    if (player.pos[2] < -5.6 && player.pos[1] < 9.6) { player.pos[2] = -5.6; v[2] = Math.abs(v[2]) * 0.5; }
    if (player.pos[1] <= 0.95 && v[1] < 0 && !inPit(player.pos[0], player.pos[2], 0.1)) {
      const centre: Vec3 = [player.pos[0], 1.0, player.pos[2]];
      this.flight = null; this.flightCamera = null; player.collider?.setEnabled(true);
      this.landingCameraTime = this.highFlight ? 0.8 : 0;
      if (this.highFlight) camera.yaw = 0;
      player.emerge(centre, camera.yaw, [v[0] * 0.28, 0.8, v[2] * 0.28], 0.3);
      this.immunity = 2.1;
      camera.addShake(0.22);
      if (this.attempts <= 3) this.ctx.hud.hint(this.perfectLaunch ? 'Almost. The exit has a terrible habit of moving.' : 'He dips his head. His tongue curls. Then jump.');
      return;
    }
    if (player.pos[1] < -2.0) this.die();
  }

  private aimFlightCamera(p: Vec3, v: Vec3) {
    const lead = v[1] / 14;
    const ascentPos: Vec3 = [p[0] + Math.sin(this.flightYaw) * 3.4, p[1] + 1.9 + lead, p[2] + Math.cos(this.flightYaw) * 3.4];
    const overheadTarget: Vec3 = [lerp(p[0], hoopX(this.hoopTime), 0.15), p[1] - 2.0 + lead, lerp(p[2], HOOP_Z, 0.15)];
    this.flightCamera = { pos: lerp3(ascentPos, [overheadTarget[0], p[1] + 8.5 + lead, overheadTarget[2] + 1.5], this.flightViewBlend), target: lerp3(add(p, [0, 0.35 + lead, 0]), overheadTarget, this.flightViewBlend), sharpness: 14 };
  }

  private updateTumble(dt: number) {
    const { player, physics, camera } = this.ctx;
    const body = player.body!;
    this.tumbleTime += dt;
    const p = body.position('pelvis'), velocity = body.parts.pelvis.linvel();
    const v: Vec3 = [velocity.x, velocity.y, velocity.z];
    this.flightViewBlend += ((this.highFlight ? easeInOut(clamp((9 - v[1]) / 15, 0, 1)) : 0) - this.flightViewBlend) * (1 - Math.exp(-dt * 4.5));
    this.aimFlightCamera(p, v);
    if (p[1] < -2) { this.die(); return; }
    // Wait for the real body to land and settle; preserve its pose throughout the fall.
    const ground = physics.raycast(p, [0, -1, 0], 1.05);
    const landed = ground && ground.normal[1] > 0.6 && Math.hypot(...v) < 2.4;
    this.settledTime = landed ? this.settledTime + dt : 0;
    if (ground && this.tumbleTime > 0.6 && this.settledTime > 0.3) {
      player.recoverTumble([p[0], ground.point[1] + 0.02, p[2]]);
      this.tumbling = false; this.flightCamera = null; this.immunity = 2.1;
      this.landingCameraTime = this.highFlight ? 0.8 : 0;
      if (this.highFlight) camera.yaw = 0;
      this.ctx.hud.hint('Still in one piece. Mostly dignity damage.');
    }
  }

  private die() {
    if (this.phase === 'dead') return;
    this.phase = 'dead'; this.phaseTime = 0; this.flight = null;
    this.ctx.player.kill([0, -2, 0], { violence: 0 });
    this.ctx.hud.hint('');
    this.ctx.hud.show('LOVED TO BITS', 'He thinks you’re playing hide-and-seek.\nPress R to try again.');
    this.ctx.hud.tips([
      ['Lick', 'Stand in front of his nose. Jump just as the tongue curls up for a high launch.'],
      ['Escape', 'Look up: land through the moving purple hoop from above. WASD steers in the air.'],
      ['Paws & pits', 'A raised paw sweeps sideways. A play bow means pounce. Jump over a tail sweep.'],
    ]);
  }

  draw(out: DrawItem[]) {
    out.push(...this.scenery);
    this.arrival.draw(out);
    this.vault.draw(out, this.time);
    this.puppy.draw(out);
    this.drawHoop(out);
    if (this.phase === 'play') this.drawTells(out);
  }

  private drawHoop(out: DrawItem[]) {
    const x = hoopX(this.hoopTime), centre: Vec3 = [x, HOOP_Y, HOOP_Z];
    // Upward-facing landing target. An opaque underside makes its orientation unambiguous.
    drawPortal(out, [x, HOOP_Y + 0.025, HOOP_Z], [0, 1, 0], HOOP_RADIUS, false);
    out.push({ mesh: 'cylinder', model: mul(translation([x, HOOP_Y - 0.11, HOOP_Z]), scaling([HOOP_RADIUS, 0.15, HOOP_RADIUS])), color: [0.055, 0.025, 0.085] });
    drawPortalArm(out, centre, HOOP_RADIUS, this.time);
  }

  private drawTells(out: DrawItem[]) {
    const dog = this.puppy, root = mul(translation(dog.pos), rotationY(dog.yaw));
    if (this.move === 'lick' && this.moveTime < LICK_WINDUP) {
      // Tongue-shaped pool and three filling pips make the charge readable even without audio.
      const ready = this.moveTime > LICK_WINDUP - 0.28;
      out.push({ mesh: 'roundbox', model: mul(root, translation([0, 0.026, 3.7]), scaling([1.35, 0.025, 1.4])), color: ready ? [0.35, 1, 0.75] : [0.7, 0.18, 0.35], pattern: Pattern.emissive, shadow: false });
      for (let i = 0; i < 3; i++) out.push({ mesh: 'sphere', model: mul(root, translation([(i - 1) * 0.4, 0.08, 4.7]), scaling([0.10, 0.05, 0.10])), color: this.moveTime > (i + 1) * 0.33 ? [0.35, 1, 0.75] : [0.15, 0.18, 0.18], pattern: Pattern.emissive, shadow: false });
    }
    if (this.move === 'pounce' && this.moveTime < this.pounceWindup + this.pounceAirtime) {
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2;
        out.push({ mesh: 'box', model: mul(translation([this.target[0] + Math.cos(a) * 4.3, 0.04, this.target[2] + Math.sin(a) * 4.3]), rotationY(-a), scaling([0.23, 0.04, 0.12])), color: [1, 0.28, 0.05], pattern: Pattern.emissive, shadow: false });
      }
    }
    if (this.move === 'paw' && !this.attackHit) {
      // The same path as the visible foot and hit window, across the entire front of the dog.
      for (let i = 0; i <= 18; i++) {
        const p = pawSweepPoint(dog.pawSide, i / 18);
        out.push({ mesh: 'sphere', model: mul(root, translation([p[0], 0.04, p[2]]), scaling([0.17, 0.025, 0.17])), color: [0.98, 0.42, 0.05], pattern: Pattern.emissive, shadow: false });
      }
    }
    if (this.move === 'tail' && !this.attackHit) {
      out.push({ mesh: 'box', model: mul(root, translation([0, 0.04, -2.9]), scaling([5, 0.035, 0.7])), color: [0.98, 0.42, 0.05], pattern: Pattern.emissive, shadow: false });
    }
  }

  environment() { return ENV; }
  obstacles() {
    if (this.ctx.player.pos[1] > 3.8 || this.puppy.airborne > 1.5) return [];
    this.bodyObstacle[0].x = this.puppy.pos[0]; this.bodyObstacle[0].z = this.puppy.pos[2];
    return this.bodyObstacle;
  }
  labels(): WorldLabel[] {
    return [];
  }

  cameraShot(): CameraShot | null {
    const arrival = this.arrival.cameraShot(); if (arrival) return arrival;
    if (this.pitCamera) return this.pitCamera;
    if (((this.flight || this.tumbling) && this.highFlight) || this.phase === 'escape') return this.flightCamera;
    if (this.landingCameraTime > 0) {
      const p = this.ctx.player.pos;
      return { pos: add(p, [0.6, 2.28, 3.14]), target: add(p, [0.6, -0.34, -9.8]), sharpness: 5.5 };
    }
    return null;
  }
}
