/**
 * Maps a value v from range [inA, inB] to range [outA, outB]
 */
export function map(
	v: number,
	inA: number,
	inB: number,
	outA: number,
	outB: number
): number {
	return outA + (outB - outA) * ((v - inA) / (inB - inA))
}

/**
 * Returns the fractional part of a float
 */
export function fract(v: number): number {
	return v - Math.floor(v)
}

/**
 * Clamps a value between min and max (inclusive)
 */
export function clamp(v: number, min: number, max: number): number {
	if (v < min) return min
	if (v > max) return max
	return v
}

/**
 * Returns -1 for negative numbers, +1 for positive numbers, 0 for zero
 */
export function sign(n: number): number {
	if (n > 0) return 1
	if (n < 0) return -1
	return 0
}

/**
 * GLSL mix: linear interpolation between v1 and v2 by a
 */
export function mix(v1: number, v2: number, a: number): number {
	return v1 * (1 - a) + v2 * a
}

/**
 * GLSL step: 0.0 if x < edge, else 1.0
 */
export function step(edge: number, x: number): number {
	return x < edge ? 0 : 1
}

/**
 * GLSL smoothstep
 * https://en.wikipedia.org/wiki/Smoothstep
 */
export function smoothstep(edge0: number, edge1: number, t: number): number {
	const x = clamp((t - edge0) / (edge1 - edge0), 0, 1)
	return x * x * (3 - 2 * x)
}

/**
 * GLSL smootherstep
 */
export function smootherstep(edge0: number, edge1: number, t: number): number {
	const x = clamp((t - edge0) / (edge1 - edge0), 0, 1)
	return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * GLSL modulo
 */
export function mod(a: number, b: number): number {
	return a % b
}
