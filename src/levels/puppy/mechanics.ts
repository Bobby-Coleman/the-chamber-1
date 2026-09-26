/** Pure rules shared by the level and its flight / collision regression checks. */
export type Point = [number, number, number];
export const HOOP_Y = 17.5;
export const HOOP_Z = 2.8;
export const HOOP_RADIUS = 1.8;
export const FLIGHT_GRAVITY = 18;
export const LICK_WINDUP = 1.3;
export const PAW_WINDUP = 0.7;
export const PAW_SWEEP_TIME = 0.5;
/** The animation and collision use exactly the same sweeping paw path. */
export function pawSweepPoint(side: number, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress));
  if (t < 0.3) return [side * (3.3 - t * 10), 1.25 - t * 0.5, 2.4 + t / 0.3 * 0.5];
  if (t < 0.7) return [side * (0.3 - (t - 0.3) * 1.5), 1.1, 2.9 + (t - 0.3) / 0.4 * 2.4];
  return [side * (-0.3 - (t - 0.7) * 10), 1.1 + (t - 0.7) * 0.5, 5.3 - (t - 0.7) / 0.3 * 2];
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

/** Only the outside boundary of the union gets walls; touching pits have no internal partitions. */
export function pitBoundaryEdges() {
  const result: { x: number; z: number; width: number; depth: number; length: number; alongX: boolean }[] = [];
  for (const p of PITS) for (const alongX of [true, false]) for (const sign of [-1, 1]) {
    const start = alongX ? p.x - p.width / 2 : p.z - p.depth / 2;
    const end = alongX ? p.x + p.width / 2 : p.z + p.depth / 2;
    const fixed = alongX ? p.z + sign * p.depth / 2 : p.x + sign * p.width / 2;
    const cuts = [...new Set([start, end, ...PITS.flatMap(q => alongX ? [q.x - q.width / 2, q.x + q.width / 2] : [q.z - q.depth / 2, q.z + q.depth / 2]).filter(v => v > start && v < end)])].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const midpoint = (cuts[i - 1] + cuts[i]) / 2, length = cuts[i] - cuts[i - 1];
      if (inPit(alongX ? midpoint : fixed + sign * 0.01, alongX ? fixed + sign * 0.01 : midpoint)) continue;
      result.push({ x: alongX ? midpoint : fixed, z: alongX ? fixed : midpoint, width: alongX ? length : 0.12, depth: alongX ? 0.12 : length, length, alongX });
    }
  }
  return result;
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
    velocity: [forward[0] * 1.6 + right[0] * lateral, perfect ? 28.8 : Math.abs(side) < 0.7 ? 26.4 : 19.6, forward[2] * 1.6 + right[2] * lateral],
  };
}
