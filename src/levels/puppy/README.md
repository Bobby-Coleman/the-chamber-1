# Good Boy — level 4

Run `npm ci`, then `npm run dev`, and open `http://127.0.0.1:5189/?level=4`.
The lobby also offers level 4. This uses the original character, room materials, controls,
ragdoll body and purple portal shader.

## Encounter

The giant barred vault holds the actual puppy from the start. Its reflective eyes are all
that is visible in the darkness. Press E on the red release button. Telescoping gates open
sideways and the puppy walks into the light. Movement and the normal camera remain available
throughout; there is no reveal cutscene.

- Stand in front of the nose to bait a lick. The head dips, tongue extends and curls upward.
  A centered lick launches high; jumping during the final 0.28 seconds gives extra height.
  An off-centre lick sends you sideways and lower.
- Attacks rotate through pounce, paw, lick, pounce, paw, pounce, lick. Pounces happen even
  at close range; the rear approach changes a paw attack into a tail sweep. A lick is an
  opportunity between the other attacks, never repeated immediately.
- A raised paw warns of a sideways swat; circling behind the puppy invites a tail sweep.
- At range the puppy plants its feet and crouches, barks, then pounces at a locked position.
  Landing within 4.3 metres can throw you in a varied direction. The orange floor ring marks
  the landing area. Jumping over the impact or moving clear avoids it.
- Seven real floor pits punish careless positioning. The broad middle lane remains usable.
- The exit is a sky-facing purple portal carried by an articulated machine arm 17.5 metres
  above the floor. It moves across the room on a repeatable 7.2-second cycle. Descend through
  its opening to leave. Rising through it does not win.
- WASD steers in the air. The camera stays close during ascent and smoothly rotates overhead
  near the apex. The character's flight pose spreads its limbs rather than staying rigid.
- Missing the portal is survivable: a short ragdoll landing, then recovery with protection
  from repeated hits. Falling into a pit loses the attempt. R restarts; Esc pauses.

## Integration

The level and pure scoring rules live in this folder. Models and sounds live in
`src/entities/puppy.ts`, `prisonVault.ts`, `portalArm.ts` and `puppyAudio.ts`.
`src/main.ts` adds one level factory to `LEVELS`. Shared changes are opt-in rectangular
floor pits in `ChamberOptions` and an optional flailing flight pose on `Player`; other
levels retain their existing floor and dart flight pose.

## Verification

- `npm run build`: type checking and production build.
- `npm run test:puppy`: real Rapier integration checks for attacks, jump timing, floor holes,
  recovery, free movement during the reveal, camera positions and successful portal passage.
- `?level=4&puppyQa`: development-only manual-time visual checkpoints. Useful in a browser
  that pauses animation when unfocused. These controls are removed from the production build.

Puppy audio is procedural and starts only after a keyboard or pointer gesture. No downloaded
models, textures, animation packs or sounds are required.
