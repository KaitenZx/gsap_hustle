import { clamp, mix } from './num'
import { Vec2, length, sub, dot, mulN } from './vec2'

export function sdCircle(p: Vec2, radius: number): number {
	return length(p) - radius
}

export function sdBox(p: Vec2, size: Vec2): number {
	const d: Vec2 = {
		x: Math.abs(p.x) - size.x,
		y: Math.abs(p.y) - size.y,
	}
	// Clamp to 0 for components inside the box
	const dxClamped = Math.max(d.x, 0)
	const dyClamped = Math.max(d.y, 0)

	// Distance from origin for points outside the box in one or two axes
	const outsideDist = length({ x: dxClamped, y: dyClamped })

	// For points inside, one of d.x or d.y (or both) will be negative.
	// The largest of these negative values (closest to zero) indicates the shortest distance to an edge from within.
	// Math.min(Math.max(d.x, d.y), 0.0) effectively gets this: if both d.x, d.y are positive (outside), it's 0.
	// If one or both are negative (inside), it gets max(d.x, d.y) which is the smaller negative distance (closer to edge).
	const insideDist = Math.min(Math.max(d.x, d.y), 0.0)

	return outsideDist + insideDist
}

export function sdSegment(
	p: Vec2,
	a: Vec2,
	b: Vec2,
	thickness: number
): number {
	const pa = sub(p, a)
	const ba = sub(b, a)
	const h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)
	return length(sub(pa, mulN(ba, h))) - thickness
}

export function opSmoothUnion(d1: number, d2: number, k: number): number {
	const h = clamp(0.5 + (0.5 * (d2 - d1)) / k, 0.0, 1.0)
	return mix(d2, d1, h) - k * h * (1.0 - h)
}

export function opSmoothSubtraction(d1: number, d2: number, k: number): number {
	const h = clamp(0.5 - (0.5 * (d2 + d1)) / k, 0.0, 1.0)
	return mix(d2, -d1, h) + k * h * (1.0 - h)
}

export function opSmoothIntersection(
	d1: number,
	d2: number,
	k: number
): number {
	const h = clamp(0.5 - (0.5 * (d2 - d1)) / k, 0.0, 1.0)
	return mix(d2, d1, h) + k * h * (1.0 - h)
}
