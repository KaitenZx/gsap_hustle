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
import { ThemeToggleButton } from '../ThemeToggleButton/ThemeToggleButton';

import styles from './index.module.scss';
import { sdCircle, opSmoothUnion } from './utils/sdf';
import { vec2, sub, Vec2 } from './utils/vec2';

// Import icons

// Original density string
const DENSITY_ORIGINAL = '#gLitCh?*:pxls×+=-· ';



// Scroll distance for dither/glitch fade animation
const DITHER_FADE_VH = 100; // Fade out over the first 100vh of scrolling

// Utility function to wrap words in spans - reinstated
const wrapWordsInSpans = (elements: HTMLElement[]) => {
	elements.forEach(element => {
		if (!element?.textContent) return;
		element.innerHTML = element.textContent
			.split(' ')
			.map(word => `<span class="${styles.word}">${word}</span>`)
			.join(' ');
	});
};

// Define scroll distances for animation and pause
const TEXT_ANIM_SCROLL_DISTANCE_VH = 300; // Text animation happens over this scroll distance
const PAUSE_SCROLL_DISTANCE_VH = 80;   // Pause lasts for this scroll distance
// Total scroll distance is implicitly defined by .pinHeight in SCSS

// --- Constants for Glitch Effect ---
const MAX_SYMBOL_GLITCH_PROB = 0.15; // Max probability (at strength=1) of replacing a symbol
const MAX_GLITCH_OFFSET_X_FACTOR = 0.6; // Max X offset as a factor of char width
const MAX_GLITCH_OFFSET_Y_FACTOR = 0.3; // Max Y offset as a factor of char height

export const AboutMe = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mousePositionRef = useRef<Vec2>({ x: 0, y: 0 });
	const animationFrameId = useRef<number>(0);
	const startTime = useRef<number>(Date.now());
	const ditherStrength = useRef<number>(1.0); // Added: Controls dither effect (1 = max, 0 = none)
	const isTouchDeviceRef = useRef<boolean>(false); // Added: To detect touch devices

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

	const { setIsAboutMePinned } = usePinState();

	// Moved calculateCharMetrics outside useEffect to be reusable
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

		// --- Recalculate cols/rows based on current container/window size --- 
		const container = aboutMeContainerRef.current;
		if (container) {
			const dpr = window.devicePixelRatio || 1;
			dprRef.current = dpr;
			const rect = container.getBoundingClientRect();
			const newWidthFromContainer = rect.width;
			const newHeightFromViewport = window.visualViewport ? window.visualViewport.height : window.innerHeight;

			// Update canvas size based on container width and viewport height
			const canvas = canvasRef.current;
			if (canvas) {
				// Preserve the context before resizing
				ctx.save();
				// Reset transform before setting new dimensions
				ctx.setTransform(1, 0, 0, 1, 0, 0);

				canvas.width = newWidthFromContainer * dpr;
				canvas.height = newHeightFromViewport * dpr;
				canvas.style.width = `${newWidthFromContainer}px`;
				canvas.style.height = `${newHeightFromViewport}px`;

				// Restore context settings (like font, fillStyle etc.)
				ctx.restore();
				// Apply scaling for High DPI
				ctx.scale(dpr, dpr);
			}

			// Update grid dimensions
			colsRef.current = charWidthRef.current > 0 ? Math.ceil(newWidthFromContainer / charWidthRef.current) : 0;
			rowsRef.current = charHeightRef.current > 0 ? Math.ceil(newHeightFromViewport / charHeightRef.current) : 0;

			// --- Performance Cap for Large Screens ---
			const MAX_COLS = 250; // Adjust as needed
			const MAX_ROWS = 120; // Adjust as needed
			colsRef.current = Math.min(colsRef.current, MAX_COLS);
			rowsRef.current = Math.min(rowsRef.current, MAX_ROWS);
			// --- End Performance Cap ---
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
		let ditherScrollTrigger: ScrollTrigger | null = null; // Added: ScrollTrigger for dither
		let textPinScrollTrigger: ScrollTrigger | null = null; // Added: Separate trigger for pinning text
		let unpinFadeInScrollTrigger: ScrollTrigger | null = null;

		// --- Dither Fade Animation ---
		ditherScrollTrigger = ScrollTrigger.create({
			trigger: pinHeightEl, // Use pinHeightEl as the trigger area
			start: "top top",
			end: `+=${DITHER_FADE_VH}vh`, // End after scrolling DITHER_FADE_VH
			scrub: true,
			onUpdate: self => {
				// Update glitch strength (1 -> 0)
				ditherStrength.current = 1 - self.progress;

				// Update canvas opacity (1 -> 0.4)
				if (currentCanvasElement) {
					const targetOpacity = 1 - self.progress * (1 - 0.4);
					currentCanvasElement.style.opacity = targetOpacity.toFixed(2);
				}
			}
		});

		const initTextAnimation = () => {
			const elementsToWrap: HTMLElement[] = Array.from(
				pinnedTextContainerEl.querySelectorAll(
					`.${styles.aboutColumn} h2, .${styles.aboutColumn} p,` +
					`.${styles.exposColumn} h2, .${styles.exposColumn} .${styles.animatableText},` +
					`.${styles.linksColumn} h2, .${styles.linksColumn} .${styles.animatableText}`
				)
			).filter(el => el instanceof HTMLElement);

			if (elementsToWrap.length > 0) {
				wrapWordsInSpans(elementsToWrap);
			}

			// --- Add .word class to icons in the links column --- 
			/*
			const linkIcons: HTMLElement[] = Array.from(
				pinnedTextContainerEl.querySelectorAll(`.${styles.linksColumn} .${styles.linkIcon}`)
			).filter(el => el instanceof HTMLElement);
			linkIcons.forEach(icon => icon.classList.add(styles.word));
			*/
			// --- End icon class addition ---

			/* // Commented out as yearTag is now part of the animated <a> tag
			const yearTagElements: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.yearTag}`))
				.filter(el => el instanceof HTMLElement);
			yearTagElements.forEach(tagEl => tagEl.classList.add(styles.word));
			*/

			// Select all elements that should be animated as individual "words" by GSAP
			// This includes <a> tags with .expoLinkBlock and .word, 
			// and all <span> tags with .word (created by wrapWordsInSpans or directly assigned like link icons)
			const words: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(
				`.${styles.word}` // Selects all elements that now have styles.word
			)).filter(el => el instanceof HTMLElement);

			if (words.length === 0) {
				console.warn('[AboutMe GSAP] No words found to animate.');
				return;
			}

			gsap.set(words, { autoAlpha: 0, xPercent: -100 });

			if (pinnedTextContainerEl) {
				gsap.set(pinnedTextContainerEl, { opacity: 1 });
			}

			textPinScrollTrigger = ScrollTrigger.create({
				trigger: pinHeightEl,
				pin: pinnedTextContainerEl,
				start: `top top-=${DITHER_FADE_VH}vh`,
				end: 'bottom bottom',
				pinSpacing: false,
				onToggle: (self) => setIsAboutMePinned(self.isActive),
			});

			masterTimeline = gsap.timeline({
				scrollTrigger: {
					trigger: pinHeightEl,
					scrub: true,
					start: `top top-=${DITHER_FADE_VH}vh`,
					end: `bottom bottom-=${DITHER_FADE_VH}vh`,
				}
			});

			if (currentCanvasElement && pinHeightEl) {
				canvasPinScrollTrigger = ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: currentCanvasElement,
					start: 'top top',
					end: 'bottom bottom',
					pinSpacing: false,
					onToggle: (self) => setIsAboutMePinned(self.isActive),
				});
			}

			const lines: HTMLElement[][] = [[]];
			let lineIndex = 0;
			let lastOffsetTop = words.length > 0 ? words[0].offsetTop : 0;

			words.forEach((word, i) => {
				if (i > 0 && word.offsetTop !== lastOffsetTop) {
					lines.push([]);
					lineIndex++;
					lastOffsetTop = word.offsetTop;
				}
				lines[lineIndex].push(word);
			});

			const wordAnimationTweens: gsap.core.Tween[] = [];
			let maxTextAnimationImplicitDuration = 0;

			lines.forEach(lineWords => {
				if (lineWords.length > 0) {
					const tween = gsap.to(lineWords, {
						autoAlpha: 1,
						xPercent: 0,
						x: 0,
						stagger: 0.1,
						ease: 'power1.inOut',
						onComplete: () => {
							lineWords.forEach(wordEl => {
								if (wordEl.classList.contains(styles.expoLinkBlock)) {
									wordEl.style.pointerEvents = 'auto';
								}
							});
						}
					});
					wordAnimationTweens.push(tween);
					if (tween.duration() > maxTextAnimationImplicitDuration) {
						maxTextAnimationImplicitDuration = tween.duration();
					}
				}
			});

			// Fallback if no words or all lines have 1 word (duration would be GSAP default 0.5s for .to())
			if (wordAnimationTweens.length > 0 && maxTextAnimationImplicitDuration === 0) {
				// This case means all tweens are for single words, so duration is default 0.5s
				maxTextAnimationImplicitDuration = 0.5;
			} else if (wordAnimationTweens.length === 0) {
				maxTextAnimationImplicitDuration = 0.01; // Avoid 0 for calculations if no words
			}


			// Add all word animation tweens to the masterTimeline at the beginning (time 0)
			// These animations will play out as the masterTimeline progresses through its first "segment"
			if (wordAnimationTweens.length > 0) {
				masterTimeline.add(wordAnimationTweens, 0);
			} else {
				// If no words to animate, ensure the text animation segment still "exists"
				// with a tiny duration on the master timeline.
				masterTimeline.to({}, { duration: 0.001 }, 0);
			}


			// Calculate the "timeline duration" for the pause part.
			// This duration must be proportional to maxTextAnimationImplicitDuration,
			// based on the ratio of PAUSE_SCROLL_DISTANCE_VH to TEXT_ANIM_SCROLL_DISTANCE_VH.
			let pauseTimelineDuration = 0;
			if (TEXT_ANIM_SCROLL_DISTANCE_VH > 0.001 && maxTextAnimationImplicitDuration > 0.0001) {
				pauseTimelineDuration = maxTextAnimationImplicitDuration * (PAUSE_SCROLL_DISTANCE_VH / TEXT_ANIM_SCROLL_DISTANCE_VH);
			} else if (PAUSE_SCROLL_DISTANCE_VH > 0) {
				// If text animation part is effectively zero (or has no scroll distance assigned),
				// but pause has scroll distance, give pause a default timeline duration (e.g., 1 unit).
				// This means the pause will take up most/all of the scrubbed timeline.
				pauseTimelineDuration = 1; // Arbitrary unit, makes sense if it's the only "active" part
			}
			pauseTimelineDuration = Math.max(0, pauseTimelineDuration); // Ensure non-negative


			// Add an empty tween to the masterTimeline for the "pause"
			// It starts after the text animations are meant to have finished on the timeline.
			// The position is `maxTextAnimationImplicitDuration`.
			// Its duration is `pauseTimelineDuration`.
			if (pauseTimelineDuration > 0.0001) {
				masterTimeline.to({}, { duration: pauseTimelineDuration }, maxTextAnimationImplicitDuration);
			}

			// Ensure the timeline has some minimal length if everything was zero
			if (masterTimeline.duration() === 0) {
				masterTimeline.to({}, { duration: 0.01 });
			}

		};

		const timerId = setTimeout(initTextAnimation, 100);

		// --- Animation for canvas fade-in on unpin ---
		unpinFadeInScrollTrigger = ScrollTrigger.create({
			trigger: pinHeightEl,
			start: "bottom bottom",
			end: "bottom top",
			scrub: true,
			// markers: {startColor: "cyan", endColor: "cyan", indent: 200}, // For debugging
			onUpdate: self => {
				// ditherStrength was ~0, opacity was ~0.4 before this trigger became active.
				// We want ditherStrength to go to 1, opacity to 1.

				ditherStrength.current = self.progress; // progress is 0 (start) to 1 (end)

				const initialOpacity = 0.4; // The opacity state when this trigger begins
				const targetOpacity = 1.0;
				const newOpacity = initialOpacity + (self.progress * (targetOpacity - initialOpacity));
				if (currentCanvasElement) {
					currentCanvasElement.style.opacity = newOpacity.toFixed(2);
				}
			},
		});

		return () => {
			clearTimeout(timerId);
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

		// Initial calculation
		calculateCharMetrics(ctx);

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
				// Optional: Prevent default touch action like scrolling if interaction is desired
				// However, be cautious as this canvas might be fullscreen
				// event.preventDefault(); 
			}
		};

		canvas.addEventListener('mousemove', handleMouseMove);
		// Add touch event listeners
		canvas.addEventListener('touchstart', handleTouchEvent, { passive: true });
		canvas.addEventListener('touchmove', handleTouchEvent, { passive: true });

		// --- Resize Handler ---
		const debouncedResizeHandler = debounce(() => {
			// Recalculate canvas dimensions, char metrics, cols, rows
			calculateCharMetrics(ctx);
			// Refresh GSAP ScrollTrigger calculations
			ScrollTrigger.refresh();
		}, 250); // Debounce timeout

		window.addEventListener('resize', debouncedResizeHandler);
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', debouncedResizeHandler);
		}

		// --- Render Loop ---
		const renderAnimation = () => {
			animationFrameId.current = requestAnimationFrame(renderAnimation);

			const currentTime = Date.now();
			const elapsed = currentTime - lastAnimationRunTime_aboutme;

			if (elapsed > animationFrameInterval_aboutme) {
				lastAnimationRunTime_aboutme = currentTime - (elapsed % animationFrameInterval_aboutme);

				// Get theme colors from CSS variables
				const computedStyles = getComputedStyle(document.documentElement);
				const canvasBackgroundColor = computedStyles.getPropertyValue('--background-color').trim();
				const canvasTextColor = computedStyles.getPropertyValue('--text-color').trim();

				const t = (currentTime - startTime.current) / 1000;

				ctx.fillStyle = canvasBackgroundColor;
				ctx.fillRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);

				ctx.font = `${charHeightRef.current * 0.8}px "Alpha Lyrae", monospace`;
				ctx.fillStyle = canvasTextColor;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				const m = Math.min(colsRef.current, rowsRef.current);

				if (isTouchDeviceRef.current) {
					// For touch devices, fix the pointer to 3/4 towards bottom-right of the grid
					reusablePointerInGridCoords.x = colsRef.current * 0.75;
					reusablePointerInGridCoords.y = rowsRef.current * 0.85;
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
					for (let i = 0; i < colsRef.current; i++) {
						vec2(i, j, reusableCoord);
						vec2(
							2.0 * (reusableCoord.x - colsRef.current / 2) / m * aspectRef.current,
							2.0 * (reusableCoord.y - rowsRef.current / 2) / m,
							reusableSt
						);

						const d1 = sdCircle(reusableSt, 0.3 + 0.1 * Math.sin(t * 0.5));
						const d2 = sdCircle(sub(reusableSt, reusablePointerNormalized, reusableSubResult), 0.2 + 0.05 * Math.cos(t * 0.7));
						const d = opSmoothUnion(d1, d2, 0.6 + 0.2 * Math.sin(t * 0.3));
						const c = 1.0 - Math.exp(-4 * Math.abs(d));

						// --- Dithering Logic ---
						/* // Removed Bayer Dithering Logic
						const threshold = bayerMatrix4x4[j % BAYER_MATRIX_SIZE][i % BAYER_MATRIX_SIZE];
						const ditherTargetC = c > threshold ? 1.0 : 0.0; // Target intensity for full dither (binary)
						*/
						const currentGlitchStrength = ditherStrength.current; // Use ditherStrength for glitch intensity

						/* // Removed Lerp logic
						// Interpolate between original intensity and dithered intensity
						const effectiveC = lerp(c, ditherTargetC, currentGlitchStrength);
						*/

						// --- Original Character Selection ---
						// Map original intensity 'c' back to character index
						let index = Math.floor(c * DENSITY_ORIGINAL.length);
						index = Math.max(0, Math.min(index, DENSITY_ORIGINAL.length - 1));
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
							const maxOffsetX = charWidthRef.current * MAX_GLITCH_OFFSET_X_FACTOR;
							const maxOffsetY = charHeightRef.current * MAX_GLITCH_OFFSET_Y_FACTOR;
							offsetX = (Math.random() - 0.5) * 2 * maxOffsetX * currentGlitchStrength;
							offsetY = (Math.random() - 0.5) * 2 * maxOffsetY * currentGlitchStrength;
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
		};

		let GsapAnimationScrollTrigger: ScrollTrigger | undefined;
		if (container && canvasRef.current) {
			GsapAnimationScrollTrigger = ScrollTrigger.create({
				trigger: container,
				start: "top bottom",
				end: "bottom top",
				onToggle: self => {
					if (self.isActive) {
						cancelAnimationFrame(animationFrameId.current);
						lastAnimationRunTime_aboutme = Date.now();
						animationFrameId.current = requestAnimationFrame(renderAnimation);
					} else {
						cancelAnimationFrame(animationFrameId.current);
					}
				}
			});
		}

		// --- Initial render call after setup ---
		// Start animation immediately if initially visible (or let ScrollTrigger handle it)
		// Consider checking initial visibility if needed
		// cancelAnimationFrame(animationFrameId.current); // Ensure clean start
		// lastAnimationRunTime_aboutme = Date.now();
		// animationFrameId.current = requestAnimationFrame(renderAnimation);

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
			GsapAnimationScrollTrigger?.kill();
			// Note: GSAP timelines/triggers from the other useEffect are cleaned up there
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Keep dependencies empty to run once on mount

	// Data for links column
	const linksData = [
		{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconComponent: InstagramIcon, alt: "Instagram Icon" },
		{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconComponent: TwitterIcon, alt: "Twitter Icon" },
		{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconComponent: RedditIcon, alt: "Reddit Icon" },
		{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconComponent: TheHugIcon, alt: "TheHug Icon" },
		{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconComponent: EmailIcon, alt: "Email Icon" } // Corrected mailto link
	];

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

						{/* New wrapper for expos and links */}
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
						</div> {/* End of new wrapper */}
					</div>
				</div>
			</section>
		</div>
	);
};
