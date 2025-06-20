import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import throttle from 'lodash/throttle';

import styles from './index.module.scss';

// Helper to check for touch devices
const isTouchDevice = () => {
	if (typeof window === 'undefined') return false;
	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
	);
};

const CURSOR_TYPES = {
	DEFAULT: 'default',
	POINTER: 'pointer',
};

const CURSOR_OFFSET = {
	X: -9, // px, negative to move left, positive to move right
	Y: -5,   // px, negative to move up, positive to move down
};

const SPRITES = {
	[CURSOR_TYPES.DEFAULT]: {
		url: '/GlitchCursor.png',
		frames: 7,
		width: 224, // 7 frames * 32px/frame
		frameWidth: 32,
		frameHeight: 32,
		animationSpeed: 100, // ms per frame
	},
	[CURSOR_TYPES.POINTER]: {
		url: '/SelectGlitchCursor.png',
		frames: 13,
		width: 416, // 13 frames * 32px/frame
		frameWidth: 32,
		frameHeight: 32,
		animationSpeed: 90, // ms per frame, can be different
	},
};

// Set to track preloaded sprite URLs
const _glitchCursorPreloadedUrls = new Set<string>();

export const GlitchCursor: React.FC = () => {
	const [isClientTouchDevice, setIsClientTouchDevice] = useState(false);
	const cursorRef = useRef<HTMLDivElement>(null); // Ref for direct DOM manipulation

	// --- Determine if it's a touch device on client-side --- 
	useEffect(() => {
		const touchCheck = isTouchDevice();
		setIsClientTouchDevice(touchCheck);

		if (!touchCheck) {
			document.body.classList.add('no-system-cursor');
		}

		return () => {
			// Cleanup: remove class if component unmounts, though typically it won't for an app-wide cursor
			if (!touchCheck) {
				document.body.classList.remove('no-system-cursor');
			}
		};
	}, []); // Empty dependency array means this runs once on mount and cleanup on unmount

	// --- Preload cursor sprites ---
	useEffect(() => {
		Object.values(SPRITES).forEach(sprite => {
			if (!_glitchCursorPreloadedUrls.has(sprite.url)) {
				_glitchCursorPreloadedUrls.add(sprite.url);
				const img = new Image();
				img.src = sprite.url;
			}
		});
	}, []); // Run once on mount

	const [position, setPosition] = useState({ x: -100, y: -100 }); // Keep for initial position and leaving
	const [currentFrame, setCurrentFrame] = useState(0);
	const [cursorType, setCursorType] = useState(CURSOR_TYPES.DEFAULT);
	const [isVisible, setIsVisible] = useState(false);

	const animationIntervalRef = useRef<number | null>(null);
	const currentSprite = SPRITES[cursorType];

	// Mouse move handler - throttled for performance
	const handleMouseMove = useMemo(
		() =>
			throttle(
				(event: MouseEvent) => {
					if (!cursorRef.current) return;
					// Update position directly via ref, avoiding React re-renders
					cursorRef.current.style.transform = `translate3d(${event.clientX + CURSOR_OFFSET.X
						}px, ${event.clientY + CURSOR_OFFSET.Y}px, 0)`;

					if (!isVisible) setIsVisible(true);

					const target = event.target as HTMLElement;
					const isInteractive =
						target.closest('[data-interactive-cursor="true"]') !== null;
					setCursorType(
						isInteractive ? CURSOR_TYPES.POINTER : CURSOR_TYPES.DEFAULT
					);
				},
				16,
				{ leading: true, trailing: false } // More responsive for cursor
			),
		[isVisible] // Dependency for setIsVisible closure
	);

	// Mouse enter/leave viewport
	const handleMouseEnter = useCallback(() => {
		setIsVisible(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsVisible(false);
		setPosition({ x: -100, y: -100 }); // Use state to move it off-screen, triggering a re-render
	}, []);

	// Animation loop using setInterval for fixed timing
	useEffect(() => {
		// Cleanup previous interval when cursor type changes
		if (animationIntervalRef.current) {
			clearInterval(animationIntervalRef.current);
		}

		// Reset frame to 0 for the new sprite
		setCurrentFrame(0);

		// Start a new interval for the current sprite
		animationIntervalRef.current = window.setInterval(() => {
			setCurrentFrame((prevFrame) => (prevFrame + 1) % currentSprite.frames);
		}, currentSprite.animationSpeed);

		// Cleanup on component unmount or before the next effect run
		return () => {
			if (animationIntervalRef.current) {
				clearInterval(animationIntervalRef.current);
			}
		};
	}, [cursorType, currentSprite.frames, currentSprite.animationSpeed]);

	useEffect(() => {
		document.addEventListener('mousemove', handleMouseMove);
		document.documentElement.addEventListener('mouseenter', handleMouseEnter);
		document.documentElement.addEventListener('mouseleave', handleMouseLeave);

		return () => {
			handleMouseMove.cancel(); // Cancel any pending throttled calls
			document.removeEventListener('mousemove', handleMouseMove);
			document.documentElement.removeEventListener('mouseenter', handleMouseEnter);
			document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
		};
	}, [handleMouseMove, handleMouseEnter, handleMouseLeave]);

	// --- Conditional Rendering for Touch Devices ---
	if (isClientTouchDevice) {
		return null; // Don't render anything for touch devices
	}

	const backgroundPositionX = -currentFrame * currentSprite.frameWidth;

	// Use initial position from state, but subsequent updates are via ref
	const initialTransform = `translate3d(${position.x + CURSOR_OFFSET.X}px, ${position.y + CURSOR_OFFSET.Y}px, 0)`;

	return (
		<div
			ref={cursorRef}
			className={`${styles.glitchCursor} ${isVisible ? styles.visible : ''}`}
			style={{
				transform: initialTransform, // Set initial transform
				backgroundImage: `url(${currentSprite.url})`,
				backgroundPosition: `${backgroundPositionX}px 0px`,
				width: `${currentSprite.frameWidth}px`,
				height: `${currentSprite.frameHeight}px`,
			}}
		/>
	);
};
