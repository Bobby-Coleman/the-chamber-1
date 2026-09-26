import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Use Vite's real loader so physics and gameplay run against the same modules as the browser.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let count = 0;
let failed = 0;
const check = (name, run) => {
  try { run(); count++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message.slice(0, 500)}`); }
};
try {
  const { initPhysics, Physics } = await server.ssrLoadModule('/src/engine/physics.ts');
  const { Player } = await server.ssrLoadModule('/src/game/player.ts');
  const { addChamberColliders } = await server.ssrLoadModule('/src/game/chamber.ts');
  const { PuppyLevel } = await server.ssrLoadModule('/src/levels/puppy/puppyLevel.ts');
  const rules = await server.ssrLoadModule('/src/levels/puppy/mechanics.ts');
  await initPhysics();
  const worlds = [];
  const fixture = ({ safeFloor = false } = {}) => {
    const physics = new Physics(); worlds.push(physics);
    const player = new Player(); player.attach(physics);
    const down = new Set(), pressed = new Set();
    const input = { isDown: c => down.has(c), wasPressed: c => pressed.has(c) };
    const camera = { yaw: 0, pitch: -0.2, addShake() {} };
    const hud = { setLevel() {}, hint() {}, show() {}, hide() {}, tips() {} };
    const ctx = { physics, player, input, camera, hud };
    const level = new PuppyLevel(ctx);
    const contacts = new Set();
    physics.postStepHooks.push(() => {
      for (const part of player.body.colliders) physics.world.contactPairsWith(part, other => {
        if (physics.contactActors.has(other.parent())) contacts.add(other.handle);
      });
    });
    addChamberColliders(physics, level.chamber);
    // Isolate ragdoll recovery from valid deaths when a moving rim throws the body into a pit.
    if (safeFloor) physics.addStaticBox([0, -0.5, 0], [28, 1, 28]);
    const step = seconds => {
      for (let t = 0; t < seconds - 1e-7; t += 1 / 120) {
        const dt = 1 / 120;
        if (player.mode === 'control' && !player.inPortal) player.update(dt, input, camera.yaw, level.obstacles(), camera.pitch);
        player.syncCollider(); level.update(dt); player.tickPortal(dt); physics.step(dt); player.afterPhysics(); pressed.clear();
      }
    };
    const place = (pos) => {
      player.reset(pos); player.emerge([pos[0], pos[1] + 0.95, pos[2]], 0, [0, 0, 0], 0);
      player.gettingUp = false; player.stun = 0; player.body.muscle = 1;
      player.physicsDrivenKnockdowns = true; player.recoveryMoveScale = 0.4;
    };
    step(6); place([0, 0, 0.4]);
    const battle = () => { level.phase = 'play'; level.vault.update(1); level.puppy.pos = [0, 0, -3.4]; level.puppy.yaw = 0; level.contactBody.resetToPose(); level.setMove('chase'); };
    return { ...ctx, level, down, pressed, step, battle, place, contacts };
  };
  check('centered late jump gets full launch; early and edge hits do not', () => {
    assert.equal(rules.lickVelocity(0, [0, 0, 1], 0.18).perfect, true);
    assert.equal(rules.lickVelocity(0, [0, 0, 1], 0.4).perfect, false);
    assert.equal(rules.lickVelocity(1, [0, 0, 1], 0.18).perfect, false);
    assert.ok(rules.lickVelocity(-1, [0, 0, 1], 1).velocity[0] < 0);
    assert.ok(rules.lickVelocity(1, [0, 0, 1], 1).velocity[0] > 0);
  });
  check('hoop accepts downward passage and rejects upward, outside, or wrong depth', () => {
    const high = rules.HOOP_Y + 1, low = rules.HOOP_Y - 1;
    assert.equal(rules.hoopCrossing([0, high, rules.HOOP_Z], [0, low, rules.HOOP_Z], 0, 0), true);
    assert.equal(rules.hoopCrossing([0, low, rules.HOOP_Z], [0, high, rules.HOOP_Z], 0, 0), false);
    assert.equal(rules.hoopCrossing([3, high, rules.HOOP_Z], [3, low, rules.HOOP_Z], 0, 0), false);
    assert.equal(rules.hoopCrossing([0, high, 0], [0, low, 0], 0, 0), false);
  });
  check('swept scoring uses the hoop position at the exact crossing time', () => {
    const t = 0.73, dt = 0.05, x = rules.hoopX(t + dt * 0.5);
    assert.equal(rules.hoopCrossing([x, rules.HOOP_Y + 1, rules.HOOP_Z], [x, rules.HOOP_Y - 1, rules.HOOP_Z], t, t + dt), true);
  });
  check('real chamber collider has open pits and a solid safe floor', () => {
    const f = fixture(); f.physics.step(0.02);
    f.level.bridge.update(1); f.physics.step(0.02);
    for (const pit of rules.PITS) assert.ok(!f.physics.raycast([pit === rules.REAR_PIT ? 4 : pit.x, 1, pit.z], [0, -1, 0], 5), 'pit must have no floor');
    assert.ok(f.physics.raycast([4, 1, 5], [0, -1, 0], 2));
  });
  check('button is one-shot and reveal reaches active encounter', () => {
    const f = fixture(); f.level.release(); assert.equal(f.level.phase, 'opening');
    f.step(2); f.level.release(); assert.ok(f.level.phaseTime >= 1.9);
    f.step(6.4); assert.equal(f.level.phase, 'play'); assert.equal(f.level.vault.open, 1);
  });
  check('actual centered jump during lick launches high enough for the hoop', () => {
    const f = fixture(); f.battle(); f.level.setMove('lick'); f.step(1.1);
    f.pressed.add('Space'); f.down.add('Space'); f.step(0.23); f.down.clear();
    assert.equal(f.player.mode, 'ragdoll'); assert.equal(f.level.perfectLaunch, true);
    f.step(0.8); assert.ok(f.player.pos[1] > rules.HOOP_Y, `apex ${f.player.pos[1]}`);
  });
  check('miss lands alive and gets a recovery window', () => {
    const f = fixture(); f.battle(); f.place([0, 0, 7.5]); f.level.launch([0, 28, 0], true); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.step(4.2); assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.ok(f.level.immunity > 0); assert.equal(f.level.status, 'playing');
    f.step(5); assert.equal(f.player.gettingUp, false); assert.ok(f.player.pos[1] >= -0.1);
  });
  check('paws and pounce deliver real contact after a wind-up', () => {
    for (const attack of ['paw', 'pounce']) {
      const f = fixture(); f.battle();
      if (attack === 'paw') f.place([0, 0, 0.4]);
      if (attack === 'pounce') { f.place([0, 0, 1]); f.level.pounceStart = [...f.level.puppy.pos]; f.level.target = [0, 0, 0]; }
      f.level.setMove(attack); f.step(0.4); assert.equal(f.level.tumbling, false, attack);
      f.step(attack === 'pounce' ? f.level.pounceWindup + f.level.pounceAirtime + 0.1 : 1.0);
      assert.ok(f.contacts.size > 0, `${attack} must touch the physical player`);
      assert.ok(f.level.tumbling || f.player.gettingUp || Math.hypot(f.player.pos[0], f.player.pos[2] - 0.4) > 0.4, `${attack} must physically displace the player`);
    }
  });
  check('walking into a pit loses the attempt', () => {
    const f = fixture(); f.battle(); f.place([-12.5, 0, 3]); f.step(2.5);
    assert.equal(f.level.status, 'lost'); assert.equal(f.level.phase, 'dead');
    const shot = f.level.cameraShot(); assert.ok(Number.isFinite(shot.pos[1])); assert.ok(shot.target[1] < 0);
    f.step(1); assert.ok(f.level.cameraShot().pos[1] >= -12, 'pit camera stays within the visible shaft');
  });
  check('catching the pit edge releases the fall camera and restores normal play', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([-11.45, -0.23, 3]); f.level.launch([1, -1, 0], false);

    f.step(0.025); assert.ok(f.level.cameraShot(), 'look down while actually falling into the shaft');
    f.player.body.addVelocity([7, 6, 0]); f.step(2);
    assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.equal(f.level.cameraShot(), null, 'a survivable edge catch must return to the normal camera');
    f.step(3); assert.equal(f.player.gettingUp, false); assert.equal(f.level.cameraShot(), null);
  });
  check('a valid airborne crossing squeezes player and exits', () => {
    const f = fixture(); f.battle(); f.level.hoopTime = 0;
    f.place([rules.hoopX(0.05), rules.HOOP_Y + 0.15 - 0.98, rules.HOOP_Z]);
    f.level.launch([0, -3, 0], false);
    f.step(0.1); assert.equal(f.level.phase, 'escape'); assert.equal(f.player.inPortal, true);
    f.step(1.3); assert.equal(f.level.status, 'exited');
  });
  check('timing the moving machine gives a reachable win from an actual launch', () => {
    const f = fixture(); f.battle();
    const height = rules.HOOP_Y - 0.95;
    const fallAt = (28 + Math.sqrt(28 * 28 - 2 * rules.FLIGHT_GRAVITY * height)) / rules.FLIGHT_GRAVITY;
    f.level.hoopTime = 7.2 - fallAt;
    f.level.launch([0, 28, 1.6], true);
    f.step(fallAt + 0.1);
    assert.equal(f.level.phase, 'escape');
  });
  check('vault opening and walk-out never take the camera or player controls', () => {
    const f = fixture(); f.level.release();
    for (let i = 0; i < 8; i++) {
      f.step(0.9); assert.equal(f.level.cameraShot(), null); assert.equal(f.player.mode, 'control');
    }
  });
  check('close-range mix offers a lick every third attack and keeps paws and pounces', () => {
    const f = fixture(); f.battle();
    const moves = [];
    for (let i = 0; i < 9; i++) {
      f.place([0, 0, 0.4]); f.level.puppy.pos = [0, 0, -3.4]; f.level.puppy.yaw = 0; f.level.contactBody.resetToPose();
      // Isolate scheduling from the separately tested incidental shoulder / paw contacts.
      f.player.knockProtection = 100; f.level.immunity = 0;
      f.level.setMove('chase');
      for (let t = 0; t < 3 && f.level.move === 'chase'; t += 0.05) f.step(0.05);
      moves.push(f.level.move);
    }
    assert.deepEqual(moves, ['pounce', 'paw', 'lick', 'paw', 'pounce', 'lick', 'pounce', 'paw', 'lick']);
    assert.equal(moves.filter(m => m === 'pounce').length, 3);
    assert.equal(moves.filter(m => m === 'lick').length, 3);
  });
  check('ascent stays close and descent becomes overhead', () => {
    const f = fixture(); f.battle(); f.level.launch([0, 28, 0], true);
    f.step(0.5);
    let shot = f.level.cameraShot();
    assert.ok(Math.hypot(shot.pos[0] - f.player.pos[0], shot.pos[2] - f.player.pos[2]) < 4);
    f.step(1.5); shot = f.level.cameraShot();
    assert.ok(shot.pos[1] - shot.target[1] > 7);
    assert.ok(Math.hypot(shot.pos[0] - shot.target[0], shot.pos[2] - shot.target[2]) < 3);
  });
  check('front paw really crosses the center, while stepping back clears the arc', () => {
    assert.ok(Math.abs(rules.pawSweepPoint(1, 0.5)[0]) < 0.01);
    const f = fixture(); f.battle(); f.place([0, 0, 4.8]); f.level.setMove('paw');
    f.step(1.3); assert.equal(f.level.tumbling, false);
  });
  check('forward paw lunge reaches a player six metres in front on either paw', () => {
    for (const side of [-1, 1]) {
      const f = fixture(); f.battle(); f.place([0, 0, 2.6]);
      f.level.puppy.pawSide = side; f.level.setMove('paw');
      f.step(0.7); assert.equal(f.level.tumbling, false, 'wind-up must stay safe');
      f.step(0.7); assert.ok(f.level.tumbling || f.player.gettingUp, `extended ${side} paw should connect`);
    }
  });
  check('pounce timing varies but always gives a readable bow and a fast jump', () => {
    const f = fixture(); f.battle(); const times = [];
    for (let i = 0; i < 12; i++) {
      f.level.setMove('pounce'); times.push(f.level.pounceWindup);
      assert.ok(f.level.pounceWindup >= 0.48 && f.level.pounceWindup <= 0.88);
      assert.ok(f.level.pounceAirtime >= 0.44 && f.level.pounceAirtime <= 0.54);
    }
    assert.ok(Math.max(...times) - Math.min(...times) > 0.05);
  });
  check('rim contact creates an intact physical ragdoll and recovers from its landing', () => {
    const f = fixture({ safeFloor: true }); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    // Clip the outward-facing edge. Pit deaths are verified separately above.
    f.level.hoopTime = 5.4; f.step(0.01);
    f.place([rules.hoopX(f.level.hoopTime) - 2, rules.HOOP_Y + 1.2 - 0.98, rules.HOOP_Z]);

    f.level.launch([0, -6, 0], false); f.level.highFlight = true;
    f.step(0.1); assert.equal(f.player.mode, 'ragdoll'); assert.equal(f.level.tumbling, true);
    assert.equal(f.player.body.brokenJoints, 0); assert.equal(f.player.body.isEnabled, true);
    f.step(8);
    assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.equal(f.player.body.brokenJoints, 0); assert.ok(f.player.pos[1] >= -0.1);
  });
  check('closed vault keeps the entire puppy behind the bars', () => {
    const f = fixture(), draws = []; f.level.puppy.draw(draws);
    // Every ellipsoid is bounded by the sum of its transformed local radii on z.
    const front = Math.max(...draws.map(d => d.model[14] + Math.abs(d.model[2]) + Math.abs(d.model[6]) + Math.abs(d.model[10])));
    assert.ok(front < -6.55, `puppy front ${front} must stay behind gate`);
  });
  check('ascending into the emitter underside bonks and tumbles instead of passing through', () => {
    const f = fixture({ safeFloor: true }); f.battle(); f.level.hoopTime = 1.8;
    f.place([5.6, rules.HOOP_Y - 1.3 - 0.98, rules.HOOP_Z]);
    f.level.launch([0, 10, 0], false); f.level.highFlight = true;
    f.step(0.18);
    assert.equal(f.player.mode, 'ragdoll'); assert.equal(f.level.tumbling, true);
    assert.ok(f.player.body.parts.pelvis.linvel().y < 0);
    assert.equal(f.player.inPortal, false);
  });
  check('a limp descending player wins and keeps the actual body pose', () => {
    const f = fixture(); f.battle(); f.level.hoopTime = 1.8;
    f.place([5.6, rules.HOOP_Y + 1.5 - 0.98, rules.HOOP_Z]);

    f.level.launch([0, -4, 0], false);
    f.level.tumbling = true; f.level.highFlight = true;
    f.step(0.45);
    assert.equal(f.level.phase, 'escape'); assert.equal(f.player.inPortal, true);
    assert.equal(f.player.body.brokenJoints, 0);
    f.step(1.3); assert.equal(f.level.status, 'exited');
  });
  check('rear bridge stays under the puppy then retracts to reveal a real shaft', () => {
    const f = fixture(); f.physics.step(0.02);
    assert.ok(f.physics.raycast([4, 1, -9.7], [0, -1, 0], 2));
    f.level.release(); f.step(7.5);
    assert.equal(f.level.bridge.retraction, 0, 'wait until the whole puppy clears the bridge');
    f.step(2.8);
    assert.equal(f.level.bridge.retraction, 1);
    assert.ok(!f.physics.raycast([4, 1, -9.7], [0, -1, 0], 3));
  });
  check('secret is on the exterior right rear landing and unlocks puppy man through restarts', () => {
    const f = fixture();
    assert.ok(f.physics.raycast([12.35, 1, -12.35], [0, -1, 0], 2));
    f.place([9.15, 0, -12.8]); f.step(0.05);
    assert.equal(f.player.puppyMan, true); assert.equal(f.level.secretFound, true);
    f.place([0, 0, 0]); assert.equal(f.player.puppyMan, true);
  });
  check('a knock can send the player through the open gate into the rear pit', () => {
    const f = fixture(); f.battle(); f.level.bridge.update(1); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([4, 0, -5.5]); f.level.launch([0, 5, -5], false); f.step(2.5);
    assert.equal(f.level.status, 'lost'); assert.ok(f.player.pos[2] < -6.5);
  });
  check('flight respects vault walls and roof but can use the open doorway', () => {
    const f = fixture();
    assert.ok(f.level.vault.flightImpact([4, 2, -5], [4, 2, -8]));
    f.level.vault.update(1);
    assert.equal(f.level.vault.flightImpact([4, 2, -5], [4, 2, -8]), null);
    assert.ok(f.level.vault.flightImpact([5, 2, -9], [10, 2, -9]));
    assert.ok(f.level.vault.flightImpact([0, 12, -9], [0, 7, -9]));
  });
  check('the exterior secret platform can be reached from the air beside the cage', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([12.35, 1.5, -10.8]); f.level.launch([0, 1, -2], false); f.step(1.3);
    assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.ok(f.player.pos[2] < -11.1); assert.ok(f.player.pos[1] > -0.2);
  });
  check('recovery accepts movement and protects against another knockdown', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([5, 0, 2]); f.level.launch([0, 0, 0], false); f.step(0.8); f.player.recoveryMoveScale = 0.5;
    f.down.add('KeyD'); f.step(0.55);
    assert.ok(f.player.pos[0] > 5.35, `recovery should move: ${f.player.pos[0]}`);
    assert.ok(f.player.knockProtection > 0);
    const stun = f.player.stun; f.player.knock([20, 10, 0], 2);
    assert.equal(f.player.stun, stun, 'protected recovery must not restart its stun');
  });
  check('turning shoulders knock a nearby player without a scheduled attack', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.step(0.05); f.player.emerge([2.05, 0.95, -2.6], 0, [0, 0, 0], 0);
    f.player.gettingUp = false; f.player.body.muscle = 1; f.level.immunity = 0;
    for (let i = 0; i < 12 && !f.player.gettingUp; i++) { f.level.puppy.yaw += 0.14; f.step(0.04); }
    assert.equal(f.player.gettingUp, true); assert.equal(f.level.move, 'recover');
  });
  check('a natural wag knocks behind the puppy without the removed tail attack', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30; f.step(0.05);
    f.player.emerge([0.9, 0.95, -6.8], 0, [0, 0, 0], 0); f.player.gettingUp = false;
    f.player.body.muscle = 1; f.level.immunity = 0; f.step(0.8);
    assert.equal(f.player.gettingUp, true); assert.equal(f.level.move, 'recover');
  });
  check('the puppy has dynamic mass and the rendered root follows its solved body', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([8, 0, 9]);
    const body = f.level.contactBody.body;
    assert.equal(body.isDynamic(), true); assert.ok(body.mass() > 100);
    body.applyImpulse({ x: body.mass() * 5, y: 0, z: 0 }, true); f.step(0.1);
    assert.ok(body.translation().x > 0.1, 'the dog must react to a real external impulse');
    assert.ok(Math.abs(f.level.puppy.physicalRoot.pos[0] - body.translation().x) < 0.001);
  });
  check('lick launch preserves every limb position and keeps the rigid body enabled', () => {
    const f = fixture(); f.battle(); f.step(0.1);
    const parts = Object.values(f.player.body.parts), before = parts.map(p => p.translation());
    f.level.launch([0, 28.8, 0], true);
    parts.forEach((p, i) => assert.deepEqual(p.translation(), before[i], 'launch must not teleport limbs'));
    assert.equal(f.player.body.isEnabled, true); assert.equal(f.player.mode, 'ragdoll');
    f.step(0.8);
    const p = f.player.body.position('pelvis');
    assert.ok(Math.hypot(f.player.pos[0] - p[0], f.player.pos[1] + 0.98 - p[1], f.player.pos[2] - p[2]) < 0.001);
  });
  check('walking into the stationary puppy does not automatically stun', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.place([2.1, 0, -4.1]); f.down.add('KeyA'); f.step(0.5); f.down.clear(); f.step(0.3);
    assert.equal(f.player.mode, 'control'); assert.equal(f.player.stun, 0);
    const p = f.player.body.position('pelvis');
    assert.ok(Math.hypot(p[0] - f.player.pos[0], p[2] - f.player.pos[2]) < 0.7, 'a gentle push cannot leave a distant animation anchor');
  });
  check('the portal arm column and articulated beam have real collision', () => {
    const f = fixture(); f.level.hoopTime = 0; f.step(0.01);
    assert.ok(f.physics.raycast([-10, 9, -1.8], [-1, 0, 0], 4));
    const x = (-13.35 - 5.8) / 2, y = (14.2 + 20.8) / 2;
    assert.ok(f.physics.raycast([x, y, 2], [0, 0, -1], 4), 'upper arm beam must stop a body');
  });
  check('connected perimeter pits have no internal wall or trim partition', () => {
    const f = fixture(); f.physics.step(0.02);
    assert.ok(!f.physics.raycast([-12.5, -2, 12.5], [1, 0, 0], 7), 'side and rear perimeter shafts must connect below the floor');
    assert.ok(!rules.pitBoundaryEdges().some(e => e.x === -11 && e.z > 11), 'no decorative seam on the shared boundary');
  });
  check('the collectible is occluded from the release button by the cage', () => {
    const f = fixture();
    assert.ok(f.level.vault.flightImpact([9.4, 1.7, -4.8], [9.15, 0.9, -12.8]));
  });
  for (const world of worlds) world.dispose();
  console.log(`${count} puppy checks passed`);
  assert.equal(failed, 0, `${failed} puppy checks failed`);
} finally {
  await server.close();
}
