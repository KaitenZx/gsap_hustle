import React, { useRef, useEffect, useCallback } from 'react';

import { usePinState } from '../../context/PinStateContext';

import styles from './index.module.scss';

// Inspired by your cursor colors - REDUCED ALPHA
const GLITCH_COLORS = [
	'rgba(255, 0, 0, 0.3)', // Red
	'rgba(0, 255, 0, 0.3)', // Green
	'rgba(0, 0, 255, 0.3)', // Blue
	'rgba(255, 0, 255, 0.3)', // Magenta
	'rgba(0, 255, 255, 0.3)', // Cyan
	'rgba(255, 255, 0, 0.3)', // Yellow
];

const getRandomColor = () => GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];

export const GlitchOverlay: React.FC = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { isOverlayActive } = usePinState();
	const animationFrameId = useRef<number | null>(null);
	const lastFrameTime = useRef(0);
	const TARGET_FPS = 10; // Further reduced FPS for less flickering
	const frameInterval = 1000 / TARGET_FPS;

	const drawGlitch = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
		ctx.clearRect(0, 0, width, height);

		// Reduce flicker: 50% chance to skip drawing any glitch in this frame
		if (Math.random() < 0.5) {
			return;
		}

		const glitchType = Math.random();

		// 1. RGB Shift Blocks - SMALLER & MORE TRANSPARENT (via GLITCH_COLORS)
		if (glitchType < 0.3) {
			const numBlocks = Math.floor(Math.random() * 3) + 1; // Further reduced
			for (let i = 0; i < numBlocks; i++) {
				const x = Math.floor(Math.random() * width);
				const y = Math.floor(Math.random() * height);
				const w = Math.floor(Math.random() * (width / 12) + 5); // Further reduced width
				const h = Math.floor(Math.random() * (height / 30) + 3); // Further reduced height
				const shiftX = Math.floor((Math.random() - 0.5) * 10); // Further reduced shift
				const shiftY = Math.floor((Math.random() - 0.5) * 3);  // Further reduced shift

				ctx.fillStyle = getRandomColor();
				ctx.fillRect(x + shiftX, y + shiftY, w, h);
			}
		}
		// 2. Scanlines / Horizontal tearing - THINNER & MORE TRANSPARENT
		else if (glitchType < 0.6) {
			const numLines = Math.floor(Math.random() * 4) + 2; // Further reduced lines
			for (let i = 0; i < numLines; i++) {
				const y = Math.floor(Math.random() * height);
				const h = Math.floor(Math.random() * 1.0 + 0.25); // Further reduced thickness
				const offsetX = Math.floor((Math.random() - 0.5) * (width / 6)); // Further reduced offset
				const lineWidth = Math.floor(Math.random() * (width / 4) + (width / 6)); // Further reduced width
				// Use GLITCH_COLORS for colored scanlines, or a more transparent white
				ctx.fillStyle = Math.random() < 0.6 ? 'rgba(200, 200, 200, 0.03)' : getRandomColor(); // More transparent white
				ctx.fillRect(offsetX + Math.floor(Math.random() * width / 5), y, lineWidth, h);
			}
		}
		// 3. Pixelation-like effect (large blocks) - SMALLER BLOCKS & MORE TRANSPARENT (via GLITCH_COLORS)
		else if (glitchType < 0.85) {
			const blockSize = Math.floor(Math.random() * 15) + 5; // Further reduced block size
			const numBlocksX = Math.ceil(width / blockSize);
			const numBlocksY = Math.ceil(height / blockSize);
			for (let i = 0; i < numBlocksX; i++) {
				for (let j = 0; j < numBlocksY; j++) {
					if (Math.random() < 0.07) { // Further reduced frequency
						ctx.fillStyle = getRandomColor();
						ctx.fillRect(i * blockSize, j * blockSize, blockSize, blockSize);
					}
				}
			}
		}
		// 4. Jitter/Displacement - SMALLER TEXT & MORE TRANSPARENT (via GLITCH_COLORS)
		else {
			ctx.font = `${Math.floor(Math.random() * 7 + 6)}px monospace`; // Further reduced font size
			ctx.fillStyle = getRandomColor();
			if (Math.random() < 0.07) { // Further reduced text frequency
				ctx.fillText("!ERR!", Math.floor(Math.random() * width), Math.floor(Math.random() * height)); // Shorter text
				// ctx.fillText("!LAG!", Math.random() * width, Math.random() * height);
			}

			const shiftX = Math.floor((Math.random() - 0.5) * 5); // Further reduced shift
			const shiftY = Math.floor((Math.random() - 0.5) * 5); // Further reduced shift
			ctx.globalAlpha = 0.3; // Further reduced opacity for ghosting
			if (Math.random() < 0.2) { // Further reduced ghosting frequency
				ctx.fillStyle = 'rgba(100, 100, 100, 0.01)'; // More transparent ghost
				for (let k = 0; k < 2; k++) { // Fewer ghost blocks
					ctx.fillRect(Math.floor(Math.random() * width + shiftX), Math.floor(Math.random() * height + shiftY), Math.floor(Math.random() * width / 4), Math.floor(Math.random() * height / 4)); // Smaller ghost blocks
				}
			}
			ctx.globalAlpha = 1.0;
		}
	}, []);


	const renderLoop = useCallback((timestamp: number) => {
		animationFrameId.current = requestAnimationFrame(renderLoop);
		const elapsed = timestamp - lastFrameTime.current;

		if (elapsed > frameInterval) {
			lastFrameTime.current = timestamp - (elapsed % frameInterval);
			const canvas = canvasRef.current;
			if (canvas) {
				const ctx = canvas.getContext('2d');
				if (ctx) {
					// The canvas width/height for drawing should be the unscaled dimensions
					drawGlitch(ctx, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
				}
			}
		}
	}, [drawGlitch, frameInterval]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Initial setup for canvas size considering DPR happens in the resize effect
		// This effect is primarily for starting/stopping the animation loop

		if (isOverlayActive) {
			lastFrameTime.current = performance.now();
			if (!animationFrameId.current) {
				animationFrameId.current = requestAnimationFrame(renderLoop);
			}
		} else {
			if (animationFrameId.current) {
				cancelAnimationFrame(animationFrameId.current);
				animationFrameId.current = null;
			}
			// Clear canvas when not active
			const ctx = canvas.getContext('2d');
			if (ctx) {
				const dpr = window.devicePixelRatio || 1;
				ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
			}
		}

		return () => {
			if (animationFrameId.current) {
				cancelAnimationFrame(animationFrameId.current);
				animationFrameId.current = null;
			}
		};
	}, [isOverlayActive, renderLoop]);

	// Resize handler
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const handleResize = () => {
			const dpr = window.devicePixelRatio || 1;
			// Set canvas display size to 100vw/vh via CSS, then get actual pixel dimensions
			// canvas.style.width = '100vw'; // This is handled by CSS
			// canvas.style.height = '100vh';
			const rect = canvas.getBoundingClientRect();

			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;

			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.scale(dpr, dpr);
				// If active, redraw immediately after resize with unscaled dimensions
				if (isOverlayActive) {
					drawGlitch(ctx, rect.width, rect.height);
				}
			}
		};

		window.addEventListener('resize', handleResize);
		handleResize(); // Initial size set

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, [isOverlayActive, drawGlitch]);


	return (
		<canvas
			ref={canvasRef}
			className={`${styles.glitchOverlayCanvas} ${isOverlayActive ? styles.active : ''}`}
		/>
	);
};
