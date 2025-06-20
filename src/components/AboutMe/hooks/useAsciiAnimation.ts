import { useEffect, useRef, useCallback } from 'react'

import { ScrollTrigger } from 'gsap/ScrollTrigger'
import debounce from 'lodash/debounce'

import { sdCircle, opSmoothUnion } from '../utils/sdf'
import { vec2, sub, Vec2, copy } from '../utils/vec2'

const DENSITY_ORIGINAL = '#gLitCh?*:pxls×+=-· '
const DITHER_FADE_VH = 100

// --- Constants for Glitch Effect ---
const MAX_SYMBOL_GLITCH_PROB = 0.15 // Max probability (at strength=1) of replacing a symbol
const MAX_GLITCH_OFFSET_X_FACTOR = 0.6 // Max X offset as a factor of char width
const MAX_GLITCH_OFFSET_Y_FACTOR = 0.3 // Max Y offset as a factor of char height

interface UseAsciiAnimationProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>
	containerRef: React.RefObject<HTMLDivElement | null>
	pinHeightRef: React.RefObject<HTMLDivElement | null>
	ditherStrength: { current: number }
}

export const useAsciiAnimation = ({
	canvasRef,
	containerRef,
	pinHeightRef,
	ditherStrength,
}: UseAsciiAnimationProps) => {
	const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
	const mousePositionRef = useRef<Vec2>({ x: 0, y: 0 })
	const animationFrameId = useRef<number>(0)
	const frameCounterRef = useRef(0)
	const startTime = useRef<number>(Date.now())
	const lastRenderTimeRef = useRef<number>(0)
	const isTouchDeviceRef = useRef<boolean>(false)
	const mobileAnimationStopperRef = useRef<ScrollTrigger | null>(null)

	// 1. Grouped metrics into a single ref
	const metricsRef = useRef({
		cols: 80,
		rows: 40,
		charWidth: 10,
		charHeight: 20,
		aspect: 0.5,
		dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
		backgroundColor: '#000000',
		textColor: '#FFFFFF',
		m: 40,
		maxGlitchOffsetX: 0,
		maxGlitchOffsetY: 0,
		fixedPointerGridCoords: vec2(0, 0),
	})

	// Reusable vectors (stable, no need for deps)
	const reusableCoord = useRef(vec2(0, 0)).current
	const reusableSt = useRef(vec2(0, 0)).current
	const reusablePointerInGridCoords = useRef(vec2(0, 0)).current
	const reusablePointerNormalized = useRef(vec2(0, 0)).current
	const reusableSubResult = useRef(vec2(0, 0)).current

	// 2. Moved functions outside of useEffect
	const updateAndApplyCanvasStyles = useCallback(() => {
		const ctx = ctxRef.current
		if (!ctx) return

		const computedStyles = getComputedStyle(document.documentElement)
		metricsRef.current.backgroundColor = computedStyles
			.getPropertyValue('--background-color')
			.trim()
		metricsRef.current.textColor = computedStyles
			.getPropertyValue('--text-color')
			.trim()

		ctx.font = `${
			metricsRef.current.charHeight * 0.8
		}px "Alpha Lyrae", monospace`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
	}, [])

	const calculateCharMetrics = useCallback(() => {
		const ctx = ctxRef.current
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!ctx || !canvas || !container) return

		ctx.font = '16px "Alpha Lyrae", monospace'
		const metrics = ctx.measureText('M')
		if (
			typeof metrics.actualBoundingBoxAscent === 'number' &&
			typeof metrics.actualBoundingBoxDescent === 'number'
		) {
			metricsRef.current.charHeight =
				metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
		} else {
			metricsRef.current.charHeight = parseInt(ctx.font, 10) * 1.2
		}
		metricsRef.current.charWidth = metrics.width
		metricsRef.current.aspect =
			metricsRef.current.charWidth > 0
				? metricsRef.current.charWidth / metricsRef.current.charHeight
				: 1

		const dpr = window.devicePixelRatio || 1
		metricsRef.current.dpr = dpr

		const containerRect = container.getBoundingClientRect()
		const canvasRect = canvas.getBoundingClientRect()

		const newWidthFromContainer = containerRect.width
		const newHeightFromCanvas = canvasRect.height

		ctx.save()
		ctx.setTransform(1, 0, 0, 1, 0, 0)

		if (
			canvas.width !== Math.round(newWidthFromContainer * dpr) ||
			canvas.height !== Math.round(newHeightFromCanvas * dpr)
		) {
			canvas.width = newWidthFromContainer * dpr
			canvas.height = newHeightFromCanvas * dpr
		}

		ctx.restore()
		ctx.scale(dpr, dpr)

		metricsRef.current.cols =
			metricsRef.current.charWidth > 0
				? Math.ceil(newWidthFromContainer / metricsRef.current.charWidth)
				: 0
		metricsRef.current.rows =
			metricsRef.current.charHeight > 0
				? Math.ceil(newHeightFromCanvas / metricsRef.current.charHeight)
				: 0

		const MAX_COLS = 250
		const MAX_ROWS = 120
		metricsRef.current.cols = Math.min(metricsRef.current.cols, MAX_COLS)
		metricsRef.current.rows = Math.min(metricsRef.current.rows, MAX_ROWS)

		metricsRef.current.m = Math.min(
			metricsRef.current.cols,
			metricsRef.current.rows
		)
		metricsRef.current.maxGlitchOffsetX =
			metricsRef.current.charWidth * MAX_GLITCH_OFFSET_X_FACTOR
		metricsRef.current.maxGlitchOffsetY =
			metricsRef.current.charHeight * MAX_GLITCH_OFFSET_Y_FACTOR
		metricsRef.current.fixedPointerGridCoords = vec2(
			metricsRef.current.cols * 0.75,
			metricsRef.current.rows * 0.85
		)
	}, [canvasRef, containerRef])

	const renderAnimation = useCallback(
		(isStaticRender = false) => {
			const ctx = ctxRef.current
			const canvas = canvasRef.current
			if (!ctx || !canvas) return

			const t = isStaticRender
				? lastRenderTimeRef.current
				: (Date.now() - startTime.current) / 1000
			if (!isStaticRender) lastRenderTimeRef.current = t

			const sin_t_05 = Math.sin(t * 0.5)
			const cos_t_07 = Math.cos(t * 0.7)
			const sin_t_03 = Math.sin(t * 0.3)

			if (isStaticRender) {
				ctx.fillStyle = metricsRef.current.backgroundColor
				ctx.fillRect(
					0,
					0,
					canvas.width / metricsRef.current.dpr,
					canvas.height / metricsRef.current.dpr
				)
			} else {
				frameCounterRef.current++
			}

			ctx.fillStyle = metricsRef.current.textColor

			if (isTouchDeviceRef.current || isStaticRender) {
				copy(
					metricsRef.current.fixedPointerGridCoords,
					reusablePointerInGridCoords
				)
			} else {
				reusablePointerInGridCoords.x =
					mousePositionRef.current.x / metricsRef.current.charWidth
				reusablePointerInGridCoords.y =
					mousePositionRef.current.y / metricsRef.current.charHeight
			}

			reusablePointerNormalized.x =
				((2.0 * (reusablePointerInGridCoords.x - metricsRef.current.cols / 2)) /
					metricsRef.current.m) *
				metricsRef.current.aspect
			reusablePointerNormalized.y =
				(2.0 * (reusablePointerInGridCoords.y - metricsRef.current.rows / 2)) /
				metricsRef.current.m

			for (let j = 0; j < metricsRef.current.rows; j++) {
				if (!isStaticRender && j % 2 !== frameCounterRef.current % 2) {
					continue
				}
				if (!isStaticRender) {
					ctx.fillStyle = metricsRef.current.backgroundColor
					ctx.fillRect(
						0,
						j * metricsRef.current.charHeight,
						canvas.width / metricsRef.current.dpr,
						metricsRef.current.charHeight
					)
				}
				ctx.fillStyle = metricsRef.current.textColor

				for (let i = 0; i < metricsRef.current.cols; i++) {
					// 3. Optimized vector creation
					reusableCoord.x = i
					reusableCoord.y = j

					reusableSt.x =
						((2.0 * (reusableCoord.x - metricsRef.current.cols / 2)) /
							metricsRef.current.m) *
						metricsRef.current.aspect
					reusableSt.y =
						(2.0 * (reusableCoord.y - metricsRef.current.rows / 2)) /
						metricsRef.current.m

					const d1 = sdCircle(reusableSt, 0.3 + 0.1 * sin_t_05)
					const d2 = sdCircle(
						sub(reusableSt, reusablePointerNormalized, reusableSubResult),
						0.2 + 0.05 * cos_t_07
					)
					const d = opSmoothUnion(d1, d2, 0.6 + 0.2 * sin_t_03)
					const c = 1.0 - Math.exp(-4 * Math.abs(d))

					const currentGlitchStrength = ditherStrength.current
					const index = Math.min(
						Math.floor(c * DENSITY_ORIGINAL.length),
						DENSITY_ORIGINAL.length - 1
					)
					let char = DENSITY_ORIGINAL[index]
					let offsetX = 0
					let offsetY = 0

					if (currentGlitchStrength > 0.001) {
						if (
							Math.random() <
							currentGlitchStrength * MAX_SYMBOL_GLITCH_PROB
						) {
							char =
								DENSITY_ORIGINAL[
									Math.floor(Math.random() * DENSITY_ORIGINAL.length)
								]
						}
						offsetX =
							(Math.random() - 0.5) *
							2 *
							metricsRef.current.maxGlitchOffsetX *
							currentGlitchStrength
						offsetY =
							(Math.random() - 0.5) *
							2 *
							metricsRef.current.maxGlitchOffsetY *
							currentGlitchStrength
					}

					if (char && char !== ' ') {
						ctx.fillText(
							char,
							(i + 0.5) * metricsRef.current.charWidth + offsetX,
							(j + 0.5) * metricsRef.current.charHeight + offsetY
						)
					}
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[canvasRef, ditherStrength]
	)

	useEffect(() => {
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!canvas || !container) return

		isTouchDeviceRef.current =
			typeof window !== 'undefined' &&
			('ontouchstart' in window || navigator.maxTouchPoints > 0)
		ctxRef.current = canvas.getContext('2d')
		if (!ctxRef.current) return

		const TARGET_CANVAS_FPS_ABOUTME = 15
		const animationFrameInterval_aboutme = 1000 / TARGET_CANVAS_FPS_ABOUTME
		let lastAnimationRunTime_aboutme = 0
		const animationActive = { current: false }

		const loop = () => {
			if (!animationActive.current) return

			animationFrameId.current = requestAnimationFrame(loop)

			const currentTime = Date.now()
			const elapsed = currentTime - lastAnimationRunTime_aboutme

			if (elapsed > animationFrameInterval_aboutme) {
				lastAnimationRunTime_aboutme =
					currentTime - (elapsed % animationFrameInterval_aboutme)
				renderAnimation(false)
			}
		}

		const startAnimation = () => {
			if (!animationActive.current) {
				animationActive.current = true
				lastAnimationRunTime_aboutme = Date.now()
				loop()
			}
		}

		const stopAnimation = () => {
			animationActive.current = false
			cancelAnimationFrame(animationFrameId.current)
		}

		calculateCharMetrics()
		updateAndApplyCanvasStyles()

		const handleMouseMove = (event: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			mousePositionRef.current = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			}
		}

		const handleTouchEvent = (event: TouchEvent) => {
			if (event.touches.length > 0) {
				const touch = event.touches[0]
				const rect = canvas.getBoundingClientRect()
				mousePositionRef.current = {
					x: touch.clientX - rect.left,
					y: touch.clientY - rect.top,
				}
			}
		}

		canvas.addEventListener('mousemove', handleMouseMove)
		canvas.addEventListener('touchstart', handleTouchEvent, { passive: true })
		canvas.addEventListener('touchmove', handleTouchEvent, { passive: true })

		const debouncedResizeHandler = debounce(() => {
			calculateCharMetrics()
			updateAndApplyCanvasStyles()
			ScrollTrigger.refresh()

			if (!animationActive.current && isTouchDeviceRef.current) {
				renderAnimation(true)
			}
		}, 250)

		window.addEventListener('resize', debouncedResizeHandler)
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', debouncedResizeHandler)
		}

		const observer = new MutationObserver(() => {
			updateAndApplyCanvasStyles()
		})
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		})

		let GsapAnimationScrollTrigger: ScrollTrigger | undefined
		if (container && canvasRef.current) {
			if (isTouchDeviceRef.current && pinHeightRef.current) {
				mobileAnimationStopperRef.current = ScrollTrigger.create({
					trigger: pinHeightRef.current,
					start: `top top-=${DITHER_FADE_VH}vh`,
					onEnter: () => {
						if (animationActive.current) {
							stopAnimation()
							renderAnimation(true)
						}
					},
					onLeaveBack: startAnimation,
				})
			}

			GsapAnimationScrollTrigger = ScrollTrigger.create({
				trigger: container,
				start: 'top bottom',
				end: 'bottom top',
				onToggle: (self) => {
					if (
						isTouchDeviceRef.current &&
						mobileAnimationStopperRef.current?.isActive
					) {
						stopAnimation()
						return
					}
					if (self.isActive) {
						startAnimation()
					} else {
						stopAnimation()
					}
				},
			})
		}

		return () => {
			stopAnimation()
			canvas.removeEventListener('mousemove', handleMouseMove)
			canvas.removeEventListener('touchstart', handleTouchEvent)
			canvas.removeEventListener('touchmove', handleTouchEvent)
			window.removeEventListener('resize', debouncedResizeHandler)
			if (window.visualViewport) {
				window.visualViewport.removeEventListener(
					'resize',
					debouncedResizeHandler
				)
			}
			debouncedResizeHandler.cancel()
			observer.disconnect()
			GsapAnimationScrollTrigger?.kill()
			mobileAnimationStopperRef.current?.kill()
		}
	}, [
		canvasRef,
		containerRef,
		pinHeightRef,
		calculateCharMetrics,
		updateAndApplyCanvasStyles,
		renderAnimation,
	])
}
