import { useRef, useCallback, useEffect } from 'react'

import { gsap } from 'gsap'

import { GridDimensions } from '../lib/types'

const LERP_FACTOR = 0.7

interface UseLerpAnimationProps {
	isInitializedRef: React.RefObject<boolean>
	dimensionsRef: React.RefObject<GridDimensions | null>
	contentWrapperRef: React.RefObject<HTMLDivElement | null>
	incrX: { current: number }
	incrY: { current: number }
	currentActualXRef: { current: number }
	currentActualYRef: { current: number }
}

export const useLerpAnimation = ({
	isInitializedRef,
	dimensionsRef,
	contentWrapperRef,
	incrX,
	incrY,
	currentActualXRef,
	currentActualYRef,
}: UseLerpAnimationProps) => {
	const lerpLoopIdRef = useRef<number | null>(null)
	const isLerpingActiveRef = useRef(false)

	const lerpStep = useCallback(() => {
		if (
			!isInitializedRef.current ||
			!dimensionsRef.current ||
			!contentWrapperRef.current
		) {
			if (isLerpingActiveRef.current) {
				lerpLoopIdRef.current = requestAnimationFrame(lerpStep)
			} else {
				lerpLoopIdRef.current = null
			}
			return
		}

		const dims = dimensionsRef.current
		const targetX = incrX.current
		const targetY = incrY.current

		let newActualX =
			currentActualXRef.current +
			(targetX - currentActualXRef.current) * LERP_FACTOR
		let newActualY =
			currentActualYRef.current +
			(targetY - currentActualYRef.current) * LERP_FACTOR

		const deltaThreshold = 0.01
		if (Math.abs(targetX - newActualX) < deltaThreshold) newActualX = targetX
		if (Math.abs(targetY - newActualY) < deltaThreshold) newActualY = targetY

		if (
			currentActualXRef.current !== newActualX ||
			currentActualYRef.current !== newActualY
		) {
			currentActualXRef.current = newActualX
			currentActualYRef.current = newActualY

			gsap.set(contentWrapperRef.current, {
				x: dims.wrapX(currentActualXRef.current),
				y: dims.wrapY(currentActualYRef.current),
			})
		}

		if (isLerpingActiveRef.current) {
			if (
				currentActualXRef.current !== targetX ||
				currentActualYRef.current !== targetY
			) {
				lerpLoopIdRef.current = requestAnimationFrame(lerpStep)
			} else {
				isLerpingActiveRef.current = false
				lerpLoopIdRef.current = null
			}
		} else {
			lerpLoopIdRef.current = null
		}
	}, [
		isInitializedRef,
		dimensionsRef,
		contentWrapperRef,
		incrX,
		incrY,
		currentActualXRef,
		currentActualYRef,
	])

	const startLerp = useCallback(() => {
		if (!isLerpingActiveRef.current) {
			isLerpingActiveRef.current = true
			if (!lerpLoopIdRef.current) {
				lerpLoopIdRef.current = requestAnimationFrame(lerpStep)
			}
		}
	}, [lerpStep])

	const stopLerp = useCallback(() => {
		isLerpingActiveRef.current = false
	}, [])

	useEffect(() => {
		const loopId = lerpLoopIdRef.current
		return () => {
			if (loopId) {
				cancelAnimationFrame(loopId)
			}
		}
	}, [])

	return { startLerp, stopLerp }
}
