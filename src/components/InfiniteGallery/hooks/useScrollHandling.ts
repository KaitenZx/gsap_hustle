import { useLayoutEffect, useRef } from 'react'

import { gsap } from 'gsap'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { Observer } from 'gsap/Observer'

import { GridDimensions } from '../types'

gsap.registerPlugin(Observer, InertiaPlugin)

export interface UseScrollHandlingProps {
	containerRef: React.RefObject<HTMLDivElement | null>
	contentWrapperRef: React.RefObject<HTMLDivElement | null>
	isScrollLockedRef: { current: boolean }
	dimensionsRef: React.RefObject<GridDimensions | null>
	incrX: { current: number }
	incrY: { current: number }
	currentActualXRef: { current: number }
	currentActualYRef: { current: number }
	didDragSincePressRef: { current: boolean }
	onScroll: (direction: 'left' | 'right') => void
	onScrollActivity: () => void
	checkFooterVisibility: () => void
	onLerpStart: () => void
	onLerpStop: () => void
}

export const useScrollHandling = ({
	containerRef,
	contentWrapperRef,
	isScrollLockedRef,
	dimensionsRef,
	incrX,
	incrY,
	currentActualXRef,
	currentActualYRef,
	didDragSincePressRef,
	onScroll,
	onScrollActivity,
	checkFooterVisibility,
	onLerpStart,
	onLerpStop,
}: UseScrollHandlingProps): React.RefObject<Observer | null> => {
	const observerInstanceRef = useRef<Observer | null>(null)
	const inertiaXTweenRef = useRef<gsap.core.Tween | null>(null)
	const inertiaYTweenRef = useRef<gsap.core.Tween | null>(null)

	useLayoutEffect(() => {
		const containerElement = containerRef.current
		if (!containerElement || observerInstanceRef.current) {
			return
		}

		observerInstanceRef.current = Observer.create({
			target: containerElement,
			type: 'wheel,touch,pointer',
			preventDefault: true,
			tolerance: 5,
			dragMinimum: 3,
			onPress: () => {
				inertiaXTweenRef.current?.kill()
				inertiaYTweenRef.current?.kill()
				currentActualXRef.current = incrX.current
				currentActualYRef.current = incrY.current
				onLerpStart()
				didDragSincePressRef.current = false
			},
			onChangeX: (self) => {
				onScrollActivity()
				const dims = dimensionsRef.current
				if (!isScrollLockedRef.current || !dims || !contentWrapperRef.current)
					return
				if (self.isDragging && Math.abs(self.deltaX) < Math.abs(self.deltaY))
					return
				if (
					self.event.type === 'wheel' &&
					Math.abs(self.deltaX) < Math.abs(self.deltaY)
				)
					return
				if (self.isDragging) didDragSincePressRef.current = true
				const increment =
					self.deltaX *
					(self.event.type === 'wheel' || !self.isDragging ? 1 : 1.1)
				if (self.event.type === 'wheel') incrX.current -= increment
				else incrX.current += increment
				onLerpStart()
				if (self.deltaX < 0) onScroll('right')
				else if (self.deltaX > 0) onScroll('left')
			},
			onChangeY: (self) => {
				onScrollActivity()
				const dims = dimensionsRef.current
				if (!isScrollLockedRef.current || !dims || !contentWrapperRef.current)
					return
				if (self.isDragging && Math.abs(self.deltaY) < Math.abs(self.deltaX))
					return
				if (self.isDragging) didDragSincePressRef.current = true
				const increment =
					self.deltaY *
					(self.event.type === 'wheel' || !self.isDragging ? 1 : 1.1)
				if (self.event.type === 'wheel') incrY.current -= increment
				else incrY.current += increment
				onLerpStart()
				checkFooterVisibility()
			},
			onDragEnd: (self) => {
				const dims = dimensionsRef.current
				const contentWrapperElement = contentWrapperRef.current
				if (!dims || !contentWrapperElement || !isScrollLockedRef.current)
					return
				onLerpStop()
				inertiaXTweenRef.current?.kill()
				inertiaYTweenRef.current?.kill()
				const inertiaProxy = {
					x: currentActualXRef.current,
					y: currentActualYRef.current,
				}
				const inertiaPreloadDirection = self.velocityX < 0 ? 'right' : 'left'
				inertiaXTweenRef.current = gsap.to(inertiaProxy, {
					inertia: { x: { velocity: self.velocityX } },
					ease: 'none',
					onStart: () => {
						if (Math.abs(self.velocityX) > 50) onScroll(inertiaPreloadDirection)
					},
					onUpdate: function () {
						if (!dims || !contentWrapperElement) return
						incrX.current = inertiaProxy.x
						currentActualXRef.current = inertiaProxy.x
						gsap.set(contentWrapperElement, {
							x: dims.wrapX(currentActualXRef.current),
						})
						if (Math.abs(self.velocityX) > 50) onScroll(inertiaPreloadDirection)
					},
					onComplete: () => {
						if (dims) {
							incrX.current = inertiaProxy.x
							currentActualXRef.current = inertiaProxy.x
						}
					},
				})
				inertiaYTweenRef.current = gsap.to(inertiaProxy, {
					inertia: { y: { velocity: self.velocityY } },
					ease: 'none',
					onUpdate: function () {
						if (!dims || !contentWrapperElement) return
						incrY.current = inertiaProxy.y
						currentActualYRef.current = inertiaProxy.y
						gsap.set(contentWrapperElement, {
							y: dims.wrapY(currentActualYRef.current),
						})
						checkFooterVisibility()
					},
					onComplete: () => {
						if (dims) {
							incrY.current = inertiaProxy.y
							currentActualYRef.current = inertiaProxy.y
						}
						checkFooterVisibility()
					},
				})
			},
		})

		observerInstanceRef.current.disable()
		const instance = observerInstanceRef.current

		return () => {
			instance?.kill()
			inertiaXTweenRef.current?.kill()
			inertiaYTweenRef.current?.kill()
			observerInstanceRef.current = null
		}
	}, [
		containerRef,
		contentWrapperRef,
		isScrollLockedRef,
		dimensionsRef,
		incrX,
		incrY,
		currentActualXRef,
		currentActualYRef,
		didDragSincePressRef,
		onScroll,
		onScrollActivity,
		checkFooterVisibility,
		onLerpStart,
		onLerpStop,
	])

	return observerInstanceRef
}
