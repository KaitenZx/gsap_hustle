import React, { useRef, useEffect } from 'react';

import styles from './AsciiBackground.module.scss';
import { sdCircle, opSmoothUnion } from './utils/sdf';
import { vec2, sub, Vec2 } from './utils/vec2';

const DENSITY = '#gLitCh?*:÷pxls×+=-· ';

export type AsciiBackgroundProps = {
	width?: string;
	height?: string;
	className?: string;
};

const AsciiBackground: React.FC<AsciiBackgroundProps> = ({
	width = '100vw',
	height = '100vh',
	className,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mousePositionRef = useRef<Vec2>({ x: 0, y: 0 });
	const animationFrameId = useRef<number>(0);
	const startTime = useRef<number>(Date.now());

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
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

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
				const { width: newWidth, height: newHeight } = entry.contentRect;
				canvas.width = newWidth * dpr;
				canvas.height = newHeight * dpr;
				canvas.style.width = `${newWidth}px`;
				canvas.style.height = `${newHeight}px`;

				ctx.scale(dpr, dpr); // Scale context for HiDPI displays

				calculateCharMetrics(ctx); // Recalculate font metrics as they might depend on context state

				colsRef.current = Math.floor(newWidth / charWidthRef.current);
				rowsRef.current = Math.floor(newHeight / charHeightRef.current);
			}
		});

		resizeObserver.observe(canvas);


		const renderAnimation = () => {
			const t = (Date.now() - startTime.current) / 1000; // time in seconds

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
			animationFrameId.current = requestAnimationFrame(renderAnimation);
		};

		animationFrameId.current = requestAnimationFrame(renderAnimation);

		return () => {
			cancelAnimationFrame(animationFrameId.current);
			canvas.removeEventListener('mousemove', handleMouseMove);
			resizeObserver.disconnect();
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className={`${styles.asciiCanvas} ${className || ''}`}
			style={{ width, height }}
		/>
	);
};

export default AsciiBackground; 