import { useRef, useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import debounce from 'lodash/debounce'; // Import debounce

import emailIcon from '../../assets/icons/email_icon.webp';
import instagramIcon from '../../assets/icons/instagramm_icon.webp';
import redditIcon from '../../assets/icons/reddit_icon.webp';
import thehugIcon from '../../assets/icons/thehug_icon.webp';
import twitterIcon from '../../assets/icons/twitter_icon.webp';

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
			const newHeightFromViewport = window.innerHeight;

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
			colsRef.current = charWidthRef.current > 0 ? Math.floor(newWidthFromContainer / charWidthRef.current) : 0;
			rowsRef.current = charHeightRef.current > 0 ? Math.floor(newHeightFromViewport / charHeightRef.current) : 0;
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
			const elementsToAnimate: HTMLElement[] = Array.from(
				pinnedTextContainerEl.querySelectorAll(
					`.${styles.aboutColumn} h2, .${styles.aboutColumn} p,` +
					`.${styles.exposColumn} h2, .${styles.exposColumn} .${styles.animatableText},` +
					`.${styles.linksColumn} h2, .${styles.linksColumn} .${styles.animatableText}`
				)
			).filter(el => el instanceof HTMLElement);

			if (elementsToAnimate.length === 0) {
				console.warn('[AboutMe GSAP] No elements designated for animation found.');
				return;
			}
			wrapWordsInSpans(elementsToAnimate);

			// --- Add .word class to icons in the links column --- 
			const linkIcons: HTMLElement[] = Array.from(
				pinnedTextContainerEl.querySelectorAll(`.${styles.linksColumn} .${styles.linkIcon}`)
			).filter(el => el instanceof HTMLElement);
			linkIcons.forEach(icon => icon.classList.add(styles.word));
			// --- End icon class addition ---

			const yearTagElements: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.yearTag}`))
				.filter(el => el instanceof HTMLElement);
			yearTagElements.forEach(tagEl => tagEl.classList.add(styles.word));

			const words: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.word}`)) // This selector now includes icons and yearTags
				.filter(el => el instanceof HTMLElement);

			if (words.length === 0) {
				console.warn('[AboutMe GSAP] No words found to animate.');
				return;
			}

			// *** Added: Separate ScrollTrigger for pinning text ***
			textPinScrollTrigger = ScrollTrigger.create({
				trigger: pinHeightEl,
				pin: pinnedTextContainerEl, // Let GSAP handle pinning again
				start: `top top-=${DITHER_FADE_VH}vh`, // Start when text animation should start
				end: 'bottom bottom', // End when canvas unpins
				pinSpacing: false, // Keep false unless proven necessary
				// Add onUpdate to force top: 0 during pin:
				onUpdate: (self) => {
					if (self.isActive && pinnedTextContainerEl) {
						// Force top to 0px while pinned to allow align-items: center to work
						pinnedTextContainerEl.style.top = '0px';
						// GSAP might also set left, ensure it's 0 too if needed, or let GSAP handle it.
						// pinnedTextContainerEl.style.left = '0px';
					}
				},
			});

			// Create the master timeline that will be scrubbed
			masterTimeline = gsap.timeline({
				scrollTrigger: {
					trigger: pinHeightEl,
					// pin: pinnedTextContainerEl, // *** REMOVED: Pinning is handled separately ***
					scrub: true,
					start: `top top-=${DITHER_FADE_VH}vh`, // Start scrubbing after dither fade
					end: `bottom bottom-=${DITHER_FADE_VH}vh`, // End scrubbing after text anim + pause distance
					// markers: {startColor: "magenta", endColor: "magenta", indent: 160, fontSize: "10px",}, // For debugging master timeline
				}
			});

			// Pin the canvas as well, using a separate ScrollTrigger for the full duration
			if (currentCanvasElement && pinHeightEl) {
				canvasPinScrollTrigger = ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: currentCanvasElement,
					start: 'top top',
					end: 'bottom bottom', // Pin for the full duration
					pinSpacing: false,
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

			// Create word animation tweens (time-based, not scroll-triggered individually)
			const wordAnimationTweens: gsap.core.Tween[] = [];
			let maxTextAnimationImplicitDuration = 0;

			lines.forEach(lineWords => {
				if (lineWords.length > 0) {
					const tween = gsap.to(lineWords, {
						x: 0,
						stagger: 0.1, // Existing stagger
						ease: 'power1.inOut', // Existing ease
						// paused: true, // Not needed if added to master timeline correctly
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

			console.log(`[AboutMe GSAP] Master timeline initialized. Text anim implicit duration: ${maxTextAnimationImplicitDuration.toFixed(2)}s, Pause timeline duration: ${pauseTimelineDuration.toFixed(2)}s. Total timeline duration: ${masterTimeline.duration().toFixed(2)}s`);
		};

		const timerId = setTimeout(initTextAnimation, 100);

		return () => {
			clearTimeout(timerId);

			// Kill the master timeline and its associated ScrollTrigger
			if (masterTimeline) {
				const st = masterTimeline.scrollTrigger;
				if (st) {
					st.kill();
				}
				masterTimeline.kill();
			}

			// Kill the separate ScrollTrigger for canvas pinning
			if (canvasPinScrollTrigger) {
				canvasPinScrollTrigger.kill();
			}

			// *** Added: Kill the dither ScrollTrigger ***
			if (ditherScrollTrigger) {
				ditherScrollTrigger.kill();
			}

			// *** Added: Kill the text pin ScrollTrigger ***
			if (textPinScrollTrigger) {
				textPinScrollTrigger.kill();
			}

			// Kill any other dynamically created tweens or ScrollTriggers if necessary
			// (though the above should cover the main ones for this strategy)
			// For instance, if wordAnimationTweens were not added to masterTimeline and had their own STs.
			// But here, they are part of masterTimeline or just tweens.

			console.log('[AboutMe GSAP] Master timeline and associated ScrollTriggers cleaned up.');
		};
	}, []);

	// --- Canvas Animation & Resize Handling useEffect ---
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = aboutMeContainerRef.current;

		if (!canvas || !container) return;

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

		canvas.addEventListener('mousemove', handleMouseMove);

		// --- Resize Handler --- 
		const handleResize = debounce(() => {
			console.log('[AboutMe] Window resized, recalculating...');
			// Recalculate canvas dimensions, char metrics, cols, rows
			calculateCharMetrics(ctx);
			// Refresh GSAP ScrollTrigger calculations
			ScrollTrigger.refresh();
			console.log(`[AboutMe] Recalculated metrics: ${colsRef.current}x${rowsRef.current} cols/rows. ScrollTrigger refreshed.`);
		}, 250); // Debounce timeout

		window.addEventListener('resize', handleResize);

		// --- Render Loop --- 
		const renderAnimation = () => {
			animationFrameId.current = requestAnimationFrame(renderAnimation);

			const currentTime = Date.now();
			const elapsed = currentTime - lastAnimationRunTime_aboutme;

			if (elapsed > animationFrameInterval_aboutme) {
				lastAnimationRunTime_aboutme = currentTime - (elapsed % animationFrameInterval_aboutme);

				const t = (currentTime - startTime.current) / 1000;

				ctx.fillStyle = '#121212';
				ctx.fillRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);

				ctx.font = `${charHeightRef.current * 0.8}px "Alpha Lyrae", monospace`;
				ctx.fillStyle = '#E0E0E0';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				const m = Math.min(colsRef.current, rowsRef.current);

				vec2(
					(mousePositionRef.current.x / charWidthRef.current),
					(mousePositionRef.current.y / charHeightRef.current),
					reusablePointerInGridCoords
				);

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
							ctx.fillStyle = '#E0E0E0'; // Keep original color

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
			console.log('[AboutMe] Cleaning up canvas animation and listeners...');
			cancelAnimationFrame(animationFrameId.current);
			canvas.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('resize', handleResize);
			handleResize.cancel(); // Cancel any pending debounced calls
			GsapAnimationScrollTrigger?.kill();
			// Note: GSAP timelines/triggers from the other useEffect are cleaned up there
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Keep dependencies empty to run once on mount

	// Data for links column
	const linksData = [
		{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconSrc: instagramIcon, alt: "Instagram Icon" },
		{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconSrc: twitterIcon, alt: "Twitter Icon" },
		{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconSrc: redditIcon, alt: "Reddit Icon" },
		{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconSrc: thehugIcon, alt: "TheHug Icon" },
		{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconSrc: emailIcon, alt: "Email Icon" } // Corrected mailto link
	];

	return (
		<div ref={aboutMeContainerRef} className={styles.aboutMeContainer}>
			<canvas
				ref={canvasRef}
				className={styles.asciiCanvas}
			/>
			<section className={styles.mwgEffect004}>
				<div ref={pinHeightRef} className={styles.pinHeight}>
					<div ref={pinnedTextContainerRef} className={styles.textAnimationContainer}>
						<div ref={paragraphsContainerRef} className={`${styles.textColumn} ${styles.aboutColumn}`}>
							<h2>ABOUT ME</h2>
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

						<div className={`${styles.textColumn} ${styles.exposColumn}`}>
							<h2>EXPOS</h2>
							<ul>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
								<li><span className={styles.animatableText}>FUBAR 2k23 Exhibition</span> <span className={styles.yearTag}>2023</span><br /><span className={`${styles.subText} ${styles.animatableText}`}>Inner emigration</span></li>
							</ul>
						</div>

						<div className={`${styles.textColumn} ${styles.linksColumn}`}>
							<h2>LINKS</h2>
							<ul>
								{/* Map over linksData to generate list items */}
								{linksData.map((link) => (
									<li key={link.text}>
										<a href={link.href} target="_blank" rel="noopener noreferrer"> {/* Added target and rel for external links */}
											<img src={link.iconSrc} alt={link.alt} className={styles.linkIcon} />
											<span className={styles.animatableText}>{link.text}</span> {/* Ensure text is animatable */}
										</a>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};
