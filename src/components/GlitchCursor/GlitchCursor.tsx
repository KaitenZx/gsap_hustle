import React, { useState, useEffect, useCallback, useRef } from 'react';

import styles from './GlitchCursor.module.scss';

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

const GlitchCursor: React.FC = () => {
	const [isClientTouchDevice, setIsClientTouchDevice] = useState(false);

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

	const [position, setPosition] = useState({ x: -100, y: -100 }); // Start off-screen
	const [currentFrame, setCurrentFrame] = useState(0);
	const [cursorType, setCursorType] = useState(CURSOR_TYPES.DEFAULT);
	const [isVisible, setIsVisible] = useState(false); // Start hidden until first mouse move

	const requestRef = useRef<number | null>(null);
	const previousTimeRef = useRef<number | null>(null);
	const currentSprite = SPRITES[cursorType];

	// Mouse move handler
	const handleMouseMove = useCallback((event: MouseEvent) => {
		if (!isVisible) setIsVisible(true);
		setPosition({ x: event.clientX, y: event.clientY });

		const target = event.target as HTMLElement;
		// Check not only tag name but also computed cursor style for elements like styled divs acting as buttons
		const computedStyle = window.getComputedStyle(target);
		const isInteractive =
			target.tagName === 'A' ||
			target.tagName === 'BUTTON' ||
			target.hasAttribute('role') && (target.getAttribute('role') === 'button' || target.getAttribute('role') === 'link') ||
			(target.closest('a[href], button') !== null) || // Check if inside a link or button
			computedStyle.cursor === 'pointer';

		setCursorType(isInteractive ? CURSOR_TYPES.POINTER : CURSOR_TYPES.DEFAULT);
	}, [isVisible]);

	// Mouse enter/leave viewport
	const handleMouseEnter = useCallback(() => {
		setIsVisible(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsVisible(false);
		setPosition({ x: -100, y: -100 }); // Move off-screen when mouse leaves
	}, []);

	// Animation loop
	const animate = useCallback((time: number) => {
		if (previousTimeRef.current !== null) {
			const deltaTime = time - previousTimeRef.current;
			if (deltaTime > currentSprite.animationSpeed) { // Use currentSprite directly
				setCurrentFrame((prevFrame) => (prevFrame + 1) % currentSprite.frames);
				previousTimeRef.current = time; // Reset the timer
			}
		} else {
			previousTimeRef.current = time; // Initialize timer on first call
		}
		requestRef.current = requestAnimationFrame(animate);
	}, [currentSprite.animationSpeed, currentSprite.frames]); // Add dependencies

	useEffect(() => {
		// This effect handles the animation restart logic when cursorType changes
		setCurrentFrame(0);
		previousTimeRef.current = null; // Reset timer for new animation speed and ensure it re-initializes

		// If an animation frame was requested, cancel it before starting a new one or when component unmounts
		if (requestRef.current) {
			cancelAnimationFrame(requestRef.current);
		}
		// Restart the animation loop with potentially new sprite data
		requestRef.current = requestAnimationFrame(animate);

		// Cleanup function for this effect
		return () => {
			if (requestRef.current) {
				cancelAnimationFrame(requestRef.current);
			}
		};
	}, [cursorType, animate, currentSprite.animationSpeed]); // animate is stable, currentSprite.animationSpeed ensures re-run if speed changes

	useEffect(() => {
		document.addEventListener('mousemove', handleMouseMove);
		document.documentElement.addEventListener('mouseenter', handleMouseEnter);
		document.documentElement.addEventListener('mouseleave', handleMouseLeave);

		// Initial call to start animation is now handled by the effect above, specific to cursorType changes

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.documentElement.removeEventListener('mouseenter', handleMouseEnter);
			document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
			// Animation cleanup is handled by the other useEffect
		};
	}, [handleMouseMove, handleMouseEnter, handleMouseLeave]);

	// --- Conditional Rendering for Touch Devices ---
	if (isClientTouchDevice) {
		return null; // Don't render anything for touch devices
	}

	if (!isVisible) {
		return null;
	}

	const backgroundPositionX = -currentFrame * currentSprite.frameWidth;

	return (
		<div
			className={styles.glitchCursor}
			style={{
				transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
				backgroundImage: `url(${currentSprite.url})`,
				backgroundPosition: `${backgroundPositionX}px 0px`,
				width: `${currentSprite.frameWidth}px`,
				height: `${currentSprite.frameHeight}px`,
			}}
		/>
	);
};

export default GlitchCursor; 