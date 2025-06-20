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
		// Do not proceed if not ready, or if the instance already exists
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
			invalidateOnRefresh: true, // Recalculate on refresh
			onToggle: (self) => onToggle(self.isActive),
		})

		// A short delay to ensure onToggle fires correctly on initial load
		setTimeout(() => {
			if (scrollTriggerInstanceRef.current) {
				onToggle(scrollTriggerInstanceRef.current.isActive)
			}
		}, 10)

		const instance = scrollTriggerInstanceRef.current
		// Cleanup function for when the component unmounts or dependencies change
		return () => {
			instance?.kill()
			scrollTriggerInstanceRef.current = null
		}
	}, [containerRef, onToggle, isReady])

	return scrollTriggerInstanceRef // Return the ref for external use
}
