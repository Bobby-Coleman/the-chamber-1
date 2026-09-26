/** Pure rules shared by the level and its flight / collision regression checks. */
export type Point = [number, number, number];
export const HOOP_Y = 17.5;
export const HOOP_Z = 2.8;
export const HOOP_RADIUS = 1.8;
export const FLIGHT_GRAVITY = 18;
export const LICK_WINDUP = 1.3;
export const PAW_WINDUP = 0.7;
export const PAW_SWEEP_TIME = 0.42;
/** The animation and collision use exactly the same sweeping paw path. */
export function pawSweepPoint(side: number, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress));
  return [side * (2.7 - t * 5.4), 1.5 - Math.sin(t * Math.PI) * 0.55, 2.7 + Math.sin(t * Math.PI) * 1.15];
}
export const REAR_PIT = { x: 0, z: -9.7, width: 12, depth: 6.4 };
export const PITS = [
  REAR_PIT,
  { x: -12.5, z: 1.5, width: 3, depth: 25 },
  { x: 12.5, z: 1.5, width: 3, depth: 25 },
  { x: 0, z: 12.5, width: 22, depth: 3 },
  { x: -7.7, z: 6.2, width: 2.8, depth: 2.8 },
  { x: 7.7, z: 6.2, width: 2.8, depth: 2.8 },
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

/** A body entering the rim's vertical band activates physical collision before its feet tunnel through. */
export function rimImpact(from: Point, to: Point, beforeTime: number, afterTime: number): Point | null {
  const descending = to[1] < from[1];
  const plane = HOOP_Y + (descending ? 0.85 : -0.95);
  if (descending ? from[1] < plane || to[1] > plane : from[1] > plane || to[1] < plane) return null;
  const dy = to[1] - from[1]; if (Math.abs(dy) < 1e-8) return null;
  const k = (plane - from[1]) / dy;
  const p: Point = [from[0] + (to[0] - from[0]) * k, plane, from[2] + (to[2] - from[2]) * k];
  const radius = Math.hypot(p[0] - hoopX(beforeTime + (afterTime - beforeTime) * k), p[2] - HOOP_Z);
  return radius > HOOP_RADIUS - 0.25 && radius < HOOP_RADIUS + 0.78 ? p : null;
}

/** The emitter has a solid underside: an ascending player must go around it. */
export function undersideImpact(from: Point, to: Point, beforeTime: number, afterTime: number): Point | null {
  const plane = HOOP_Y - 1.05;
  if (to[1] <= from[1] || from[1] > plane || to[1] < plane) return null;
  const k = (plane - from[1]) / (to[1] - from[1]);
  const p: Point = [from[0] + (to[0] - from[0]) * k, plane, from[2] + (to[2] - from[2]) * k];
  return Math.hypot(p[0] - hoopX(beforeTime + (afterTime - beforeTime) * k), p[2] - HOOP_Z) < HOOP_RADIUS + 0.3 ? p : null;
}

/** A late jump and the middle of the tongue give height; edges give a readable sideways shove. */
export function lickVelocity(side: number, forward: Point, jumpAge: number): { velocity: Point; perfect: boolean } {
  const perfect = Math.abs(side) < 0.7 && jumpAge >= 0 && jumpAge <= 0.28;
  const right: Point = [forward[2], 0, -forward[0]];
  const lateral = Math.max(-1, Math.min(1, side / 1.4)) * 7;
  return {
    perfect,
    velocity: [forward[0] * 1.6 + right[0] * lateral, perfect ? 28.8 : Math.abs(side) < 0.7 ? 26.4 : 19.6, forward[2] * 1.6 + right[2] * lateral],
  };
}
