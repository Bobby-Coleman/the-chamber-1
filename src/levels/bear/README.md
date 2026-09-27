# A Bigger Bear (Level 5)

Standalone level using the existing player, ragdoll physics, renderer and portal effects.

- Walk a winding route through the forest while the smaller bear patrols. Detection at the forest exit is unavoidable. Run the north–west–south–west corridor, then use the 35-metre final straight to read and choose. Advance signs repeat the door names at the start of the final hallway.
- Pursuit speed changes smoothly to gain and lose ground during a sprint; stopping lets the bear close in. Movement checks prevent the bear from passing through walls and trees.
- Narrow doorways and entry screens conceal both encounters from the chase hall.
- Visit 1: harmless talking man; the bigger bear causes a visible maul and retry.
- Visit 2: cowboy greets the player and draws when they leave; the bigger bear remains dangerous.
- Visit 3: tiny man opens an unusably small portal; walk around the giant teddy to find the real exit.
- Choice-room deaths advance the visit; chase deaths retry the same visit. R retains the current visit. Reloading or starting from the lobby begins a fresh story.
- Death remains visible for 3.8 seconds before automatic restart.

The lobby selector is a physical casino cabinet. Enter up to three digits with the number row or numeric keypad; Enter/PLAY starts an available level. C/CLR clears; Backspace deletes. Aim and click or use E on physical buttons. Pull the side lever (or press L nearby) to spin three reels and select a random available level. Last played is stored in browser settings when gameplay actually starts.

## Verification

`npm run test:bear` covers story progression, real ragdolls, retry timing, portal size, physical routes and concealment, and keypad/random-selection behavior. `npm run test:puppy` covers the existing puppy level. `npm run build` checks TypeScript and the production bundle.

Development-only visual controls: `?level=5&bearQa`. `?lobbyQa` frames the selector. These controls are excluded from production builds.

## Audio

Dialogue WAV files were generated locally using the installed Microsoft speech synthesizer. Tiny-man dialogue changes playback pitch. Growls and roars use public-domain US Fish and Wildlife Service recordings sourced through SoundBible; see `src/assets/audio/bear/SOURCES.txt` for original sources and excerpt details. Impacts, footfalls, gunshots and slot-machine ticks are synthesized in the browser. No external service or runtime voice download is required.
