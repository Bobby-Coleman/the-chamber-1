# Good Boy — level 4

Run `npm ci`, then `npm run dev`, and open `http://127.0.0.1:5189/?level=4`.
The lobby also offers level 4. This uses the original character, room materials, controls,
ragdoll body and purple portal shader.

## Encounter

The giant barred vault holds the actual puppy from the start. Its reflective eyes are all
that is visible in the darkness. Press E on the red button beside the right side of the cage. Telescoping gates open
sideways and the puppy walks into the light. Movement and the normal camera remain available
throughout; there is no reveal cutscene.
Pink hearts float up above his head as he walks into the light and fade after the greeting.

- Stand in front of the nose to bait a lick. The head dips, tongue extends and curls upward.
  A centered lick launches high; jumping during the final 0.28 seconds gives extra height.
  An off-centre lick sends you sideways and lower.
- Attacks rotate through varied paw/pounce pairs, with a lick every third attack. Pounces happen even
  at close range; the rear approach changes a paw attack into a tail sweep. A lick is an
  opportunity between the other attacks, never repeated immediately.
- A raised paw reaches forward and sweeps across the entire front of the puppy. The orange
  arc, visible foot and active hit window follow the same path, with a forward lunge reaching
  roughly six metres from his starting position; back away or move behind him.
  Circling behind the puppy can invite a tail sweep.
- The puppy makes short committed trots and quick turns between attacks, with planted feet,
  lifted return steps, blinking, a smiling jaw, animated barks and flopping ears.
- The puppy plants its feet, crouches and barks, then pounces. The bow varies from 0.48–0.88
  seconds and the leap takes 0.44–0.54 seconds. Targeting locks halfway through the bow.
  Landing within 4.3 metres can throw you in a varied direction. The orange floor ring marks
  the landing area. Jumping over the impact or moving clear avoids it.
- The chamber is slightly larger (28m across). Deep trenches cover most of the perimeter,
  with two additional holes near the sides of the fighting area. Steel lips, retaining ribs,
  dim lamps and shaft walls fade into darkness 36m below. The fall camera stays above the rim,
  releasing back to normal follow if you catch the edge or regain footing.
- The exit is a sky-facing purple portal carried by an articulated machine arm 17.5 metres
  above the floor. It moves across the room on a repeatable 7.2-second cycle. Descend through
  its opening to leave. Rising through it does not win.
- WASD steers in the air. The camera stays close during ascent and smoothly rotates overhead
  near the apex. The character's flight pose spreads its limbs rather than staying rigid.
- Missing the portal is survivable: a short ragdoll landing, then recovery with protection
  from repeated hits. Falling into a pit loses the attempt. R restarts; Esc pauses.
- Clipping the machine's rim activates an intact physical ragdoll. Its moving colliders catch
  individual limbs; steering stops, the body tumbles and lands naturally, then gets up from
  its actual resting pose. A clear descent through the opening still wins.

## Integration

The level and pure scoring rules live in this folder. Models and sounds live in
`src/entities/puppy.ts`, `prisonVault.ts`, `portalArm.ts` and `puppyAudio.ts`.
`src/main.ts` adds one level factory to `LEVELS`. Shared changes are opt-in rectangular
floor pits and room size in `ChamberOptions`, an optional flailing flight pose on `Player`,
and nonfatal physical tumble/recovery methods. Other levels retain their existing floor,
room size and dart flight pose.

## Verification

- `npm run build`: type checking and production build.
- `npm run test:puppy`: real Rapier integration checks for attacks, jump timing, floor holes,
  recovery, free movement during the reveal, camera positions and successful portal passage.
- `?level=4&puppyQa`: development-only manual-time visual checkpoints. Useful in a browser
  that pauses animation when unfocused. These controls are removed from the production build.

Audio starts only after a keyboard or pointer gesture. Barks use a locally bundled CC0 dog
recording with subtle playback variation; the lick and landing cues remain procedural.
See `CREDITS.md` for the recording's source and license. No downloaded models, textures or
animation packs are required.
