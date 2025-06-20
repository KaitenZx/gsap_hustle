import { useLayoutEffect, useRef, useCallback } from 'react'

import { gsap } from 'gsap'

import { GridDimensions, MediaAnimData } from '../lib/types'

const ROTATION_CLAMP = 18
const ROTATION_SENSITIVITY = 18

export interface UseItemRotationProps {
	containerRef: React.RefObject<HTMLDivElement | null>
	contentWrapperRef: React.RefObject<HTMLDivElement | null>
	dimensionsRef: React.RefObject<GridDimensions | null>
	mediaAnimRefs: React.RefObject<Map<string, MediaAnimData>>
	isTouchDevice: boolean
	isScrollingRef: { current: boolean }
}

export const useItemRotation = ({
	containerRef,
	contentWrapperRef,
	dimensionsRef,
	mediaAnimRefs,
	isTouchDevice,
	isScrollingRef,
}: UseItemRotationProps) => {
	const mousePos = useRef({ x: 0, y: 0 })
	const scrollStopTimeoutRef = useRef<number | null>(null)

	useLayoutEffect(() => {
		const containerElement = containerRef.current
		const contentWrapperElement = contentWrapperRef.current
		if (!containerElement || !contentWrapperElement) {
			return
		}

		let updateRotationsRequest: number | null = null

		const updateRotations = () => {
			updateRotationsRequest = null
			const currentMap = mediaAnimRefs.current
			const dims = dimensionsRef.current

			if (
				!currentMap ||
				currentMap.size === 0 ||
				isTouchDevice ||
				!dims ||
				!contentWrapperElement ||
				isScrollingRef.current
			)
				return

			const targetMouseX = mousePos.current.x
			const targetMouseY = mousePos.current.y
			const containerRect = containerElement.getBoundingClientRect()
			const wrapperCurrentX = gsap.getProperty(
				contentWrapperElement,
				'x'
			) as number
			const wrapperCurrentY = gsap.getProperty(
				contentWrapperElement,
				'y'
			) as number

			currentMap.forEach((refData) => {
				if (refData.element && refData.rotX && refData.rotY) {
					const itemBaseOffsetX =
						refData.visualColumnIndex * dims.columnTotalWidth +
						dims.wrapperPaddingLeft
					const itemBaseOffsetY =
						refData.visualRowIndexInColumn * (dims.itemHeight + dims.rowGap) +
						dims.wrapperPaddingTop
					const itemScreenX =
						containerRect.left + itemBaseOffsetX + wrapperCurrentX
					const itemScreenY =
						containerRect.top + itemBaseOffsetY + wrapperCurrentY

					if (
						itemScreenY + dims.itemHeight < 0 ||
						itemScreenY > window.innerHeight ||
						itemScreenX + dims.columnWidth < 0 ||
						itemScreenX > window.innerWidth
					) {
						return
					}

					const midpointX = itemScreenX + dims.columnWidth / 2
					const midpointY = itemScreenY + dims.itemHeight / 2
					const rotX = (targetMouseY - midpointY) / ROTATION_SENSITIVITY
					const rotY = (targetMouseX - midpointX) / ROTATION_SENSITIVITY
					const clampedRotX = gsap.utils.clamp(
						-ROTATION_CLAMP,
						ROTATION_CLAMP,
						rotX
					)
					const clampedRotY = gsap.utils.clamp(
						-ROTATION_CLAMP,
						ROTATION_CLAMP,
						rotY
					)
					const finalRotX = clampedRotX * -1
					const finalRotY = clampedRotY
					const previousRotX = refData.lastRotX || 0
					const previousRotY = refData.lastRotY || 0

					if (
						Math.abs(finalRotX - previousRotX) > 0.01 ||
						Math.abs(finalRotY - previousRotY) > 0.01
					) {
						refData.rotX(finalRotX)
						refData.rotY(finalRotY)
						refData.lastRotX = finalRotX
						refData.lastRotY = finalRotY
					}
				}
			})
		}

		const requestRotationUpdate = () => {
			if (!updateRotationsRequest) {
				updateRotationsRequest = requestAnimationFrame(updateRotations)
			}
		}

		const handleMouseMove = (event: MouseEvent) => {
			if (isTouchDevice) return
			mousePos.current = { x: event.clientX, y: event.clientY }
			requestRotationUpdate()
		}

		window.addEventListener('mousemove', handleMouseMove)

		return () => {
			window.removeEventListener('mousemove', handleMouseMove)
			if (updateRotationsRequest) {
				cancelAnimationFrame(updateRotationsRequest)
			}
		}
	}, [
		containerRef,
		contentWrapperRef,
		dimensionsRef,
		isScrollingRef,
		isTouchDevice,
		mediaAnimRefs,
	])

	const handleScrollActivity = useCallback(() => {
		if (!isScrollingRef.current) {
			isScrollingRef.current = true
		}

		if (scrollStopTimeoutRef.current) {
			clearTimeout(scrollStopTimeoutRef.current)
		}

		scrollStopTimeoutRef.current = window.setTimeout(() => {
			if (isScrollingRef.current) {
				isScrollingRef.current = false
			}
		}, 150)
	}, [isScrollingRef])

	return { handleScrollActivity }
}
