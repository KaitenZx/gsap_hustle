import React, { useRef, useEffect, memo } from 'react';

import { usePinState } from '../../context/PinStateContext';

import styles from './index.module.scss';


export const GlitchOverlay: React.FC = memo(() => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const workerRef = useRef<Worker | null>(null);
	const { isOverlayActive } = usePinState();

	useEffect(() => {
		if (!canvasRef.current) return;

		const worker = new Worker(new URL('./glitch.worker.ts', import.meta.url), {
			type: 'module',
		});
		workerRef.current = worker;

		const canvas = canvasRef.current;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();

		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;

		const offscreenCanvas = canvas.transferControlToOffscreen();

		worker.postMessage(
			{
				type: 'init',
				payload: {
					canvas: offscreenCanvas,
					logicalWidth: rect.width,
					logicalHeight: rect.height,
					dpr: dpr,
				},
			},
			[offscreenCanvas]
		);

		return () => {
			worker.terminate();
		};
	}, []);

	useEffect(() => {
		if (!workerRef.current) return;

		if (isOverlayActive) {
			workerRef.current.postMessage({ type: 'start' });
		} else {
			workerRef.current.postMessage({ type: 'stop' });
		}
	}, [isOverlayActive]);

	useEffect(() => {
		const handleResize = () => {
			const canvas = canvasRef.current;
			const worker = workerRef.current;
			if (!canvas || !worker) return;

			const rect = canvas.getBoundingClientRect();

			worker.postMessage({
				type: 'resize',
				payload: {
					logicalWidth: rect.width,
					logicalHeight: rect.height,
				},
			});
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, []); // Empty dependency array, functions inside have access to refs

	return (
		<canvas
			ref={canvasRef}
			className={`${styles.glitchOverlayCanvas} ${isOverlayActive ? styles.active : ''}`}
		/>
	);
});

GlitchOverlay.displayName = 'GlitchOverlay';
