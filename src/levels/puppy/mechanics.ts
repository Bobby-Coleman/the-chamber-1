/** Pure rules shared by the level and its flight / collision regression checks. */
export type Point = [number, number, number];
export const HOOP_Y = 17.5;
export const HOOP_Z = 2.8;
export const HOOP_RADIUS = 1.8;
export const FLIGHT_GRAVITY = 18;
export const LICK_WINDUP = 1.3;
export const PITS = [
  { x: -8.3, z: 3, width: 2.8, depth: 3.4 },
  { x: 8.3, z: 3, width: 2.8, depth: 3.4 },
  { x: 0, z: 8.6, width: 3.2, depth: 2.8 },
  { x: -8.8, z: -3.2, width: 2.5, depth: 2.8 },
  { x: 8.8, z: -3.2, width: 2.5, depth: 2.8 },
  { x: -6.3, z: 8.5, width: 2.7, depth: 2.7 },
  { x: 6.3, z: 8.5, width: 2.7, depth: 2.7 },
];

export const hoopX = (time: number) => Math.sin(time * (Math.PI * 2 / 7.2)) * 5.6;

export function inPit(x: number, z: number, inset = 0) {
  return PITS.some(p => Math.abs(x - p.x) < p.width / 2 - inset && Math.abs(z - p.z) < p.depth / 2 - inset);
}

/** Swept relative crossing: fast falls and a moving hoop cannot tunnel past one another. */
export function hoopCrossing(from: Point, to: Point, beforeTime: number, afterTime: number) {
  if (from[1] <= HOOP_Y || to[1] > HOOP_Y || to[1] >= from[1]) return false;
  const k = (from[1] - HOOP_Y) / (from[1] - to[1]);
  const x = from[0] + (to[0] - from[0]) * k;
  const z = from[2] + (to[2] - from[2]) * k;
  const t = beforeTime + (afterTime - beforeTime) * k;
  return Math.hypot(x - hoopX(t), z - HOOP_Z) < HOOP_RADIUS - 0.25;
}

/** A late jump and the middle of the tongue give height; edges give a readable sideways shove. */
export function lickVelocity(side: number, forward: Point, jumpAge: number): { velocity: Point; perfect: boolean } {
  const perfect = Math.abs(side) < 0.7 && jumpAge >= 0 && jumpAge <= 0.28;
  const right: Point = [forward[2], 0, -forward[0]];
  const lateral = Math.max(-1, Math.min(1, side / 1.4)) * 7;
  return {
    perfect,
    velocity: [forward[0] * 1.6 + right[0] * lateral, perfect ? 28 : Math.abs(side) < 0.7 ? 25.6 : 18.8, forward[2] * 1.6 + right[2] * lateral],
  };
}
