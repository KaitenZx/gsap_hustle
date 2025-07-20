import { useLayoutEffect, useRef } from 'react'

import { ScrollTrigger } from 'gsap/ScrollTrigger'

interface UseScrollTriggerPinningProps {
	containerRef: React.RefObject<HTMLDivElement | null>
	onToggle: (isActive: boolean) => void
	isReady: boolean
}

export const useScrollTriggerPinning = ({
	containerRef,
	onToggle,
	isReady,
}: UseScrollTriggerPinningProps) => {
	const scrollTriggerInstanceRef = useRef<ScrollTrigger | null>(null)

	useLayoutEffect(() => {
		const container = containerRef.current
		if (!container || !isReady || scrollTriggerInstanceRef.current) {
			return
		}

		scrollTriggerInstanceRef.current = ScrollTrigger.create({
			trigger: container,
			start: 'top top',
			end: '+=30000', // Effectively "infinite" pinning
			pin: true,
			pinSpacing: true,
			anticipatePin: 0,
			invalidateOnRefresh: true,
			onToggle: (self) => onToggle(self.isActive),
		})

		setTimeout(() => {
			if (scrollTriggerInstanceRef.current) {
				onToggle(scrollTriggerInstanceRef.current.isActive)
			}
		}, 10)

		const instance = scrollTriggerInstanceRef.current
		return () => {
			instance?.kill()
			scrollTriggerInstanceRef.current = null
		}
	}, [containerRef, onToggle, isReady])

	return scrollTriggerInstanceRef
}
