import { basis, cross, length, mul, normalize, scale, scaling, sub, translation, type Vec3 } from '../engine/math';
import { Pattern, type DrawItem } from '../engine/renderer';

const STEEL = [0.16, 0.20, 0.25], PLATE = [0.39, 0.45, 0.49], ORANGE = [0.88, 0.37, 0.055];

/** Articulated portal emitter, bolted to the west wall. Its wrist carries the ring at its edge. */
export function drawPortalArm(out: DrawItem[], centre: Vec3, radius: number, time: number) {
  const box = (p: Vec3, size: Vec3, color: number[]) => out.push({ mesh: 'box', model: mul(translation(p), scaling(size)), color, spec: 0.45 });
  const beam = (a: Vec3, b: Vec3, width: number, depth: number, color: number[]) => {
    const y = normalize(sub(b, a)), x = normalize(cross([0, 0, 1], y)), z = cross(x, y);
    out.push({ mesh: 'box', model: basis(scale(x, width), scale(y, length(sub(b, a))), scale(z, depth), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), color, spec: 0.55 });
  };
  const base: Vec3 = [-11.25, 14.2, -1.8];
  const elbow: Vec3 = [-5.8 + centre[0] * 0.36, 20.8, 0];
  const wrist: Vec3 = [centre[0], centre[1] - 0.08, centre[2] - radius - 0.32];
  box([-11.25, 7.15, -1.8], [1.05, 14.3, 1.6], STEEL);
  box([-11.2, 0.3, -1.8], [1.55, 0.6, 3.3], PLATE);
  for (let y = 1; y < 14; y += 1.8) box([-10.69, y, -1.8], [0.12, 0.26, 1.75], ORANGE);
  beam(base, elbow, 0.8, 0.95, STEEL);
  beam(elbow, wrist, 0.65, 0.8, PLATE);
  beam([base[0] + 0.3, base[1] - 1.4, base[2] + 0.6], [elbow[0] - 1.1, elbow[1] - 0.4, elbow[2] + 0.6], 0.20, 0.20, [0.64, 0.67, 0.7]);
  for (const p of [base, elbow, wrist]) {
    out.push({ mesh: 'cylinder', model: basis([0.72, 0, 0], [0, 0, 1.25], [0, 0.72, 0], p), color: STEEL, spec: 0.7 });
    out.push({ mesh: 'cylinder', model: basis([0.36, 0, 0], [0, 0, 0.10], [0, 0.36, 0], [p[0], p[1], p[2] + 0.68]), color: ORANGE, spec: 0.5 });
  }
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, r = radius + 0.24;
    const p: Vec3 = [centre[0] + Math.cos(a) * r, centre[1] - 0.04, centre[2] + Math.sin(a) * r];
    out.push({ mesh: 'box', model: basis([-Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], [0, 0.36, 0], [Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52], p), color: i % 6 === 0 ? PLATE : STEEL, spec: 0.65 });
    const inner: Vec3 = [centre[0] + Math.cos(a) * (radius + 0.02), centre[1] + 0.12, centre[2] + Math.sin(a) * (radius + 0.02)];
    out.push({ mesh: 'sphere', model: mul(translation(inner), scaling([0.10, 0.08, 0.10])), color: [0.68, 0.14, 1], pattern: Pattern.emissive, shadow: false });
    if (i % 6 === 0) out.push({ mesh: 'sphere', model: mul(translation([p[0], p[1] - 0.23, p[2]]), scaling([0.13, 0.06, 0.13])), color: [0.6 + Math.sin(time * 3) * 0.08, 0.12, 1], pattern: Pattern.emissive, shadow: false });
  }
}
