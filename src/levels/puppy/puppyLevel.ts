import { add, approachAngle, clamp, easeInOut, lerp, lerp3, mul, normalize, rotationY, rotationZ, scaling, sub, translation, type Vec3 } from '../../engine/math';
import { Pattern, type DrawItem, type Environment } from '../../engine/renderer';
import { RAPIER } from '../../engine/physics';
import { drawPortal, PORTAL_SQUEEZE_TIME, PortalArrival } from '../../entities/portal';
import { PrisonVault } from '../../entities/prisonVault';
import { Button } from '../../entities/props';
import { Puppy } from '../../entities/puppy';
import { PuppyContactBody } from '../../entities/puppyContact';
import { VaultBridge } from '../../entities/vaultBridge';
import { drawPortalArm, PortalRim } from '../../entities/portalArm';
import { preparePuppyAudio, puppySound } from '../../entities/puppyAudio';
import { type CameraShot, type Level, type LevelContext, type LevelStatus, type WorldLabel } from '../level';
import { FLIGHT_GRAVITY, HOOP_RADIUS, HOOP_Y, HOOP_Z, hoopCrossing, hoopX, inPit, LICK_WINDUP, lickVelocity, PAW_SWEEP_TIME, PAW_WINDUP, pawSweepPoint, PITS, pitBoundaryEdges } from './mechanics';

type Phase = 'sealed' | 'opening' | 'reveal' | 'play' | 'escape' | 'dead';
type Move = 'chase' | 'lick' | 'paw' | 'pounce' | 'recover';
/** Pressure, dodge, opportunity. Close-range play must not collapse into an endless lick loop. */
const ATTACK_CYCLE: readonly Move[] = ['pounce', 'paw', 'lick', 'paw', 'pounce', 'lick', 'pounce', 'paw', 'lick'];
const BUTTON: Vec3 = [9.4, 0, -4.8];
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
  private contactBody: PuppyContactBody;
  private bridge: VaultBridge;
  private bridgeTime = -1;
  private physicalPortalSample: { pos: Vec3; time: number } | null = null;
  private secretFound = false;
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
  private airSteering = false;
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
  private greetingTime = -1;

  constructor(private ctx: LevelContext) {
    ctx.hud.setLevel('The Chamber · Level 4');
    ctx.hud.hint('');
    this.arrival = new PortalArrival(ctx, [0, 0, 6.5]);
    this.vault = new PrisonVault(ctx.physics);
    this.bridge = new VaultBridge(ctx.physics);
    this.contactBody = new PuppyContactBody(ctx.physics, this.puppy);
    ctx.physics.postStepHooks.push(() => this.resolveAttackContact());
    ctx.player.recoveryMoveScale = 0.4;
    this.rim = new PortalRim(ctx.physics, [hoopX(0), HOOP_Y, HOOP_Z], HOOP_RADIUS);
    new Button(ctx.physics, BUTTON, [0.87, 0.045, 0.018], () => this.release());
    this.buildRoom();
    preparePuppyAudio();
  }

  private buildRoom() {
    const box = (p: Vec3, size: Vec3, color: number[], emissive = false) => this.scenery.push({ mesh: 'box', model: mul(translation(p), scaling(size)), color, pattern: emissive ? Pattern.emissive : Pattern.plain });
    for (const p of PITS) box([p.x, -38, p.z], [p.width, 0.1, p.depth], [0, 0, 0], true);
    for (const edge of pitBoundaryEdges()) {
      const { x, z, width, depth, length, alongX } = edge;
      this.ctx.physics.addStaticBox([x, -18, z], [width, 36, depth]);
      for (let d = 0; d < 36; d += 3) {
        const shade = 0.10 * Math.exp(-d / 5);
        box([x, -d - 1.5, z], [width, 3.04, depth], [shade, shade * 1.1, shade * 1.3], true);
      }
      box([x, -0.15, z], [alongX ? length : 0.18, 0.3, alongX ? 0.18 : length], [0.19, 0.23, 0.28]);
      box([x, 0.025, z], [alongX ? length : 0.2, 0.05, alongX ? 0.2 : length], [0.93, 0.43, 0.025], true);
      box([x, -1.1, z], [alongX ? length : 0.14, 0.08, alongX ? 0.14 : length], [0.7, 0.02, 0.01], true);
      for (let t = -length / 2 + 0.2; t < length / 2; t += 0.42) box([x + (alongX ? t : 0), 0.054, z + (alongX ? 0 : t)], [alongX ? 0.15 : 0.21, 0.015, alongX ? 0.21 : 0.15], [0.035, 0.035, 0.035]);
    }
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
    if (player.gettingUp || player.stun > 0) {
      this.immunity = Math.max(this.immunity, 0.65);
      player.knockProtection = Math.max(player.knockProtection, 0.65);
    }
    this.landingCameraTime = Math.max(0, this.landingCameraTime - dt);
    this.contactBody.sync();
    this.puppy.time = this.time;
    this.puppy.animate(dt);
    if (this.greetingTime >= 0) this.greetingTime += dt;
    this.arrival.update(dt);
    if (this.bridgeTime >= 0) {
      this.bridgeTime += dt;
      if (this.bridge.retraction < 1) this.bridge.update(easeInOut(clamp(this.bridgeTime / 2, 0, 1)));
    }
    const beforeHoop = this.hoopTime;
    // Physical motion happened during the previous physics step, before this hoop movement.
    this.checkPhysicalPortal(beforeHoop);
    if (this.phase !== 'escape') this.hoopTime += dt;
    this.rim.move([hoopX(this.hoopTime), HOOP_Y, HOOP_Z], dt);
    const physicalHeight = player.body?.position('pelvis')[1] ?? player.pos[1];
    this.rim.setUndersideSolid(!player.inPortal && physicalHeight < HOOP_Y - 0.15);
    if (this.phase === 'dead') {
      this.updatePitCamera();
      if (this.phaseTime > 1.2) this.status = 'lost';
      return;
    }
    if (this.phase === 'escape') {
      this.pitCamera = null;
      this.puppy.pose = 'happy';
      if (this.phaseTime > PORTAL_SQUEEZE_TIME + 0.7) this.status = 'exited';
      return;
    }
    player.physicsDrivenKnockdowns = this.arrival.done;
    if (!this.tumbling && player.mode === 'ragdoll') {
      this.tumbling = true; this.tumbleTime = 0; this.settledTime = 0; this.highFlight = false;
    }
    if (this.tumbling) this.updateTumble(dt);
    else if (player.pos[1] < -1.8) this.die();
    // Flight and recovery may put us back on the edge this tick. Evaluate the camera afterwards.
    this.updatePitCamera();
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
        if (this.phaseTime >= 4.4 && this.bridgeTime < 0) this.bridgeTime = 0;
        // Affection appears as he reaches the light, preserving the ominous closed-vault reveal.
        if (this.greetingTime < 0 && this.phaseTime >= 2.1) this.greetingTime = 0;
        if (this.phaseTime - dt < 2.8 && this.phaseTime >= 2.8) this.ctx.hud.hint('“Oh. A puppy. Aw, that’s not so bad.”');
        if (this.phaseTime > 4.9) { this.phase = 'play'; this.phaseTime = 0; this.setMove('chase'); this.ctx.hud.hint(''); }
        break;
      }
      case 'play': this.updateBoss(dt); break;
    }
    this.contactBody.update(this.puppy, dt);
    // The existing exterior landing behind the right side of the cage hides the reward.
    if (!this.secretFound && player.mode === 'control' && Math.hypot(player.pos[0] - 9.15, player.pos[2] + 12.8) < 0.9 && Math.abs(player.pos[1]) < 1.2) {
      this.secretFound = true; player.puppyMan = true;
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('chamber-puppy-man', '1'); } catch { /* Cosmetic still works for this session. */ }
      this.ctx.hud.show('ONE OF THE PACK', 'Puppy man unlocked.', 2.5);
    }
  }

  private overPit(x: number, z: number, inset = 0) {
    return inPit(x, z, inset) && !this.bridge.supports(x, z);
  }

  private checkPhysicalPortal(time: number) {
    const player = this.ctx.player;
    if (this.phase !== 'play' || player.inPortal || !player.body?.isEnabled || !['ragdoll', 'control'].includes(player.mode)) {
      this.physicalPortalSample = null;
      return;
    }
    const pos = player.body.position('pelvis'), previous = this.physicalPortalSample;
    if (previous && hoopCrossing(previous.pos, pos, previous.time, time)) this.win();
    this.physicalPortalSample = { pos: [...pos], time };
  }

  private win() {
    const player = this.ctx.player;
    this.phase = 'escape'; this.phaseTime = 0; this.airSteering = false; this.tumbling = false;
    this.pitCamera = null;
    if (player.body?.isEnabled && (player.mode === 'ragdoll' || player.mode === 'control')) {
      // Freeze the actual pose so a limp player can be sucked into the portal intact.
      for (const part of Object.values(player.body.parts)) part.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      player.mode = 'ragdoll';
    }
    player.shrinkInto([hoopX(this.hoopTime), HOOP_Y, HOOP_Z], PORTAL_SQUEEZE_TIME);
    this.ctx.hud.hint(''); this.ctx.hud.show('FETCH COMPLETE', 'You were the ball.', 1.1);
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
    const overPit = this.overPit(player.pos[0], player.pos[2], 0.1);
    if (this.phase !== 'dead' && (!overPit || player.pos[1] >= 0.05 || (player.mode === 'control' && player.onGround))) {
      this.pitCamera = null; return;
    }
    if (!this.arrival.done || player.pos[1] >= -0.15) return;
    const pit = PITS.find(p => Math.abs(player.pos[0] - p.x) < p.width / 2 && Math.abs(player.pos[2] - p.z) < p.depth / 2);
    if (!pit) return;
    const x = clamp(player.pos[0], pit.x - pit.width / 2 + 0.45, pit.x + pit.width / 2 - 0.45);
    const z = clamp(player.pos[2] + 0.8, pit.z - pit.depth / 2 + 0.45, pit.z + pit.depth / 2 - 0.45);
    const current = camera.pos ?? [x, 3, z];
    const aligned = current[0] > pit.x - pit.width / 2 + 0.2 && current[0] < pit.x + pit.width / 2 - 0.2 && current[2] > pit.z - pit.depth / 2 + 0.2 && current[2] < pit.z + pit.depth / 2 - 0.2;
    const y = aligned ? Math.max(-12, player.pos[1] + 4.5) : Math.max(1.5, current[1]);
    this.pitCamera = { pos: [x, y, z], target: [player.pos[0], Math.max(-16, player.pos[1] + 0.8), player.pos[2]], sharpness: 6 };
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
    return Math.abs(Math.atan2(Math.sin(yaw - (dog.physicalRoot?.yaw ?? dog.yaw)), Math.cos(yaw - (dog.physicalRoot?.yaw ?? dog.yaw))));
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
    if ((this.tumbling || player.gettingUp) && dog.airborne < 0.1) {
      if (this.move !== 'recover') { this.setMove('recover'); this.recoverTime = 0.9; }
      const dx = dog.pos[0] - player.pos[0], dz = dog.pos[2] - player.pos[2], distance = Math.hypot(dx, dz);
      if (distance < 4) {
        const away = distance > 0.1 ? [dx / distance, dz / distance] : [-dog.forward[0], -dog.forward[2]];
        const angle = this.turnDog(Math.atan2(away[0], away[1]), dt);
        const speed = angle < 0.55 ? 2 : 0;
        dog.pos[0] = clamp(dog.pos[0] + dog.forward[0] * dt * speed, -6, 6);
        dog.pos[2] = clamp(dog.pos[2] + dog.forward[2] * dt * speed, -3.4, 7.0);
        dog.pose = 'walk';
      } else dog.pose = 'happy';
      return;
    }
    const local = this.localPlayer();
    const grounded = !this.tumbling && player.mode === 'control' && player.pos[1] < 2.5;
    switch (this.move) {
      case 'chase': {
        dog.pose = 'walk';
        if (!grounded || this.immunity > 0 || player.gettingUp) { dog.pose = 'happy'; break; }
        const scheduled = ATTACK_CYCLE[this.attackIndex % ATTACK_CYCLE.length];
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
        const f = dog.forward, lunge = easeInOut(sweep) * 1.6;
        dog.pos[0] = this.pawStart[0] + f[0] * lunge; dog.pos[2] = this.pawStart[2] + f[2] * lunge;
        if (this.moveTime - dt < PAW_WINDUP && this.moveTime >= PAW_WINDUP) this.bark();
        if (this.moveTime > PAW_WINDUP + PAW_SWEEP_TIME + 0.4) { this.recoverTime = 1.6; this.setMove('recover'); }
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
        }
        if (this.moveTime > windup + airtime + 0.32) { this.recoverTime = 0.65 + Math.random() * 0.5; this.setMove('recover'); }
        break;
      }
      case 'recover':
        dog.pose = 'happy';
        if (this.moveTime > this.recoverTime && !this.tumbling && !player.gettingUp && this.immunity <= 0) this.setMove('chase');
        break;
    }
  }

  private resolveAttackContact() {
    const player = this.ctx.player;
    if (this.phase !== 'play' || this.tumbling || player.gettingUp || player.inPortal || player.knockProtection > 0 || this.immunity > 0) return;
    const active = this.move === 'paw'
      ? this.moveTime >= PAW_WINDUP && this.moveTime <= PAW_WINDUP + PAW_SWEEP_TIME + 0.15
      : this.move === 'pounce' && this.moveTime >= this.pounceWindup && this.moveTime <= this.pounceWindup + this.pounceAirtime + 0.2;
    if (!active) return;
    const contact = this.contactBody.attackContact(player);
    if (!contact) return;
    const horizontal = Math.hypot(contact[0], contact[2]);
    const away = sub(player.body!.position('pelvis'), this.puppy.physicalRoot?.pos ?? this.puppy.pos);
    const outward = Math.hypot(away[0], away[2]);
    const direction = this.move === 'paw' && horizontal > 1 ? [contact[0] / horizontal, contact[2] / horizontal] : outward > 0.5 ? [away[0] / outward, away[2] / outward] : [this.puppy.forward[0], this.puppy.forward[2]];
    const speed = clamp(Math.hypot(...contact) * 0.85, 7.5, 11);
    // Release the motors and apply an impulse to the existing body, preserving its pose.
    const velocity: Vec3 = [direction[0] * speed, this.move === 'pounce' ? 7 : 4.5, direction[1] * speed];
    this.launch(velocity, false);
    this.contactBody.separateAfterHit();
    // A pounce can drive a foot into the floor during the contact step. Give all
    // limbs the outgoing momentum so that compressed pose cannot swallow the hit.
    for (const part of Object.values(player.body!.parts)) {
      const v = part.linvel(), m = part.mass();
      part.applyImpulse({ x: (velocity[0] - v.x) * m, y: (velocity[1] - v.y) * m, z: (velocity[2] - v.z) * m }, true);
    }
  }

  private launch(velocity: Vec3, perfect: boolean) {
    const { player, camera } = this.ctx;
    player.releasePhysicalBody(velocity);
    this.tumbling = true; this.airSteering = velocity[1] > 20; this.highFlight = this.airSteering;
    this.tumbleTime = 0; this.settledTime = 0; this.flightTime = 0; this.perfectLaunch = perfect; this.attempts++;
    this.flightYaw = camera.yaw; this.flightViewBlend = 0; this.landingCameraTime = 0;
    this.physicalPortalSample = { pos: [...player.body!.position('pelvis')], time: this.hoopTime };
    for (const part of Object.values(player.body!.parts)) part.setGravityScale(this.airSteering ? FLIGHT_GRAVITY / 20 : 1, true);
    camera.addShake(perfect ? 0.16 : 0.22);
  }
  private aimFlightCamera(p: Vec3, v: Vec3) {
    const lead = v[1] / 14;
    const ascentPos: Vec3 = [p[0] + Math.sin(this.flightYaw) * 3.4, p[1] + 1.9 + lead, p[2] + Math.cos(this.flightYaw) * 3.4];
    const overheadTarget: Vec3 = [lerp(p[0], hoopX(this.hoopTime), 0.15), p[1] - 2.0 + lead, lerp(p[2], HOOP_Z, 0.15)];
    this.flightCamera = { pos: lerp3(ascentPos, [overheadTarget[0], p[1] + 8.5 + lead, overheadTarget[2] + 1.5], this.flightViewBlend), target: lerp3(add(p, [0, 0.35 + lead, 0]), overheadTarget, this.flightViewBlend), sharpness: 14 };
  }

  private updateTumble(dt: number) {
    const { player, physics, camera, input } = this.ctx;
    const body = player.body!;
    this.tumbleTime += dt;
    const p = body.position('pelvis'), v = body.velocity('pelvis');
    player.afterPhysics();
    this.flightViewBlend += ((this.highFlight ? easeInOut(clamp((9 - v[1]) / 15, 0, 1)) : 0) - this.flightViewBlend) * (1 - Math.exp(-dt * 4.5));
    this.aimFlightCamera(p, v);
    if (this.airSteering && p[1] > 2) {
      let x = Number(input.isDown('KeyD')) - Number(input.isDown('KeyA'));
      let z = Number(input.isDown('KeyS')) - Number(input.isDown('KeyW'));
      const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
      const yaw = this.flightYaw * (1 - this.flightViewBlend);
      const dx = ((x * Math.cos(yaw) + z * Math.sin(yaw)) * 7.8 - v[0] * 0.45) * dt;
      const dz = ((z * Math.cos(yaw) - x * Math.sin(yaw)) * 7.8 - v[2] * 0.45) * dt;
      for (const part of Object.values(body.parts)) part.applyImpulse({ x: dx * part.mass(), y: 0, z: dz * part.mass() }, true);
    }
    if (p[1] < -2) { this.die(); return; }
    const ground = physics.raycast(p, [0, -1, 0], 1.1);
    const supported = ground && ground.normal[1] > 0.6 && !physics.contactActors.has(ground.collider.parent()!);
    const landed = supported && Math.hypot(...v) < 2.8;
    this.settledTime = landed ? this.settledTime + dt : 0;
    if (supported && this.tumbleTime > 0.45 && this.settledTime > 0.2) {
      for (const part of Object.values(body.parts)) part.setGravityScale(1, true);
      player.recoverTumble([p[0], ground.point[1] + 0.02, p[2]]);
      this.tumbling = false; this.airSteering = false; this.flightCamera = null; this.immunity = 1.4;
      player.knockProtection = 1.4;
      this.landingCameraTime = this.highFlight ? 0.8 : 0;
      if (this.highFlight) camera.yaw = 0;
    }
  }
  private die() {
    if (this.phase === 'dead') return;
    this.phase = 'dead'; this.phaseTime = 0; this.airSteering = false;
    this.ctx.player.kill([0, -2, 0], { violence: 0 });
    this.ctx.hud.hint('');
    this.ctx.hud.show('LOVED TO BITS', 'He thinks you’re playing hide-and-seek.\nPress R to try again.');
    this.ctx.hud.tips([
      ['Lick', 'Stand in front of his nose. Jump just as the tongue curls up for a high launch.'],
      ['Escape', 'Look up: land through the moving purple hoop from above. WASD steers in the air.'],
      ['Paws & pits', 'A raised paw sweeps sideways. A play bow means pounce. Moving shoulders and wagging tails can knock you over too.'],
    ]);
  }

  previewCameraShot(time: number): CameraShot {
    return { pos: [Math.sin(time * 0.12) * 0.8, 2.4, 7], target: [0, 3.5, -7.5], sharpness: 2 };
  }

  drawPreview(out: DrawItem[], time: number) {
    // Omit the overhead machine entirely, including its shadow, until play begins.
    out.push(...this.scenery);
    this.vault.draw(out, time);
    this.bridge.draw(out);
    this.puppy.draw(out);
  }

  draw(out: DrawItem[]) {
    this.drawPreview(out, this.time);
    this.arrival.draw(out);
    this.drawGreeting(out);
    this.drawHoop(out);
    if (!this.secretFound) {
      const y = 0.9 + Math.sin(this.time * 2.5) * 0.1;
      out.push({ mesh: 'sphere', model: mul(translation([9.15, y, -12.8]), scaling([0.28, 0.34, 0.13])), color: [1, 0.66, 0.12], pattern: Pattern.emissive });
      for (const s of [-1, 1]) out.push({ mesh: 'sphere', model: mul(translation([9.15 + s * 0.24, y + 0.08, -12.8]), scaling([0.12, 0.25, 0.10])), color: [0.69, 0.36, 0.12] });
    }
    if (this.phase === 'play') this.drawTells(out);
  }

  private drawHoop(out: DrawItem[]) {
    const x = hoopX(this.hoopTime), centre: Vec3 = [x, HOOP_Y, HOOP_Z];
    // Upward-facing landing target. An opaque underside makes its orientation unambiguous.
    drawPortal(out, [x, HOOP_Y + 0.025, HOOP_Z], [0, 1, 0], HOOP_RADIUS, false);
    out.push({ mesh: 'cylinder', model: mul(translation([x, HOOP_Y - 0.11, HOOP_Z]), scaling([HOOP_RADIUS, 0.15, HOOP_RADIUS])), color: [0.055, 0.025, 0.085] });
    drawPortalArm(out, centre, HOOP_RADIUS, this.time);
  }

  private drawGreeting(out: DrawItem[]) {
    if (this.greetingTime < 0 || this.greetingTime > 4.7) return;
    const dog = this.puppy;
    for (let i = 0; i < 5; i++) {
      const age = this.greetingTime - i * 0.5;
      if (age < 0 || age > 2.7) continue;
      const pop = easeInOut(clamp(age / 0.3, 0, 1));
      const fade = 1 - easeInOut(clamp((age - 1.9) / 0.8, 0, 1));
      const size = (0.85 + (i % 2) * 0.2) * pop * fade;
      if (size < 0.01) continue;
      const side = (i % 3 - 1) * 0.95 + Math.sin(age * 2 + i) * 0.2;
      const p: Vec3 = [dog.pos[0] + side, dog.pos[1] + 4.4 + age * 0.9, dog.pos[2] + 1.5];
      const view = this.ctx.camera.pos ?? add(p, [0, 0, 5]);
      const yaw = Math.atan2(view[0] - p[0], view[2] - p[2]);
      out.push({ mesh: 'heart', model: mul(translation(p), rotationY(yaw), rotationZ(Math.sin(age * 2 + i) * 0.13), scaling([size, size, size])), color: i % 2 ? [1, 0.3, 0.48] : [1, 0.06, 0.23], pattern: Pattern.emissive, shadow: false });
    }
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
        out.push({ mesh: 'box', model: mul(translation([this.target[0] + Math.cos(a) * 2.7, 0.04, this.target[2] + Math.sin(a) * 2.7]), rotationY(-a), scaling([0.23, 0.04, 0.12])), color: [1, 0.28, 0.05], pattern: Pattern.emissive, shadow: false });
      }
    }
    if (this.move === 'paw' && !this.attackHit) {
      // The same path as the visible foot and hit window, across the entire front of the dog.
      for (let i = 0; i <= 18; i++) {
        const p = pawSweepPoint(dog.pawSide, i / 18);
        out.push({ mesh: 'sphere', model: mul(root, translation([p[0], 0.04, p[2]]), scaling([0.17, 0.025, 0.17])), color: [0.98, 0.42, 0.05], pattern: Pattern.emissive, shadow: false });
      }
    }
  }

  environment() { return ENV; }
  obstacles() {
    // The animated physics shapes now supply the solid outline.
    return [];
  }
  labels(): WorldLabel[] {
    return [];
  }

  cameraShot(): CameraShot | null {
    const arrival = this.arrival.cameraShot(); if (arrival) return arrival;
    if (this.pitCamera) return this.pitCamera;
    if ((this.tumbling && this.highFlight) || this.phase === 'escape') return this.flightCamera;
    if (this.landingCameraTime > 0) {
      const p = this.ctx.player.pos;
      return { pos: add(p, [0.6, 2.28, 3.14]), target: add(p, [0.6, -0.34, -9.8]), sharpness: 5.5 };
    }
    return null;
  }
}
