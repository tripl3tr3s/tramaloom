/**
 * Sine and cosine that every JS engine computes bit for bit the same.
 * Math.sin and Math.cos are not specified to the last bit, so engines may
 * differ in the final digits, which can flip a layout decision. These use only
 * IEEE + * / and Math.round, each correctly rounded and never fused in JS:
 * reduce to [-pi, pi], fold to [-pi/2, pi/2], then a fixed Taylor polynomial.
 */
export const TAU = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

// 1/3!, 1/5!, ... 1/19!: alternating Taylor terms of sin, error below 1e-14 on [-pi/2, pi/2].
const C3 = -1 / 6;
const C5 = 1 / 120;
const C7 = -1 / 5040;
const C9 = 1 / 362880;
const C11 = -1 / 39916800;
const C13 = 1 / 6227020800;
const C15 = -1 / 1307674368000;
const C17 = 1 / 355687428096000;
const C19 = -1 / 121645100408832000;

export function dsin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  let r = x - Math.round(x / TAU) * TAU;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (C3 + r2 * (C5 + r2 * (C7 + r2 * (C9 + r2 * (C11 + r2 * (C13 + r2 * (C15 + r2 * (C17 + r2 * C19)))))))));
}

// 1/2!, 1/4!, ... 1/20!: Taylor terms of cos, so dcos(0) is exactly 1.
const K2 = -1 / 2;
const K4 = 1 / 24;
const K6 = -1 / 720;
const K8 = 1 / 40320;
const K10 = -1 / 3628800;
const K12 = 1 / 479001600;
const K14 = -1 / 87178291200;
const K16 = 1 / 20922789888000;
const K18 = -1 / 6402373705728000;
const K20 = 1 / 2432902008176640000;

export function dcos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  let r = Math.abs(x - Math.round(x / TAU) * TAU);
  // cos(r) = -cos(pi - r) folds [pi/2, pi] onto [0, pi/2].
  const sign = r > HALF_PI ? -1 : 1;
  if (sign < 0) r = PI - r;
  const r2 = r * r;
  return sign * (1 + r2 * (K2 + r2 * (K4 + r2 * (K6 + r2 * (K8 + r2 * (K10 + r2 * (K12 + r2 * (K14 + r2 * (K16 + r2 * (K18 + r2 * K20))))))))));
}
