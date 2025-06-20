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
import { useCanvasWorker } from './hooks/useCanvasWorker';
import { useGridDimensions } from './hooks/useGridDimensions';
import { useItemRotation } from './hooks/useItemRotation';
import { useLerpAnimation } from './hooks/useLerpAnimation';
import { useScrollHandling } from './hooks/useScrollHandling';
import { useScrollTriggerPinning } from './hooks/useScrollTriggerPinning';
import styles from './index.module.scss';
import { InternalFooter } from './InternalFooter';
import {
	COLS,
	GalleryItem,
	getColumnPreviewImageUrls,
	preloadImage,
} from './lib/galleryData';
import { GridDimensions, MediaAnimData } from './lib/types';

const lqipMap: Record<string, string> = lqipMapData;
gsap.registerPlugin(Observer, ScrollTrigger, InertiaPlugin);

const PRELOAD_THROTTLE_MS = 150;
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

	const mediaAnimRefs = useRef(new Map<string, MediaAnimData>());
	const isScrollingRef = useRef(false);
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

	const { startLerp, stopLerp } = useLerpAnimation({
		isInitializedRef: isInitialized,
		dimensionsRef,
		contentWrapperRef,
		incrX,
		incrY,
		currentActualXRef,
		currentActualYRef,
	});

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
				firstColToPreload =
					currentApproxFirstVisibleColIndex - preloadColsCount;
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

	const onScrollForPreload = useCallback(
		(direction: 'left' | 'right') => {
			throttledPreloadRef.current?.(direction);
		},
		[]
	);

	const onThrottledFooterCheck = useCallback(() => {
		throttledCheckFooterVisibilityRef.current?.();
	}, []);

	const { handleScrollActivity } = useItemRotation({
		containerRef,
		contentWrapperRef,
		dimensionsRef,
		mediaAnimRefs,
		isTouchDevice,
		isScrollingRef,
	});

	const observerInstanceRef = useScrollHandling({
		containerRef,
		contentWrapperRef,
		isScrollLockedRef,
		dimensionsRef,
		incrX,
		incrY,
		currentActualXRef,
		currentActualYRef,
		didDragSincePressRef,
		onScroll: onScrollForPreload,
		onScrollActivity: handleScrollActivity,
		checkFooterVisibility: onThrottledFooterCheck,
		onLerpStart: startLerp,
		onLerpStop: stopLerp,
	});

	const setScrollLocked = useCallback(
		(locked: boolean) => {
			if (isScrollLockedRef.current !== locked) {
				isScrollLockedRef.current = locked;
				setIsLockedState(locked);
				setIsGalleryPinned(locked);

				const observer = observerInstanceRef.current;
				if (containerRef.current) {
					containerRef.current.style.touchAction = locked ? 'none' : 'auto';
					if (locked) observer?.enable();
					else observer?.disable();
				} else {
					if (locked) observer?.enable();
					else observer?.disable();
				}
				document.body.classList.toggle('ifg-locked', locked);
			}
		},
		[setIsGalleryPinned, observerInstanceRef]
	);

	const scrollTriggerInstanceRef = useScrollTriggerPinning({
		containerRef,
		onToggle: setScrollLocked,
		isReady: isReadyForPinning,
	});

	const handleScrollUpRequest = useCallback(() => {
		startLerp();
		const scrollTriggerInstance = scrollTriggerInstanceRef.current;
		if (
			scrollTriggerInstance &&
			typeof scrollTriggerInstance.start === 'number'
		) {
			const galleryPinStartScrollY = scrollTriggerInstance.start;
			const twentyVhInPixels = window.innerHeight * 0.2;
			let targetScrollY = Math.max(
				0,
				galleryPinStartScrollY - twentyVhInPixels - 1
			);

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
	}, [scrollTriggerInstanceRef, startLerp]);

	useLayoutEffect(() => {
		const contentWrapperElement = contentWrapperRef.current;
		if (!contentWrapperElement || isInitialized.current) {
			return;
		}

		gsapCtx.current = gsap.context(() => {
			throttledPreloadRef.current = throttle(performPreload, PRELOAD_THROTTLE_MS, {
				leading: false,
				trailing: true,
			});
			throttledCheckFooterVisibilityRef.current = throttle(
				checkFooterVisibility,
				250,
				{ leading: false, trailing: true }
			);

			const initialDims = calculateDimensions();

			if (initialDims) {
				dimensionsRef.current = initialDims;
				const initialRenderCols = calculateRenderCols(initialDims);
				if (renderColsCount !== initialRenderCols)
					setRenderColsCount(initialRenderCols);
				const visibleColsApprox = Math.ceil(
					initialDims.viewportWidth / initialDims.columnTotalWidth
				);
				const preloadBuffer =
					initialDims.viewportWidth <= MOBILE_BREAKPOINT_PX ? 8 : 5;
				for (
					let i = -preloadBuffer;
					i < visibleColsApprox + preloadBuffer;
					i++
				) {
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
				console.error(
					'IFG: Failed to get initial dimensions. Component might not work.'
				);
				setRenderColsCount(COLS);
			}
		}, containerRef);

		const currentMediaAnimRefs = mediaAnimRefs.current;

		return () => {
			throttledPreloadRef.current?.cancel();
			throttledCheckFooterVisibilityRef.current?.cancel();
			setIsGalleryPinned(false);
			gsapCtx.current?.revert();
			document.body.classList.remove('ifg-locked');
			currentMediaAnimRefs.clear();
			gsapCtx.current = null;
			throttledPreloadRef.current = null;
			throttledCheckFooterVisibilityRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false;
			isScrollLockedRef.current = false;
		};
	}, [
		calculateDimensions,
		calculateRenderCols,
		checkFooterVisibility,
		handleResize,
		isTouchDevice,
		performPreload,
		renderColsCount,
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

