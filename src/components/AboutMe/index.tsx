import { useRef, useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import styles from './index.module.scss';
import { sdCircle, opSmoothUnion } from './utils/sdf';
import { vec2, sub, Vec2 } from './utils/vec2';

const DENSITY = '#gLitCh?*:pxls×+=-· ';

// Utility function to wrap words in spans - now takes an array of elements
const wrapWordsInSpans = (elements: HTMLElement[]) => {
	elements.forEach(element => {
		if (!element?.textContent) return;
		element.innerHTML = element.textContent
			.split(' ')
			.map(word => `<span class="${styles.word}">${word}</span>`)
			.join(' ');
	});
};

export const AboutMe = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mousePositionRef = useRef<Vec2>({ x: 0, y: 0 });
	const animationFrameId = useRef<number>(0);
	const startTime = useRef<number>(Date.now());

	// Refs for GSAP text animation
	const aboutMeContainerRef = useRef<HTMLDivElement>(null);
	const pinHeightRef = useRef<HTMLDivElement>(null);
	const pinnedTextContainerRef = useRef<HTMLDivElement>(null);
	// Renamed paragraphRef to paragraphsContainerRef for clarity
	const paragraphsContainerRef = useRef<HTMLDivElement>(null);

	// Reusable Vec2 objects for optimization
	const reusableCoord = useRef(vec2(0, 0)).current;
	const reusableSt = useRef(vec2(0, 0)).current;
	const reusablePointerInGridCoords = useRef(vec2(0, 0)).current;
	const reusablePointerNormalized = useRef(vec2(0, 0)).current;
	const reusableSubResult = useRef(vec2(0, 0)).current;

	// --- Context for the animation ---
	// These will be updated on resize
	const colsRef = useRef(80); // Default character columns
	const rowsRef = useRef(40); // Default character rows
	const charWidthRef = useRef(10); // Approximate width of a character
	const charHeightRef = useRef(20); // Approximate height of a character
	const aspectRef = useRef(0.5); // charWidth / charHeight

	const calculateCharMetrics = (ctx: CanvasRenderingContext2D) => {
		ctx.font = '16px monospace'; // Set a consistent font for measurement
		const metrics = ctx.measureText('M'); // Measure a representative character

		// Attempt to get actual bounding box dimensions if available
		if (typeof metrics.actualBoundingBoxAscent === 'number' && typeof metrics.actualBoundingBoxDescent === 'number') {
			charHeightRef.current = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
		} else {
			// Fallback for browsers not supporting actualBoundingBoxAscent/Descent
			// This is a rough estimate. 'fontBoundingBoxAscent/Descent' might be more accurate if available.
			charHeightRef.current = parseInt(ctx.font, 10) * 1.2;
		}
		charWidthRef.current = metrics.width;
		aspectRef.current = charWidthRef.current / charHeightRef.current;
	};

	useEffect(() => {
		gsap.registerPlugin(ScrollTrigger);

		// Updated ref name
		const paragraphsContainerEl = paragraphsContainerRef.current;
		const pinHeightEl = pinHeightRef.current;
		const pinnedTextContainerEl = pinnedTextContainerRef.current;

		if (!paragraphsContainerEl || !pinHeightEl || !pinnedTextContainerEl) {
			console.warn('[AboutMe GSAP] Missing elements for text animation setup.');
			return;
		}

		const initTextAnimation = () => {
			// Get all elements that should have their text animated word-by-word
			const elementsToAnimate: HTMLElement[] = Array.from(
				pinnedTextContainerEl.querySelectorAll(
					// About column content
					`.${styles.aboutColumn} h1, .${styles.aboutColumn} p,` +
					// Expos column content
					`.${styles.exposColumn} h2, .${styles.exposColumn} .${styles.animatableText},` +
					// Links column content
					`.${styles.linksColumn} h2, .${styles.linksColumn} li a`
				)
			).filter(el => el instanceof HTMLElement);

			if (elementsToAnimate.length === 0) {
				console.warn('[AboutMe GSAP] No elements designated for animation found.');
				return;
			}

			wrapWordsInSpans(elementsToAnimate); // Call on the array of designated text elements

			// Directly mark yearTag elements as words for animation
			const yearTagElements: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.yearTag}`))
				.filter(el => el instanceof HTMLElement);
			yearTagElements.forEach(tagEl => {
				tagEl.classList.add(styles.word);
			});

			// Query all words (including yearTags now directly marked as words) for animation
			const words: HTMLElement[] = Array.from(pinnedTextContainerEl.querySelectorAll(`.${styles.word}`))
				.filter(el => el instanceof HTMLElement);

			if (words.length === 0) {
				console.warn('[AboutMe GSAP] No words found to animate.');
				return;
			}

			ScrollTrigger.create({
				trigger: pinHeightEl,
				start: 'top top',
				end: 'bottom bottom',
				pin: pinnedTextContainerEl,
				// markers: true, // for debugging
			});

			// Pin the canvas as well, using the same trigger and duration
			// Ensure canvasRef.current exists before creating the ScrollTrigger
			if (canvasRef.current && pinHeightEl) {
				ScrollTrigger.create({
					trigger: pinHeightEl,
					pin: canvasRef.current,
					start: 'top top',
					end: 'bottom bottom',
					pinSpacing: false, // Important: no extra space
					// markers: true, // for debugging canvas pin
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

			lines.forEach(lineWords => {
				if (lineWords.length === 0) return;
				gsap.to(lineWords, {
					x: 0,
					stagger: 0.1, // Adjusted stagger for potentially more words
					ease: 'power1.inOut',
					scrollTrigger: {
						trigger: pinHeightEl,
						start: 'top top',
						end: 'bottom bottom', // Animation progresses through the entire pinHeight scroll
						scrub: true,
						// markers: true, // for debugging
					}
				});
			});
			console.log('[AboutMe GSAP] Text animation initialized.');
		};

		// A small timeout to help with layout and font loading before calculating offsets.
		// Replace with a more robust font loading strategy if needed.
		const timerId = setTimeout(initTextAnimation, 100);

		// Capture the current canvas element for the cleanup function
		const currentCanvasElement = canvasRef.current;

		// Cleanup function
		return () => {
			clearTimeout(timerId);
			const triggers = ScrollTrigger.getAll();
			triggers.forEach(trigger => {
				// More specific check if possible, e.g. by assigning an ID
				// or checking the pinned element
				if (trigger.vars.trigger === pinHeightEl ||
					trigger.vars.pin === pinnedTextContainerEl ||
					(currentCanvasElement && trigger.vars.pin === currentCanvasElement)
				) {
					trigger.kill();
				}
			});
			// If tweens are created outside of scrollTrigger directly, kill them too.
			// gsap.killTweensOf(pinnedTextContainerEl); // Example if direct tweens were used
			console.log('[AboutMe GSAP] Text animation cleaned up.');
		};
	}, []); // Empty dependency array to run once on mount and clean up on unmount

	// --- Canvas Animation useEffect ---
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = aboutMeContainerRef.current;

		if (!canvas || !container) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// --- Throttling settings for AboutMe Canvas --- 
		const TARGET_CANVAS_FPS_ABOUTME = 15; // Target FPS for this canvas animation
		const animationFrameInterval_aboutme = 1000 / TARGET_CANVAS_FPS_ABOUTME;
		let lastAnimationRunTime_aboutme = 0;
		// --- End Throttling settings --- 

		calculateCharMetrics(ctx);

		const handleMouseMove = (event: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			mousePositionRef.current = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
		};

		canvas.addEventListener('mousemove', handleMouseMove);

		const dpr = window.devicePixelRatio || 1;

		const resizeObserver = new ResizeObserver(entries => {
			for (let entry of entries) {
				// Use container's contentRect for width, and window.innerHeight for height
				const { width: newWidthFromContainer } = entry.contentRect;
				const newHeightFromViewport = window.innerHeight;

				canvas.width = newWidthFromContainer * dpr;
				canvas.height = newHeightFromViewport * dpr;
				canvas.style.width = `${newWidthFromContainer}px`;
				canvas.style.height = `${newHeightFromViewport}px`;

				ctx.scale(dpr, dpr); // Scale context for HiDPI displays

				calculateCharMetrics(ctx); // Recalculate font metrics as they might depend on context state

				colsRef.current = Math.floor(newWidthFromContainer / charWidthRef.current);
				rowsRef.current = Math.floor(newHeightFromViewport / charHeightRef.current);
			}
		});

		// Observe the container for width changes
		resizeObserver.observe(container);

		const renderAnimation = () => {
			animationFrameId.current = requestAnimationFrame(renderAnimation); // Keep rAF loop going

			const currentTime = Date.now(); // Get current time once for this frame
			const elapsed = currentTime - lastAnimationRunTime_aboutme;

			if (elapsed > animationFrameInterval_aboutme) {
				lastAnimationRunTime_aboutme = currentTime - (elapsed % animationFrameInterval_aboutme);

				// Actual drawing logic starts here
				const t = (currentTime - startTime.current) / 1000; // time in seconds, use currentTime for consistency

				ctx.fillStyle = '#121212'; // Background color, same as body
				ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr); // Clear canvas respecting DPR

				ctx.font = `${charHeightRef.current * 0.8}px monospace`; // Adjust font size based on calculated char height
				ctx.fillStyle = '#E0E0E0'; // Light gray for text
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				const m = Math.min(colsRef.current, rowsRef.current);

				// Convert mouse screen pixels to "character grid" coordinates for the animation logic
				vec2(
					(mousePositionRef.current.x / charWidthRef.current),
					(mousePositionRef.current.y / charHeightRef.current),
					reusablePointerInGridCoords // Pass as out
				);

				// Transform pointer to the normalized space expected by the sdf functions
				vec2(
					2.0 * (reusablePointerInGridCoords.x - colsRef.current / 2) / m * aspectRef.current,
					2.0 * (reusablePointerInGridCoords.y - rowsRef.current / 2) / m,
					reusablePointerNormalized // Pass as out
				);

				for (let j = 0; j < rowsRef.current; j++) { // y-coordinate (row)
					for (let i = 0; i < colsRef.current; i++) { // x-coordinate (col)
						// Current character cell coordinate, using reusable object
						vec2(i, j, reusableCoord);

						// Transform cell coordinate to normalized space for SDF, using reusable object
						vec2(
							2.0 * (reusableCoord.x - colsRef.current / 2) / m * aspectRef.current,
							2.0 * (reusableCoord.y - rowsRef.current / 2) / m,
							reusableSt
						);

						const d1 = sdCircle(reusableSt, 0.3 + 0.1 * Math.sin(t * 0.5)); // origin, radius animates
						const d2 = sdCircle(sub(reusableSt, reusablePointerNormalized, reusableSubResult), 0.2 + 0.05 * Math.cos(t * 0.7)); // cursor, radius animates

						const d = opSmoothUnion(d1, d2, 0.6 + 0.2 * Math.sin(t * 0.3)); // k animates

						const c = 1.0 - Math.exp(-4 * Math.abs(d)); // Softer falloff
						let index = Math.floor(c * DENSITY.length);
						index = Math.max(0, Math.min(index, DENSITY.length - 1)); // Clamp index

						const char = DENSITY[index];
						if (char && char !== ' ') { // Avoid drawing empty spaces if not needed
							ctx.fillText(
								char,
								(i + 0.5) * charWidthRef.current,
								(j + 0.5) * charHeightRef.current
							);
						}
					}
				}
			}
		};

		// ScrollTrigger to manage canvas animation activity
		// Ensure canvasRef.current and the container (aboutMeContainerRef.current) exist
		let GsapAnimationScrollTrigger: ScrollTrigger | undefined;
		if (container && canvasRef.current) {
			GsapAnimationScrollTrigger = ScrollTrigger.create({
				trigger: container,
				start: "top bottom",
				end: "bottom top",
				onToggle: self => {
					if (self.isActive) {
						cancelAnimationFrame(animationFrameId.current);
						lastAnimationRunTime_aboutme = Date.now(); // Reset timer when starting
						animationFrameId.current = requestAnimationFrame(renderAnimation);
					} else {
						cancelAnimationFrame(animationFrameId.current);
					}
				}
			});
		}

		return () => {
			cancelAnimationFrame(animationFrameId.current);
			canvas.removeEventListener('mousemove', handleMouseMove);
			resizeObserver.disconnect();
			// Kill the animation ScrollTrigger if it was created
			GsapAnimationScrollTrigger?.kill();
			// console.log('[AboutMe Canvas] Canvas animation cleaned up.'); // Optional log
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div ref={aboutMeContainerRef} className={styles.aboutMeContainer}>
			<canvas
				ref={canvasRef}
				className={styles.asciiCanvas}
			/>
			<section className={styles.mwgEffect004}>
				<div ref={pinHeightRef} className={styles.pinHeight}>
					<div ref={pinnedTextContainerRef} className={styles.textAnimationContainer}>
						{/* Column 1: About Me */}
						<div ref={paragraphsContainerRef} className={`${styles.textColumn} ${styles.aboutColumn}`}>
							<h1>ABOUT ME</h1>
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

						{/* Column 2: Expos */}
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

						{/* Column 3: Links */}
						<div className={`${styles.textColumn} ${styles.linksColumn}`}>
							<h2>LINKS</h2> {/* Changed from h1 to h2 */}
							<ul>
								<li><a href="https://www.instagram.com/glitchypixels/">INSTAGRAM</a></li>
								<li><a href="https://x.com/iamglitchypixel">TWITTER</a></li>
								<li><a href="https://www.reddit.com/user/iamglitchypixels/">REDDIT</a></li>
								<li><a href="https://thehug.xyz/artists/glitchypixels">THEHUG</a></li>
								<li><a href="iamglitchypixel@gmail.com ">MAIL</a></li>
							</ul>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};
