import { useEffect } from 'react'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import styles from '../index.module.scss'

const DITHER_FADE_VH = 100
const TEXT_ANIM_SCROLL_DISTANCE_VH = 300
const PAUSE_SCROLL_DISTANCE_VH = 40

const wrapWordsInSpans = (elements: HTMLElement[]) => {
	elements.forEach((element) => {
		if (!element?.textContent) return
		element.innerHTML = element.textContent
			.split(' ')
			.map((word) => `<span class="${styles.word}">${word}</span>`)
			.join(' ')
	})
}

const groupWordsByLines = (elements: HTMLElement[]): HTMLElement[][] => {
	if (elements.length === 0) {
		return []
	}

	const wordsWithPositions = elements.map((el) => ({
		element: el,
		top: el.offsetTop,
	}))

	const lines: HTMLElement[][] = []
	if (wordsWithPositions.length > 0) {
		let currentLine: HTMLElement[] = [wordsWithPositions[0].element]
		let lastOffsetTop = wordsWithPositions[0].top

		for (let i = 1; i < wordsWithPositions.length; i++) {
			const wordInfo = wordsWithPositions[i]
			if (wordInfo.top === lastOffsetTop) {
				currentLine.push(wordInfo.element)
			} else {
				lines.push(currentLine)
				currentLine = [wordInfo.element]
				lastOffsetTop = wordInfo.top
			}
		}
		lines.push(currentLine)
	}

	return lines
}

interface UseTextPinningAnimationProps {
	pinHeightRef: React.RefObject<HTMLDivElement | null>
	pinnedTextContainerRef: React.RefObject<HTMLDivElement | null>
	canvasRef: React.RefObject<HTMLCanvasElement | null>
	aboutMeContainerRef: React.RefObject<HTMLDivElement | null>
	ditherStrength: { current: number }
	setIsAboutMePinned: (isPinned: boolean) => void
}

export const useTextPinningAnimation = ({
	pinHeightRef,
	pinnedTextContainerRef,
	canvasRef,
	aboutMeContainerRef,
	ditherStrength,
	setIsAboutMePinned,
}: UseTextPinningAnimationProps) => {
	useEffect(() => {
		gsap.registerPlugin(ScrollTrigger)

		const pinHeightEl = pinHeightRef.current
		const pinnedTextContainerEl = pinnedTextContainerRef.current
		const currentCanvasElement = canvasRef.current
		const aboutMeContainerEl = aboutMeContainerRef.current

		if (
			!pinHeightEl ||
			!pinnedTextContainerEl ||
			!aboutMeContainerEl ||
			!currentCanvasElement
		) {
			console.warn(
				'[AboutMe GSAP] Missing elements for text/dither animation setup.'
			)
			return
		}

		// Using gsap.context for cleanup
		const ctx = gsap.context(() => {
			let masterTimeline: gsap.core.Timeline | null = null

			ScrollTrigger.create({
				trigger: pinHeightEl,
				start: 'top top',
				end: `+=${DITHER_FADE_VH}vh`,
				scrub: true,
				onUpdate: (self) => {
					ditherStrength.current = 1 - self.progress
					const targetOpacity = 1 - self.progress * (1 - 0.4)
					currentCanvasElement.style.opacity = targetOpacity.toFixed(2)
				},
			})

			const initTextAnimation = () => {
				if (!pinnedTextContainerEl || !pinHeightEl) return

				const elementsToWrap = Array.from(
					pinnedTextContainerEl.querySelectorAll(
						`.${styles.aboutColumn} h2, .${styles.aboutColumn} p,` +
							`.${styles.exposColumn} h2, .${styles.exposColumn} .${styles.animatableText},` +
							`.${styles.linksColumn} h2, .${styles.linksColumn} .${styles.animatableText}`
					)
				).filter((el): el is HTMLElement => el instanceof HTMLElement)

				// Save original HTML to revert on cleanup
				const originalHTMLs = new Map<HTMLElement, string>()
				elementsToWrap.forEach((el) => {
					originalHTMLs.set(el, el.innerHTML)
				})

				if (elementsToWrap.length > 0) {
					wrapWordsInSpans(elementsToWrap)
				}

				const words = Array.from(
					pinnedTextContainerEl.querySelectorAll(`.${styles.word}`)
				).filter((el): el is HTMLElement => el instanceof HTMLElement)

				if (words.length === 0) {
					console.warn('[AboutMe GSAP] No words found to animate.')
					return
				}

				gsap.set(words, { autoAlpha: 0, x: '100vw' })
				gsap.set(pinnedTextContainerEl, { opacity: 1 })

				ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: pinnedTextContainerEl,
					start: `top top-=${DITHER_FADE_VH}vh`,
					end: 'bottom bottom',
					pinSpacing: false,
					onToggle: (self) => setIsAboutMePinned(self.isActive),
				})

				ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: currentCanvasElement,
					start: 'top top',
					end: 'bottom bottom',
					pinSpacing: false,
				})

				masterTimeline = gsap.timeline({
					scrollTrigger: {
						trigger: pinHeightEl,
						scrub: true,
						start: `top top-=${DITHER_FADE_VH}vh`,
						end: `bottom bottom-=${DITHER_FADE_VH}vh`,
					},
				})

				const aboutWords = Array.from(
					pinnedTextContainerEl.querySelectorAll(
						`.${styles.aboutColumn} .${styles.word}`
					)
				).filter((el): el is HTMLElement => el instanceof HTMLElement)
				const exposAndLinksWords = Array.from(
					pinnedTextContainerEl.querySelectorAll(
						`.${styles.exposLinksWrapper} .${styles.word}`
					)
				).filter((el): el is HTMLElement => el instanceof HTMLElement)

				const aboutLines = groupWordsByLines(aboutWords)
				const exposAndLinksLines = groupWordsByLines(exposAndLinksWords)

				const commonTweenVars = {
					autoAlpha: 1,
					x: 0,
					ease: 'power1.inOut',
					stagger: {
						each: 0.05,
						onStart: function (this: gsap.core.Tween) {
							const link = (this.targets()[0] as HTMLElement).closest('a')
							if (link) link.style.pointerEvents = 'auto'
						},
						onReverseComplete: function (this: gsap.core.Tween) {
							const link = (this.targets()[0] as HTMLElement).closest('a')
							if (link) link.style.pointerEvents = 'none'
						},
					},
				}

				aboutLines.forEach((line) => {
					masterTimeline?.to(line, commonTweenVars, '<')
				})
				exposAndLinksLines.forEach((line) => {
					masterTimeline?.to(line, commonTweenVars, '<')
				})

				const animationDuration = masterTimeline.duration()
				if (TEXT_ANIM_SCROLL_DISTANCE_VH > 0.01 && animationDuration > 0) {
					const pauseDuration =
						animationDuration *
						(PAUSE_SCROLL_DISTANCE_VH / TEXT_ANIM_SCROLL_DISTANCE_VH)
					masterTimeline.to({}, { duration: pauseDuration })
				}

				if (masterTimeline.duration() === 0) {
					masterTimeline.to({}, { duration: 0.01 })
				}
			}

			document.fonts.ready
				.then(() => {
					initTextAnimation()
				})
				.catch((error) => {
					console.error(
						'Font loading failed, initializing animation with fallback fonts:',
						error
					)
					initTextAnimation()
				})

			ScrollTrigger.create({
				trigger: pinHeightEl,
				start: 'bottom bottom',
				scrub: false,
				onEnter: () => {
					ditherStrength.current = 0.3
					if (currentCanvasElement) {
						currentCanvasElement.style.opacity = '1.0'
					}
				},
				onLeaveBack: () => {
					const initialOpacity = 0.1
					ditherStrength.current = 0.0
					if (currentCanvasElement) {
						currentCanvasElement.style.opacity = initialOpacity.toFixed(2)
					}
				},
			})
		}, aboutMeContainerEl) // scope for the context

		return () => {
			console.log('[AboutMe GSAP] Timelines and ScrollTriggers cleaned up.')
			ctx.revert()
		}
	}, [
		pinHeightRef,
		pinnedTextContainerRef,
		canvasRef,
		aboutMeContainerRef,
		ditherStrength,
		setIsAboutMePinned,
	])
}
