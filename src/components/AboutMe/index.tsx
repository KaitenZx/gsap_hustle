/* eslint-disable @typescript-eslint/no-misused-promises */
import { useRef, useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import debounce from 'lodash/debounce'; // Import debounce

import EmailIcon from '../../assets/icons/email_icon.svg?react';
import InstagramIcon from '../../assets/icons/instagramm_icon.svg?react';
import RedditIcon from '../../assets/icons/reddit_icon.svg?react';
import TheHugIcon from '../../assets/icons/thehug_icon.svg?react';
import TwitterIcon from '../../assets/icons/twitter_icon.svg?react';
import { usePinState } from '../../context/PinStateContext';
import { ScrollDownIndicator } from '../ScrollDownIndicator';
import { ThemeToggleButton } from '../ThemeToggleButton';

import styles from './index.module.scss';
import { sdCircle, opSmoothUnion } from './utils/sdf';
import { vec2, sub, Vec2, copy } from './utils/vec2';


// Original density string
const DENSITY_ORIGINAL = '#gLitCh?*:pxls×+=-· ';

const linksData = [
	{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconComponent: InstagramIcon, alt: "Instagram Icon" },
	{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconComponent: TwitterIcon, alt: "Twitter Icon" },
	{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconComponent: RedditIcon, alt: "Reddit Icon" },
	{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconComponent: TheHugIcon, alt: "TheHug Icon" },
	{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconComponent: EmailIcon, alt: "Email Icon" } // Corrected mailto link
];

const DITHER_FADE_VH = 100; // Fade out over the first 100vh of scrolling

const wrapWordsInSpans = (elements: HTMLElement[]) => {
	elements.forEach(element => {
		if (!element?.textContent) return;
		element.innerHTML = element.textContent
			.split(' ')
			.map(word => `<span class="${styles.word}">${word}</span>`)
			.join(' ');
	});
};

/**
 * Groups words into lines based on their vertical position.
 * This is necessary to create a line-by-line animation effect.
 * @param elements Array of word elements.
 * @returns An array of arrays, where each inner array is a line of elements.
 */
const groupWordsByLines = (elements: HTMLElement[]): HTMLElement[][] => {
	if (elements.length === 0) {
		return [];
	}

	// 1. Batch read: read all offsetTop values in one go.
	const wordsWithPositions = elements.map(el => ({
		element: el,
		top: el.offsetTop
	}));

	// 2. Process data without reading from the DOM.
	const lines: HTMLElement[][] = [];
	if (wordsWithPositions.length > 0) {
		let currentLine: HTMLElement[] = [wordsWithPositions[0].element];
		let lastOffsetTop = wordsWithPositions[0].top;

		for (let i = 1; i < wordsWithPositions.length; i++) {
			const wordInfo = wordsWithPositions[i];
			if (wordInfo.top === lastOffsetTop) {
				currentLine.push(wordInfo.element);
			} else {
				lines.push(currentLine);
				currentLine = [wordInfo.element];
				lastOffsetTop = wordInfo.top;
			}
		}
		lines.push(currentLine); // Add the last line
	}

	return lines;
};

const TEXT_ANIM_SCROLL_DISTANCE_VH = 300; // Text animation happens over this scroll distance
const PAUSE_SCROLL_DISTANCE_VH = 40;   // Pause lasts for this scroll distance

// --- Constants for Glitch Effect ---
const MAX_SYMBOL_GLITCH_PROB = 0.15; // Max probability (at strength=1) of replacing a symbol
const MAX_GLITCH_OFFSET_X_FACTOR = 0.6; // Max X offset as a factor of char width
const MAX_GLITCH_OFFSET_Y_FACTOR = 0.3; // Max Y offset as a factor of char height

export const AboutMe = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mousePositionRef = useRef<Vec2>({ x: 0, y: 0 });
	const animationFrameId = useRef<number>(0);
	const frameCounterRef = useRef(0); // For interlaced rendering
	const startTime = useRef<number>(Date.now());
	const lastRenderTimeRef = useRef<number>(0); // For freezing animation state
	const ditherStrength = useRef<number>(1.0); // Added: Controls dither effect (1 = max, 0 = none)
	const isTouchDeviceRef = useRef<boolean>(false); // Added: To detect touch devices
	const mobileAnimationStopperRef = useRef<ScrollTrigger | null>(null);

	// Refs for GSAP text animation
	const aboutMeContainerRef = useRef<HTMLDivElement>(null);
	const pinHeightRef = useRef<HTMLDivElement>(null);
	const pinnedTextContainerRef = useRef<HTMLDivElement>(null);
	const paragraphsContainerRef = useRef<HTMLDivElement>(null);

	const reusableCoord = useRef(vec2(0, 0)).current;
	const reusableSt = useRef(vec2(0, 0)).current;
	const reusablePointerInGridCoords = useRef(vec2(0, 0)).current;
	const reusablePointerNormalized = useRef(vec2(0, 0)).current;
	const reusableSubResult = useRef(vec2(0, 0)).current;

	const colsRef = useRef(80);
	const rowsRef = useRef(40);
	const charWidthRef = useRef(10);
	const charHeightRef = useRef(20);
	const aspectRef = useRef(0.5);
	const dprRef = useRef(window.devicePixelRatio || 1);
	const backgroundColorRef = useRef('#000000'); // Ref for background color
	const textColorRef = useRef('#FFFFFF');     // Ref for text color

	const mRef = useRef(40); // For Math.min(cols, rows)
	const maxGlitchOffsetXRef = useRef(0);
	const maxGlitchOffsetYRef = useRef(0);
	const fixedPointerGridCoordsRef = useRef(vec2(0, 0)); // For static/touch pointer position

	const { setIsAboutMePinned } = usePinState();

	const calculateCharMetrics = (ctx: CanvasRenderingContext2D | null) => {
		if (!ctx) return;
		ctx.font = '16px "Alpha Lyrae", monospace'; // Use a consistent base size for measurement
		const metrics = ctx.measureText('M');
		if (typeof metrics.actualBoundingBoxAscent === 'number' && typeof metrics.actualBoundingBoxDescent === 'number') {
			charHeightRef.current = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
		} else {
			charHeightRef.current = parseInt(ctx.font, 10) * 1.2; // Fallback
		}
		charWidthRef.current = metrics.width;
		aspectRef.current = charWidthRef.current > 0 ? charWidthRef.current / charHeightRef.current : 1;

		const container = aboutMeContainerRef.current;
		const canvas = canvasRef.current; // Get canvas ref
		if (container && canvas) { // Check both
			const dpr = window.devicePixelRatio || 1;
			dprRef.current = dpr;

			// Use getBoundingClientRect to get dimensions as rendered by CSS
			const containerRect = container.getBoundingClientRect();
			const canvasRect = canvas.getBoundingClientRect();

			const newWidthFromContainer = containerRect.width;
			const newHeightFromCanvas = canvasRect.height;

			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			// Set drawing buffer size.
			if (canvas.width !== Math.round(newWidthFromContainer * dpr) || canvas.height !== Math.round(newHeightFromCanvas * dpr)) {
				canvas.width = newWidthFromContainer * dpr;
				canvas.height = newHeightFromCanvas * dpr;
			}

			ctx.restore();
			ctx.scale(dpr, dpr);

			// Update grid dimensions using the new CSS-driven dimensions
			colsRef.current = charWidthRef.current > 0 ? Math.ceil(newWidthFromContainer / charWidthRef.current) : 0;
			rowsRef.current = charHeightRef.current > 0 ? Math.ceil(newHeightFromCanvas / charHeightRef.current) : 0;

			// --- Performance Cap for Large Screens ---
			const MAX_COLS = 250; // Adjust as needed
			const MAX_ROWS = 120; // Adjust as needed
			colsRef.current = Math.min(colsRef.current, MAX_COLS);
			rowsRef.current = Math.min(rowsRef.current, MAX_ROWS);

			// --- Pre-calculate values for render loop ---
			mRef.current = Math.min(colsRef.current, rowsRef.current);
			maxGlitchOffsetXRef.current = charWidthRef.current * MAX_GLITCH_OFFSET_X_FACTOR;
			maxGlitchOffsetYRef.current = charHeightRef.current * MAX_GLITCH_OFFSET_Y_FACTOR;
			fixedPointerGridCoordsRef.current = vec2(
				colsRef.current * 0.75,
				rowsRef.current * 0.85
			);
		}
	};

	useEffect(() => {
		gsap.registerPlugin(ScrollTrigger);

		const paragraphsContainerEl = paragraphsContainerRef.current;
		const pinHeightEl = pinHeightRef.current;
		const pinnedTextContainerEl = pinnedTextContainerRef.current;
		const currentCanvasElement = canvasRef.current; // For cleanup
		const aboutMeContainerEl = aboutMeContainerRef.current; // For dither trigger

		if (!paragraphsContainerEl || !pinHeightEl || !pinnedTextContainerEl || !aboutMeContainerEl) {
			console.warn('[AboutMe GSAP] Missing elements for text/dither animation setup.');
			return;
		}

		let masterTimeline: gsap.core.Timeline | null = null;
		let canvasPinScrollTrigger: ScrollTrigger | null = null;
		let ditherScrollTrigger: ScrollTrigger | null = null;
		let textPinScrollTrigger: ScrollTrigger | null = null;
		let unpinFadeInScrollTrigger: ScrollTrigger | null = null;

		// --- Dither Fade Animation ---
		ditherScrollTrigger = ScrollTrigger.create({
			trigger: pinHeightEl, // Use pinHeightEl as the trigger area
			start: "top top",
			end: `+=${DITHER_FADE_VH}vh`, // End after scrolling DITHER_FADE_VH
			scrub: true,
			onUpdate: self => {
				ditherStrength.current = 1 - self.progress;

				if (currentCanvasElement) {
					const targetOpacity = 1 - self.progress * (1 - 0.4);
					currentCanvasElement.style.opacity = targetOpacity.toFixed(2);
				}
			}
		});

		const initTextAnimation = () => {
			if (!pinnedTextContainerEl || !pinHeightEl) return;

			const elementsToWrap = Array.from(
				pinnedTextContainerEl.querySelectorAll(
					`.${styles.aboutColumn} h2, .${styles.aboutColumn} p,` +
					`.${styles.exposColumn} h2, .${styles.exposColumn} .${styles.animatableText},` +
					`.${styles.linksColumn} h2, .${styles.linksColumn} .${styles.animatableText}`
				)
			).filter((el): el is HTMLElement => el instanceof HTMLElement);

			if (elementsToWrap.length > 0) {
				wrapWordsInSpans(elementsToWrap);
			}

			const words = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.word}`))
				.filter((el): el is HTMLElement => el instanceof HTMLElement);

			if (words.length === 0) {
				console.warn('[AboutMe GSAP] No words found to animate.');
				return;
			}

			// Set initial state
			gsap.set(words, { autoAlpha: 0, x: '100vw' });
			gsap.set(pinnedTextContainerEl, { opacity: 1 });


			// Create pin triggers
			textPinScrollTrigger = ScrollTrigger.create({
				trigger: pinHeightEl,
				pin: pinnedTextContainerEl,
				start: `top top-=${DITHER_FADE_VH}vh`,
				end: 'bottom bottom',
				pinSpacing: false,
				onToggle: (self) => setIsAboutMePinned(self.isActive),
			});

			if (currentCanvasElement) {
				canvasPinScrollTrigger = ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: currentCanvasElement,
					start: 'top top',
					end: 'bottom bottom',
					pinSpacing: false,
				});
			}

			// Create master timeline
			masterTimeline = gsap.timeline({
				scrollTrigger: {
					trigger: pinHeightEl,
					scrub: true,
					start: `top top-=${DITHER_FADE_VH}vh`,
					end: `bottom bottom-=${DITHER_FADE_VH}vh`,
				}
			});

			// Get words from each column and group them by lines
			const aboutWords = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.aboutColumn} .${styles.word}`))
				.filter((el): el is HTMLElement => el instanceof HTMLElement);
			const exposAndLinksWords = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.exposLinksWrapper} .${styles.word}`))
				.filter((el): el is HTMLElement => el instanceof HTMLElement);

			const aboutLines = groupWordsByLines(aboutWords);
			const exposAndLinksLines = groupWordsByLines(exposAndLinksWords);

			const commonTweenVars = {
				autoAlpha: 1,
				x: 0,
				ease: 'power1.inOut',
				stagger: 0.05,
			};

			// Add line animations to the timeline
			aboutLines.forEach(line => masterTimeline?.to(line, commonTweenVars, "<"));
			exposAndLinksLines.forEach(line => masterTimeline?.to(line, commonTweenVars, "<"));

			// Add pause
			const animationDuration = masterTimeline.duration();
			if (TEXT_ANIM_SCROLL_DISTANCE_VH > 0.01 && animationDuration > 0) {
				const pauseDuration = animationDuration * (PAUSE_SCROLL_DISTANCE_VH / TEXT_ANIM_SCROLL_DISTANCE_VH);
				masterTimeline.to({}, { duration: pauseDuration });
			}

			if (masterTimeline.duration() === 0) {
				masterTimeline.to({}, { duration: 0.01 });
			}
		};

		document.fonts.ready.then(() => {
			initTextAnimation();
		}).catch(error => {
			console.error('Font loading failed, initializing animation with fallback fonts:', error);
			initTextAnimation();
		});

		// --- Animation for canvas fade-in on unpin ---
		unpinFadeInScrollTrigger = ScrollTrigger.create({
			trigger: pinHeightEl,
			start: "bottom bottom",
			scrub: false, // Ensure scrub is off
			onEnter: () => {
				// Immediately set final state
				ditherStrength.current = 0.3;
				if (currentCanvasElement) {
					currentCanvasElement.style.opacity = '1.0';
				}
			},
			onLeaveBack: () => {
				// Immediately restore initial state
				const initialOpacity = 0.1;
				ditherStrength.current = 0.0;
				if (currentCanvasElement) {
					currentCanvasElement.style.opacity = initialOpacity.toFixed(2);
				}
			}
		});

		return () => {
			if (masterTimeline) {
				const st = masterTimeline.scrollTrigger;
				if (st) { st.kill(); }
				masterTimeline.kill();
			}
			if (canvasPinScrollTrigger) { canvasPinScrollTrigger.kill(); }
			if (ditherScrollTrigger) { ditherScrollTrigger.kill(); }
			if (textPinScrollTrigger) { textPinScrollTrigger.kill(); }
			if (unpinFadeInScrollTrigger) { unpinFadeInScrollTrigger.kill(); } // Cleanup new trigger
			setIsAboutMePinned(false);
			console.log('[AboutMe GSAP] Timelines and ScrollTriggers cleaned up.');
		};
	}, [setIsAboutMePinned]);

	// --- Canvas Animation & Resize Handling useEffect ---
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = aboutMeContainerRef.current;

		if (!canvas || !container) return;

		// Determine if it's a touch device
		isTouchDeviceRef.current = typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const TARGET_CANVAS_FPS_ABOUTME = 15;
		const animationFrameInterval_aboutme = 1000 / TARGET_CANVAS_FPS_ABOUTME;
		let lastAnimationRunTime_aboutme = 0;
		const animationActive = { current: false };
		const isStaticRender = { current: false }; // Flag for one-off static render

		// Reads CSS variables and applies static styles to the canvas context.
		const updateAndApplyCanvasStyles = () => {
			const computedStyles = getComputedStyle(document.documentElement);
			backgroundColorRef.current = computedStyles.getPropertyValue('--background-color').trim();
			textColorRef.current = computedStyles.getPropertyValue('--text-color').trim();

			// Apply static styles that don't change within the render loop
			ctx.font = `${charHeightRef.current * 0.8}px "Alpha Lyrae", monospace`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
		};

		// Initial calculation
		calculateCharMetrics(ctx);
		updateAndApplyCanvasStyles(); // Apply initial styles

		const handleMouseMove = (event: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			mousePositionRef.current = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
		};

		// New handler for touch events
		const handleTouchEvent = (event: TouchEvent) => {
			if (event.touches.length > 0) {
				const touch = event.touches[0];
				const rect = canvas.getBoundingClientRect(); // Ensure canvas is defined here
				mousePositionRef.current = {
					x: touch.clientX - rect.left,
					y: touch.clientY - rect.top,
				};
			}
		};

		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('touchstart', handleTouchEvent, { passive: true });
		canvas.addEventListener('touchmove', handleTouchEvent, { passive: true });

		// --- Resize Handler ---
		const debouncedResizeHandler = debounce(() => {
			calculateCharMetrics(ctx);
			updateAndApplyCanvasStyles();
			ScrollTrigger.refresh();

			// If the animation is paused (which only happens on mobile when text is pinned),
			// the canvas was just cleared by calculateCharMetrics. We must force
			// a single static redraw to restore the visual state.
			if (!animationActive.current && isTouchDeviceRef.current) {
				isStaticRender.current = true;
				// We call renderAnimation directly (not via requestAnimationFrame)
				// to ensure it executes synchronously after the resize logic.
				// The debounce wrapper prevents this from firing excessively.
				renderAnimation();
			}
		}, 250); // Debounce timeout

		window.addEventListener('resize', debouncedResizeHandler);
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', debouncedResizeHandler);
		}

		// --- Observer for theme changes ---
		const observer = new MutationObserver((mutationsList) => {
			for (const mutation of mutationsList) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
					updateAndApplyCanvasStyles(); // Re-apply styles on theme change
					break;
				}
			}
		});
		observer.observe(document.documentElement, { attributes: true });


		// --- Render Loop ---
		const renderAnimation = () => {
			if (!animationActive.current && !isStaticRender.current) {
				return;
			}

			if (animationActive.current) {
				animationFrameId.current = requestAnimationFrame(renderAnimation);
			}

			const currentTime = Date.now();
			const elapsed = currentTime - lastAnimationRunTime_aboutme;

			if (elapsed > animationFrameInterval_aboutme || isStaticRender.current) {
				lastAnimationRunTime_aboutme = currentTime - (elapsed % animationFrameInterval_aboutme);

				// --- Time Calculation & State Save ---
				const t = isStaticRender.current
					? lastRenderTimeRef.current
					: (Date.now() - startTime.current) / 1000;

				// Optimization: Pre-calculate time-dependent values before the loops
				const sin_t_05 = Math.sin(t * 0.5);
				const cos_t_07 = Math.cos(t * 0.7);
				const sin_t_03 = Math.sin(t * 0.3);

				if (animationActive.current) {
					lastRenderTimeRef.current = t;
				}

				// If it's a static, one-off render, clear everything.
				// Otherwise, we'll clear row-by-row for interlacing.
				if (isStaticRender.current) {
					ctx.fillStyle = backgroundColorRef.current;
					ctx.fillRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);
				} else {
					// For regular animation, increment frame for interlacing
					frameCounterRef.current++;
				}

				// Set text color from the ref
				ctx.fillStyle = textColorRef.current;

				const m = mRef.current; // Use pre-calculated value

				if (isTouchDeviceRef.current || !animationActive.current) { // Use fixed pointer for static render too
					// For touch devices, use pre-calculated fixed pointer
					copy(fixedPointerGridCoordsRef.current, reusablePointerInGridCoords);
				} else {
					// For non-touch devices, use the actual mouse/pointer position in grid coordinates
					vec2(
						(mousePositionRef.current.x / charWidthRef.current),
						(mousePositionRef.current.y / charHeightRef.current),
						reusablePointerInGridCoords
					);
				}

				vec2(
					2.0 * (reusablePointerInGridCoords.x - colsRef.current / 2) / m * aspectRef.current,
					2.0 * (reusablePointerInGridCoords.y - rowsRef.current / 2) / m,
					reusablePointerNormalized
				);

				for (let j = 0; j < rowsRef.current; j++) {
					// --- Interlacing Optimization ---
					// For animated frames, skip rows based on interlacing pattern.
					// For static frames (e.g., after resize), render all rows.
					if (!isStaticRender.current && j % 2 !== frameCounterRef.current % 2) {
						continue;
					}

					// For animated frames, clear only the specific row we're about to draw.
					if (!isStaticRender.current) {
						ctx.fillStyle = backgroundColorRef.current;
						ctx.fillRect(
							0,
							j * charHeightRef.current,
							canvas.width / dprRef.current, // Use full canvas width for safety
							charHeightRef.current
						);
						ctx.fillStyle = textColorRef.current; // Reset fill style for text
					}

					for (let i = 0; i < colsRef.current; i++) {
						vec2(i, j, reusableCoord);
						vec2(
							2.0 * (reusableCoord.x - colsRef.current / 2) / m * aspectRef.current,
							2.0 * (reusableCoord.y - rowsRef.current / 2) / m,
							reusableSt
						);

						const d1 = sdCircle(reusableSt, 0.3 + 0.1 * sin_t_05);
						const d2 = sdCircle(sub(reusableSt, reusablePointerNormalized, reusableSubResult), 0.2 + 0.05 * cos_t_07);
						const d = opSmoothUnion(d1, d2, 0.6 + 0.2 * sin_t_03);
						const c = 1.0 - Math.exp(-4 * Math.abs(d));

						// --- Dithering Logic ---
						const currentGlitchStrength = ditherStrength.current; // Use ditherStrength for glitch intensity

						// --- Original Character Selection ---
						const index = Math.min(Math.floor(c * DENSITY_ORIGINAL.length), DENSITY_ORIGINAL.length - 1);
						let char = DENSITY_ORIGINAL[index]; // Start with the calculated character

						// --- Glitch Effect Logic (Symbolic + Positional) ---
						let offsetX = 0;
						let offsetY = 0;

						if (currentGlitchStrength > 0.001) { // Apply glitch only if strength is noticeable
							// 1. Symbolic Glitch:
							if (Math.random() < currentGlitchStrength * MAX_SYMBOL_GLITCH_PROB) {
								const randomIndex = Math.floor(Math.random() * DENSITY_ORIGINAL.length);
								char = DENSITY_ORIGINAL[randomIndex]; // Replace with random char
							}

							// 2. Positional Glitch:
							// Use pre-calculated max offsets
							offsetX = (Math.random() - 0.5) * 2 * maxGlitchOffsetXRef.current * currentGlitchStrength;
							offsetY = (Math.random() - 0.5) * 2 * maxGlitchOffsetYRef.current * currentGlitchStrength;
						}

						// --- Drawing Logic ---
						if (char && char !== ' ') {
							ctx.fillText(
								char, // Use potentially glitched character
								(i + 0.5) * charWidthRef.current + offsetX, // Add X offset
								(j + 0.5) * charHeightRef.current + offsetY  // Add Y offset
							);
						}
						// --- End Glitch/Drawing Logic ---
					}
				}
			}

			if (isStaticRender.current) {
				isStaticRender.current = false;
			}
		};

		let GsapAnimationScrollTrigger: ScrollTrigger | undefined;
		if (container && canvasRef.current) {
			// On mobile, stop the animation when text appears.
			if (isTouchDeviceRef.current && pinHeightRef.current) {
				mobileAnimationStopperRef.current = ScrollTrigger.create({
					trigger: pinHeightRef.current,
					start: `top top-=${DITHER_FADE_VH}vh`, // Matches text animation start
					onEnter: () => {
						console.log("Mobile: Stopping canvas animation.");
						if (animationActive.current) {
							animationActive.current = false;
							isStaticRender.current = true; // Request one last static frame
						}
					},
					onLeaveBack: () => {
						console.log("Mobile: Restarting canvas animation.");
						if (!animationActive.current) {
							animationActive.current = true;
							lastAnimationRunTime_aboutme = Date.now();
							animationFrameId.current = requestAnimationFrame(renderAnimation);
						}
					},
				});
			}

			GsapAnimationScrollTrigger = ScrollTrigger.create({
				trigger: container,
				start: "top bottom",
				end: "bottom top",
				onToggle: self => {
					// On mobile, if the text animation is already active, don't restart the canvas animation.
					if (isTouchDeviceRef.current && mobileAnimationStopperRef.current?.isActive) {
						animationActive.current = false;
						cancelAnimationFrame(animationFrameId.current);
						return;
					}

					if (self.isActive) {
						if (!animationActive.current) {
							animationActive.current = true;
							lastAnimationRunTime_aboutme = Date.now();
							animationFrameId.current = requestAnimationFrame(renderAnimation);
						}
					} else {
						animationActive.current = false;
						cancelAnimationFrame(animationFrameId.current);
					}
				}
			});
		}


		// --- Cleanup Function ---
		return () => {
			cancelAnimationFrame(animationFrameId.current);
			canvas.removeEventListener('mousemove', handleMouseMove);
			// Remove touch event listeners
			canvas.removeEventListener('touchstart', handleTouchEvent);
			canvas.removeEventListener('touchmove', handleTouchEvent);
			window.removeEventListener('resize', debouncedResizeHandler);
			if (window.visualViewport) {
				window.visualViewport.removeEventListener('resize', debouncedResizeHandler);
			}
			debouncedResizeHandler.cancel();
			observer.disconnect(); // Disconnect the observer
			GsapAnimationScrollTrigger?.kill();
			mobileAnimationStopperRef.current?.kill();
			// Note: GSAP timelines/triggers from the other useEffect are cleaned up there
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Keep dependencies empty to run once on mount

	return (
		<div ref={aboutMeContainerRef} className={styles.aboutMeContainer}>
			<div data-interactive-cursor="true" className={styles.themeToggleWrapper}>
				<ThemeToggleButton />
			</div>
			<canvas
				ref={canvasRef}
				className={styles.asciiCanvas}
			/>
			<ScrollDownIndicator />
			<section className={styles.mwgEffect004}>
				<div ref={pinHeightRef} className={styles.pinHeight}>
					<div ref={pinnedTextContainerRef} className={`${styles.textAnimationContainer} ${styles.textContainerHiddenByOpacity}`}>
						<div ref={paragraphsContainerRef} className={`${styles.textColumn} ${styles.aboutColumn}`}>
							<h2>ABOUT ME</h2>
							<div className={styles.aboutParagraphsRow}>
								<p className={styles.paragraph}>
									As a glitch artist and multidisciplinary designer from Russia,
									currently based in Cyprus, I explore the intersection of digital aesthetics and human experience. My journey into glitch art began in 2022,
									when I discovered how digital distortions could express
									deeper truths about memory and perception.
								</p>
								<p className={styles.paragraph}>
									Growing up during the dawn of the internet era, I developed
									a deep appreciation for early web aesthetics, which now influences
									my artistic approach. Through my work, I combine traditional design principles with digital manipulation techniques to create pieces
									that examine themes of nostalgia, impermanence,
									and technological evolution.
								</p>
								<p className={styles.paragraph}>
									My glitch art invites viewers to reflect on their own relationships
									with memory, technology, and time, while challenging conventional notions of digital perfection. Each piece serves as a meditation
									on how our memories of places and people transform over time,
									much like the distorted digital images in my work.
								</p>
							</div>
						</div>

						<div className={styles.exposLinksWrapper}>
							<div className={`${styles.textColumn} ${styles.exposColumn}`}>
								<h2>EXPOS</h2>
								<ul>
									<li>
										<a href="https://www.instagram.com/p/Cmci5PXvmWa/?igsh=MTRtNWQ2d2FteDg4Zw==" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>Fubar 2k23 exhibition</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>INNER EMIGRATION</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/Cmci5PXvmWa/" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>Fubar 2k23 exhibition</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>THEALIENARMS</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/Cmci5PXvmWa/?igsh=MTRtNWQ2d2FteDg4Zw==" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>GLITCH.ART.BR</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>IV EDITION</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/CrltMfmIPIw/?igsh=MThjcG9hZThlejgxYQ==" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>NIANGI</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2024</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>ERROR IN CONTROL</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/CqF0xxNosMk/?igsh=djNqc2gxZ245eWE0" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>FUBAR 2k24 Exhibition</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2024</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>PROCRASTINATION</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/C_gPIjloB8r/" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>GLITCH.ART.BR </span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2024</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>V EDITION</span>
										</a>
									</li>
									<li>
										<a href="https://www.instagram.com/p/DA_yChPOIks/" data-interactive-cursor="true" className={`${styles.word} ${styles.expoLinkBlock}`}>
											<span className={styles.animatableText}>Awita New York Studio</span> <span className={`${styles.yearTag} ${styles.animatableText}`}>2025</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>2ND YEAR ANNIVERSARY</span>
										</a>
									</li>
								</ul>
							</div>

							<div className={`${styles.textColumn} ${styles.linksColumn}`}>
								<h2>LINKS</h2>
								<ul>
									{/* Map over linksData to generate list items */}
									{linksData.map((link) => (
										<li key={link.text}>
											<a data-interactive-cursor="true" href={link.href} target="_blank" rel="noopener noreferrer" className={styles.word}> {/* Ensure text is animatable */}
												<link.iconComponent className={styles.linkIcon} />
												<span>{link.text}</span>
											</a>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};
