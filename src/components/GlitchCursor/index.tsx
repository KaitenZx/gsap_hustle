import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import throttle from 'lodash/throttle';

import styles from './index.module.scss';

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
	X: -9,
	Y: -5,
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

const _glitchCursorPreloadedUrls = new Set<string>();

export const GlitchCursor: React.FC = () => {
	const [isClientTouchDevice, setIsClientTouchDevice] = useState(false);
	const cursorRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const touchCheck = isTouchDevice();
		setIsClientTouchDevice(touchCheck);

		if (!touchCheck) {
			document.body.classList.add('no-system-cursor');
		}

		return () => {
			if (!touchCheck) {
				document.body.classList.remove('no-system-cursor');
			}
		};
	}, []);

	// --- Preload cursor sprites ---
	useEffect(() => {
		Object.values(SPRITES).forEach(sprite => {
			if (!_glitchCursorPreloadedUrls.has(sprite.url)) {
				_glitchCursorPreloadedUrls.add(sprite.url);
				const img = new Image();
				img.src = sprite.url;
			}
		});
	}, []);

	const [position, setPosition] = useState({ x: -100, y: -100 });
	const [currentFrame, setCurrentFrame] = useState(0);
	const [cursorType, setCursorType] = useState(CURSOR_TYPES.DEFAULT);
	const [isVisible, setIsVisible] = useState(false);

	const animationIntervalRef = useRef<number | null>(null);
	const currentSprite = SPRITES[cursorType];


	const handleMouseMove = useMemo(
		() =>
			throttle(
				(event: MouseEvent) => {
					if (!cursorRef.current) return;
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
		[isVisible]
	);

	const handleMouseEnter = useCallback(() => {
		setIsVisible(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsVisible(false);
		setPosition({ x: -100, y: -100 });
	}, []);

	// Animation loop using setInterval for fixed timing
	useEffect(() => {
		// Cleanup previous interval when cursor type changes
		if (animationIntervalRef.current) {
			clearInterval(animationIntervalRef.current);
		}

		setCurrentFrame(0);

		// Start a new interval for the current sprite
		animationIntervalRef.current = window.setInterval(() => {
			setCurrentFrame((prevFrame) => (prevFrame + 1) % currentSprite.frames);
		}, currentSprite.animationSpeed);

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


	if (isClientTouchDevice) {
		return null;
	}

	const backgroundPositionX = -currentFrame * currentSprite.frameWidth;

	// Use initial position from state, but subsequent updates are via ref
	const initialTransform = `translate3d(${position.x + CURSOR_OFFSET.X}px, ${position.y + CURSOR_OFFSET.Y}px, 0)`;

	return (
		<div
			ref={cursorRef}
			className={`${styles.glitchCursor} ${isVisible ? styles.visible : ''}`}
			style={{
				transform: initialTransform,
				backgroundImage: `url(${currentSprite.url})`,
				backgroundPosition: `${backgroundPositionX}px 0px`,
				width: `${currentSprite.frameWidth}px`,
				height: `${currentSprite.frameHeight}px`,
			}}
		/>
	);
};
