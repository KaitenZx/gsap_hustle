import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { throttle } from 'lodash';

import { usePinState } from '../../context/PinStateContext';
import lqipMapData from '../../lqip-map.json';
import { ImageModal } from '../ImageModal';
import { ScrollUpButton } from '../ScrollUpButton';

import { GalleryColumn } from './GalleryColumn';
import {
	COLS,
	GalleryItem,
	getColumnPreviewImageUrls,
	preloadImage,
} from './galleryData';
import { useCanvasWorker } from './hooks/useCanvasWorker';
import { useGridDimensions } from './hooks/useGridDimensions';
import { useScrollTriggerPinning } from './hooks/useScrollTriggerPinning';
import styles from './index.module.scss';
import { InternalFooter } from './InternalFooter';
import { GridDimensions, MediaAnimData } from './types';

const lqipMap: Record<string, string> = lqipMapData;
gsap.registerPlugin(Observer, ScrollTrigger, InertiaPlugin);

const PRELOAD_THROTTLE_MS = 150;
const ROTATION_CLAMP = 18;
const ROTATION_SENSITIVITY = 18;
const LERP_FACTOR = 0.7;
const DESKTOP_FOOTER_THRESHOLD = -3000;
const MOBILE_FOOTER_THRESHOLD = -1500;
const FOOTER_HYSTERESIS = 500;
const MOBILE_BREAKPOINT_PX = 768;
const PRELOAD_COLS_COUNT_DESKTOP = 8;
const PRELOAD_COLS_COUNT_MOBILE = 12;

const _preloadedFullUrls = new Set<string>();
const preloadFullImage = (url: string) => {
	if (!_preloadedFullUrls.has(url)) {
		_preloadedFullUrls.add(url);
		const img = new Image();
		img.src = url;
	}
};

const getIsTouchDevice = () => {
	if (typeof window === 'undefined') return false;
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export const InfiniteGallery: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const contentWrapperRef = useRef<HTMLDivElement>(null);
	const columnRef = useRef<HTMLDivElement>(null);
	const itemRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const gsapCtx = useRef<gsap.Context | null>(null);
	const observerInstance = useRef<Observer | null>(null);
	const inertiaXTweenRef = useRef<gsap.core.Tween | null>(null);
	const inertiaYTweenRef = useRef<gsap.core.Tween | null>(null);

	const incrX = useRef(0);
	const incrY = useRef(0);
	const throttledPreloadRef = useRef<ReturnType<typeof throttle> | null>(null);
	const throttledCheckFooterVisibilityRef =
		useRef<ReturnType<typeof throttle> | null>(null);
	const dimensionsRef = useRef<GridDimensions | null>(null);
	const isInitialized = useRef(false);
	const didDragSincePressRef = useRef(false);

	const currentActualXRef = useRef(0);
	const currentActualYRef = useRef(0);
	const lerpLoopIdRef = useRef<number | null>(null);
	const isLerpingActiveRef = useRef(false);

	const mediaAnimRefs = useRef(new Map<string, MediaAnimData>());
	const mousePos = useRef({ x: 0, y: 0 });
	const isScrollingRef = useRef(false);
	const containerCenterRef = useRef({ x: 0, y: 0 });
	const scrollStopTimeoutRef = useRef<number | null>(null);

	const isTouchDevice = useMemo(() => getIsTouchDevice(), []);

	const isScrollLockedRef = useRef(false);
	const [isLockedState, setIsLockedState] = useState(false);
	const [renderColsCount, setRenderColsCount] = useState(COLS);
	const [isReadyForPinning, setIsReadyForPinning] = useState(false);
	const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
	const [showInternalFooter, setShowInternalFooter] = useState(false);
	const showInternalFooterRef = useRef(showInternalFooter);
	const [showScrollUpButton, setShowScrollUpButton] = useState(false);
	const { setIsGalleryPinned } = usePinState();

	useCanvasWorker({
		canvasRef,
		containerRef,
		isTouchDevice,
		isScrollingRef,
	});

	useEffect(() => {
		showInternalFooterRef.current = showInternalFooter;
	}, [showInternalFooter]);

	const lerpStep = useCallback(() => {
		if (
			!isInitialized.current ||
			!dimensionsRef.current ||
			!contentWrapperRef.current
		) {
			if (isLerpingActiveRef.current) {
				lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
			} else {
				lerpLoopIdRef.current = null;
			}
			return;
		}

		const dims = dimensionsRef.current;
		const targetX = incrX.current;
		const targetY = incrY.current;

		let newActualX =
			currentActualXRef.current +
			(targetX - currentActualXRef.current) * LERP_FACTOR;
		let newActualY =
			currentActualYRef.current +
			(targetY - currentActualYRef.current) * LERP_FACTOR;

		const deltaThreshold = 0.01;

		if (Math.abs(targetX - newActualX) < deltaThreshold) newActualX = targetX;
		if (Math.abs(targetY - newActualY) < deltaThreshold) newActualY = targetY;

		if (
			currentActualXRef.current !== newActualX ||
			currentActualYRef.current !== newActualY
		) {
			currentActualXRef.current = newActualX;
			currentActualYRef.current = newActualY;

			gsap.set(contentWrapperRef.current, {
				x: dims.wrapX(currentActualXRef.current),
				y: dims.wrapY(currentActualYRef.current),
			});
		}

		if (isLerpingActiveRef.current) {
			if (
				currentActualXRef.current !== targetX ||
				currentActualYRef.current !== targetY
			) {
				lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
			} else {
				lerpLoopIdRef.current = null;
			}
		} else {
			lerpLoopIdRef.current = null;
		}
	}, []);

	useEffect(() => {
		if (isLerpingActiveRef.current && !lerpLoopIdRef.current) {
			lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
		} else if (!isLerpingActiveRef.current && lerpLoopIdRef.current) {
			cancelAnimationFrame(lerpLoopIdRef.current);
			lerpLoopIdRef.current = null;
		}
		return () => {
			if (lerpLoopIdRef.current) {
				cancelAnimationFrame(lerpLoopIdRef.current);
				lerpLoopIdRef.current = null;
			}
		};
	}, [lerpStep]);

	const checkFooterVisibility = useCallback(() => {
		const yScrolled = incrY.current;
		const dims = dimensionsRef.current;
		const threshold =
			dims && dims.viewportWidth <= MOBILE_BREAKPOINT_PX
				? MOBILE_FOOTER_THRESHOLD
				: DESKTOP_FOOTER_THRESHOLD;

		if (!showInternalFooterRef.current && yScrolled < threshold) {
			setShowInternalFooter(true);
			setShowScrollUpButton(true);
		} else if (
			showInternalFooterRef.current &&
			yScrolled > threshold + FOOTER_HYSTERESIS
		) {
			setShowInternalFooter(false);
			setShowScrollUpButton(false);
		}
	}, []);

	const handleImageClick = useCallback((item: GalleryItem) => {
		if (!didDragSincePressRef.current) {
			setSelectedItem(item);
		}
	}, []);

	const handleCloseModal = useCallback(() => {
		setSelectedItem(null);
	}, []);

	const handleInteractionStart = useCallback((fullSrc: string) => {
		preloadFullImage(fullSrc);
	}, []);

	const columnsToRender = useMemo(() => {
		mediaAnimRefs.current.clear();
		return Array.from({ length: renderColsCount }).map((_, index) => (
			<GalleryColumn
				key={`col-${index}`}
				columnIndex={index}
				columnRef={columnRef}
				itemRef={itemRef}
				mediaAnimRefs={mediaAnimRefs}
				handleImageClick={handleImageClick}
				handleInteractionStart={handleInteractionStart}
				lqipMap={lqipMap}
			/>
		));
	}, [renderColsCount, handleImageClick, handleInteractionStart]);

	const handleResize = useCallback((newDims: GridDimensions) => {
		if (gsapCtx.current && contentWrapperRef.current) {
			inertiaXTweenRef.current?.kill();
			inertiaYTweenRef.current?.kill();

			gsapCtx.current.add(() => {
				incrX.current = 0;
				currentActualXRef.current = 0;
				currentActualYRef.current = newDims.wrapY(currentActualYRef.current);
				gsap.set(contentWrapperRef.current, {
					x: newDims.wrapX(currentActualXRef.current),
					y: currentActualYRef.current,
				});

				mediaAnimRefs.current.forEach((refData) => {
					refData.rotX?.(0);
					refData.rotY?.(0);
				});
			});
		}
		ScrollTrigger.refresh();
	}, []);

	const { calculateDimensions, calculateRenderCols } = useGridDimensions({
		containerRef,
		contentWrapperRef,
		columnRef,
		itemRef,
		onResize: handleResize,
		currentRenderCols: renderColsCount,
		setRenderColsCount,
	});

	const setScrollLocked = useCallback(
		(locked: boolean) => {
			if (isScrollLockedRef.current !== locked) {
				isScrollLockedRef.current = locked;
				setIsLockedState(locked);
				setIsGalleryPinned(locked);

				if (containerRef.current) {
					containerRef.current.style.touchAction = locked ? 'none' : 'auto';
					if (locked) observerInstance.current?.enable();
					else observerInstance.current?.disable();
				} else {
					if (locked) observerInstance.current?.enable();
					else observerInstance.current?.disable();
				}
				document.body.classList.toggle('ifg-locked', locked);
			}
		},
		[setIsGalleryPinned]
	);

	const scrollTriggerInstanceRef = useScrollTriggerPinning({
		containerRef,
		onToggle: setScrollLocked,
		isReady: isReadyForPinning,
	});

	const handleScrollUpRequest = useCallback(() => {
		isLerpingActiveRef.current = true;
		if (!lerpLoopIdRef.current) {
			lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
		}
		const scrollTriggerInstance = scrollTriggerInstanceRef.current;
		if (
			scrollTriggerInstance &&
			typeof scrollTriggerInstance.start === 'number'
		) {
			const galleryPinStartScrollY = scrollTriggerInstance.start;
			const twentyVhInPixels = window.innerHeight * 0.2;
			let targetScrollY = Math.max(0, galleryPinStartScrollY - twentyVhInPixels - 1);

			gsap.to(incrY, { current: 0, duration: 1.5, ease: 'none' });
			gsap.to(window, {
				scrollTo: targetScrollY,
				duration: 1.5,
				ease: 'none',
				onComplete: () => {
					incrY.current = 0;
					setShowInternalFooter(false);
					setShowScrollUpButton(false);
				},
			});
		} else {
			gsap.to(incrY, { current: 0, duration: 1.5, ease: 'none' });
			gsap.to(window, {
				scrollTo: 0,
				duration: 1.5,
				ease: 'none',
				onComplete: () => {
					incrY.current = 0;
					setShowInternalFooter(false);
					setShowScrollUpButton(false);
				},
			});
		}
	}, [scrollTriggerInstanceRef, lerpStep]);

	const performPreload = useCallback((scrollDirection: 'left' | 'right') => {
		const dims = dimensionsRef.current;
		if (dims && dims.columnTotalWidth > 0) {
			const currentWrappedX = dims.wrapX(currentActualXRef.current);
			const currentApproxFirstVisibleColIndex = Math.floor(
				-currentWrappedX / dims.columnTotalWidth
			);
			const preloadColsCount =
				dims.viewportWidth <= MOBILE_BREAKPOINT_PX
					? PRELOAD_COLS_COUNT_MOBILE
					: PRELOAD_COLS_COUNT_DESKTOP;
			let firstColToPreload: number;
			if (scrollDirection === 'left') {
				firstColToPreload = currentApproxFirstVisibleColIndex - preloadColsCount;
			} else {
				const visibleColsApprox = Math.ceil(
					dims.viewportWidth / dims.columnTotalWidth
				);
				firstColToPreload =
					currentApproxFirstVisibleColIndex + visibleColsApprox;
			}
			for (let i = 0; i < preloadColsCount; i++) {
				const colIndexToPreload = firstColToPreload + i;
				const urlsToPreload = getColumnPreviewImageUrls(colIndexToPreload);
				urlsToPreload.forEach(preloadImage);
			}
		}
	}, []);

	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const contentWrapperElement = contentWrapperRef.current;
		if (!containerElement || !contentWrapperElement || isInitialized.current) {
			return;
		}

		gsapCtx.current = gsap.context(() => {
			let updateRotationsRequest: number | null = null;
			const updateRotations = () => {
				updateRotationsRequest = null;
				const currentMap = mediaAnimRefs.current;
				const dims = dimensionsRef.current;
				const wrapperElement = contentWrapperRef.current;
				if (
					currentMap.size === 0 ||
					isTouchDevice ||
					!dims ||
					!containerElement ||
					!wrapperElement ||
					isScrollingRef.current
				)
					return;

				const targetMouseX = mousePos.current.x;
				const targetMouseY = mousePos.current.y;
				const containerRect = containerElement.getBoundingClientRect();
				const wrapperCurrentX = gsap.getProperty(wrapperElement, 'x') as number;
				const wrapperCurrentY = gsap.getProperty(wrapperElement, 'y') as number;

				currentMap.forEach((refData) => {
					if (refData.element && refData.rotX && refData.rotY) {
						const itemBaseOffsetX =
							refData.visualColumnIndex * dims.columnTotalWidth +
							dims.wrapperPaddingLeft;
						const itemBaseOffsetY =
							refData.visualRowIndexInColumn * (dims.itemHeight + dims.rowGap) +
							dims.wrapperPaddingTop;
						const itemScreenX =
							containerRect.left + itemBaseOffsetX + wrapperCurrentX;
						const itemScreenY =
							containerRect.top + itemBaseOffsetY + wrapperCurrentY;

						if (
							itemScreenY + dims.itemHeight < 0 ||
							itemScreenY > window.innerHeight ||
							itemScreenX + dims.columnWidth < 0 ||
							itemScreenX > window.innerWidth
						) {
							return;
						}

						const midpointX = itemScreenX + dims.columnWidth / 2;
						const midpointY = itemScreenY + dims.itemHeight / 2;
						const rotX = (targetMouseY - midpointY) / ROTATION_SENSITIVITY;
						const rotY = (targetMouseX - midpointX) / ROTATION_SENSITIVITY;
						const clampedRotX = gsap.utils.clamp(
							-ROTATION_CLAMP,
							ROTATION_CLAMP,
							rotX
						);
						const clampedRotY = gsap.utils.clamp(
							-ROTATION_CLAMP,
							ROTATION_CLAMP,
							rotY
						);
						const finalRotX = clampedRotX * -1;
						const finalRotY = clampedRotY;
						const previousRotX = refData.lastRotX || 0;
						const previousRotY = refData.lastRotY || 0;

						if (
							Math.abs(finalRotX - previousRotX) > 0.01 ||
							Math.abs(finalRotY - previousRotY) > 0.01
						) {
							refData.rotX(finalRotX);
							refData.rotY(finalRotY);
							refData.lastRotX = finalRotX;
							refData.lastRotY = finalRotY;
						}
					}
				});
			};

			const requestRotationUpdate = () => {
				if (!updateRotationsRequest) {
					updateRotationsRequest = requestAnimationFrame(updateRotations);
				}
			};

			const handleMouseMove = (event: MouseEvent) => {
				if (isTouchDevice) return;
				mousePos.current = { x: event.clientX, y: event.clientY };
				requestRotationUpdate();
			};

			const handleScrollActivity = () => {
				if (!containerElement) return;
				if (!isTouchDevice && !isScrollingRef.current) {
					const bounds = containerElement.getBoundingClientRect();
					containerCenterRef.current = {
						x: bounds.left + bounds.width / 2,
						y: bounds.top + bounds.height / 2,
					};
				}
				if (!isScrollingRef.current) isScrollingRef.current = true;
				if (!isTouchDevice) requestRotationUpdate();
				if (scrollStopTimeoutRef.current)
					clearTimeout(scrollStopTimeoutRef.current);
				scrollStopTimeoutRef.current = window.setTimeout(() => {
					if (isScrollingRef.current) isScrollingRef.current = false;
					if (!isTouchDevice) requestRotationUpdate();
				}, 150);
			};

			if (!observerInstance.current) {
				observerInstance.current = Observer.create({
					target: containerElement,
					type: 'wheel,touch,pointer',
					preventDefault: true,
					tolerance: 5,
					dragMinimum: 3,
					onPress: () => {
						inertiaXTweenRef.current?.kill();
						inertiaYTweenRef.current?.kill();
						currentActualXRef.current = incrX.current;
						currentActualYRef.current = incrY.current;
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}
						didDragSincePressRef.current = false;
					},
					onChangeX: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;
						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;
						if (self.isDragging && Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;
						if (self.event.type === 'wheel' && Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;
						if (self.isDragging) didDragSincePressRef.current = true;
						const increment = self.deltaX * (self.event.type === 'wheel' || !self.isDragging ? 1 : 1.1);
						if (self.event.type === 'wheel') incrX.current -= increment;
						else incrX.current += increment;
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						if (self.deltaX < 0) throttledPreloadRef.current?.('right');
						else if (self.deltaX > 0) throttledPreloadRef.current?.('left');
					},
					onChangeY: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;
						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;
						if (self.isDragging && Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;
						if (self.isDragging) didDragSincePressRef.current = true;
						const increment = self.deltaY * (self.event.type === 'wheel' || !self.isDragging ? 1 : 1.1);
						if (self.event.type === 'wheel') incrY.current -= increment;
						else incrY.current += increment;
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						throttledCheckFooterVisibilityRef.current?.();
					},
					onDragEnd: (self) => {
						const dims = dimensionsRef.current;
						if (!dims || !contentWrapperElement || !isScrollLockedRef.current) return;
						isLerpingActiveRef.current = false;
						if (lerpLoopIdRef.current) {
							cancelAnimationFrame(lerpLoopIdRef.current);
							lerpLoopIdRef.current = null;
						}
						inertiaXTweenRef.current?.kill();
						inertiaYTweenRef.current?.kill();
						const inertiaProxy = { x: currentActualXRef.current, y: currentActualYRef.current };
						const inertiaPreloadDirection = self.velocityX < 0 ? 'right' : 'left';
						inertiaXTweenRef.current = gsap.to(inertiaProxy, {
							inertia: { x: { velocity: self.velocityX } },
							ease: 'none',
							onStart: () => {
								if (Math.abs(self.velocityX) > 50) throttledPreloadRef.current?.(inertiaPreloadDirection);
							},
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								incrX.current = inertiaProxy.x;
								currentActualXRef.current = inertiaProxy.x;
								gsap.set(contentWrapperElement, { x: dims.wrapX(currentActualXRef.current) });
								if (Math.abs(self.velocityX) > 50) throttledPreloadRef.current?.(inertiaPreloadDirection);
							},
							onComplete: () => {
								if (dims) {
									incrX.current = inertiaProxy.x;
									currentActualXRef.current = inertiaProxy.x;
								}
							},
						});
						inertiaYTweenRef.current = gsap.to(inertiaProxy, {
							inertia: { y: { velocity: self.velocityY } },
							ease: 'none',
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								incrY.current = inertiaProxy.y;
								currentActualYRef.current = inertiaProxy.y;
								gsap.set(contentWrapperElement, { y: dims.wrapY(currentActualYRef.current) });
								throttledCheckFooterVisibilityRef.current?.();
							},
							onComplete: () => {
								if (dims) {
									incrY.current = inertiaProxy.y;
									currentActualYRef.current = inertiaProxy.y;
								}
								throttledCheckFooterVisibilityRef.current?.();
							},
						});
					},
				});
				observerInstance.current.disable();
			}

			throttledPreloadRef.current = throttle(performPreload, PRELOAD_THROTTLE_MS, {
				leading: false,
				trailing: true,
			});
			throttledCheckFooterVisibilityRef.current = throttle(
				checkFooterVisibility,
				250,
				{ leading: false, trailing: true }
			);

			window.addEventListener('mousemove', handleMouseMove);
			const initialDims = calculateDimensions();

			if (initialDims) {
				dimensionsRef.current = initialDims;
				const initialRenderCols = calculateRenderCols(initialDims);
				if (renderColsCount !== initialRenderCols) setRenderColsCount(initialRenderCols);
				const visibleColsApprox = Math.ceil(initialDims.viewportWidth / initialDims.columnTotalWidth);
				const preloadBuffer = initialDims.viewportWidth <= MOBILE_BREAKPOINT_PX ? 8 : 5;
				for (let i = -preloadBuffer; i < visibleColsApprox + preloadBuffer; i++) {
					getColumnPreviewImageUrls(i).forEach(preloadImage);
				}
				incrX.current = 0;
				incrY.current = 0;
				currentActualXRef.current = 0;
				currentActualYRef.current = 0;
				gsap.set(contentWrapperElement, {
					x: initialDims.wrapX(currentActualXRef.current),
					y: 0,
				});
				isInitialized.current = true;
				setIsReadyForPinning(true);
				ScrollTrigger.refresh();
			} else {
				console.error('IFG: Failed to get initial dimensions. Component might not work.');
				setRenderColsCount(COLS);
			}

			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				if (updateRotationsRequest) cancelAnimationFrame(updateRotationsRequest);
				if (scrollStopTimeoutRef.current) clearTimeout(scrollStopTimeoutRef.current);
				if (lerpLoopIdRef.current) {
					cancelAnimationFrame(lerpLoopIdRef.current);
					lerpLoopIdRef.current = null;
				}
				isLerpingActiveRef.current = false;
			};
		}, containerRef);

		const currentMediaAnimRefs = mediaAnimRefs.current;

		return () => {
			throttledPreloadRef.current?.cancel();
			throttledCheckFooterVisibilityRef.current?.cancel();
			setIsGalleryPinned(false);
			gsapCtx.current?.revert();
			document.body.classList.remove('ifg-locked');
			currentMediaAnimRefs.clear();
			observerInstance.current = null;
			gsapCtx.current = null;
			throttledPreloadRef.current = null;
			throttledCheckFooterVisibilityRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false;
			isScrollLockedRef.current = false;
			if (lerpLoopIdRef.current) {
				cancelAnimationFrame(lerpLoopIdRef.current);
				lerpLoopIdRef.current = null;
			}
			isLerpingActiveRef.current = false;
			inertiaXTweenRef.current?.kill();
			inertiaYTweenRef.current?.kill();
		};
	}, [
		calculateDimensions,
		calculateRenderCols,
		checkFooterVisibility,
		handleResize,
		isTouchDevice,
		lerpStep,
		performPreload,
		renderColsCount,
		setScrollLocked,
		setIsGalleryPinned,
	]);

	const placeholderSrc = useMemo(() => {
		if (!selectedItem) return undefined;
		const key = `/assets/full/${selectedItem.id}.webp`;
		return lqipMap[key];
	}, [selectedItem]);

	return (
		<section
			className={`${styles.mwg_effect} ${isLockedState ? styles.isLocked : ''}`}
			ref={containerRef}
		>
			<canvas ref={canvasRef} className={styles.backgroundCanvas} />
			<div className={styles.contentWrapper} ref={contentWrapperRef}>
				{columnsToRender}
			</div>
			{selectedItem && (
				<ImageModal
					src={selectedItem.fullSrc}
					alt={selectedItem.alt}
					onClose={handleCloseModal}
					placeholderSrc={placeholderSrc}
				/>
			)}
			<ScrollUpButton
				isVisible={showScrollUpButton}
				onClick={handleScrollUpRequest}
			/>
			<InternalFooter isVisible={showInternalFooter} />
		</section>
	);
};

