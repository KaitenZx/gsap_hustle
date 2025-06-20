import React, { useRef, useLayoutEffect, useState, useCallback, useMemo, useEffect } from 'react';

import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { debounce, throttle } from 'lodash';




// <<< Import SVG Icons as React Components >>>
import EmailIcon from '../../assets/icons/email_icon.svg?react';
import InstagramIcon from '../../assets/icons/instagramm_icon.svg?react'; // Note: "instagramm" in filename
import RedditIcon from '../../assets/icons/reddit_icon.svg?react';
import TheHugIcon from '../../assets/icons/thehug_icon.svg?react';
import TwitterIcon from '../../assets/icons/twitter_icon.svg?react';
import { usePinState } from '../../context/PinStateContext'; // <<< ADDED
import lqipMapData from '../../lqip-map.json';
import { ImageModal } from '../ImageModal';
import { ScrollUpButton } from '../ScrollUpButton';

import { ITEMS, GalleryItem, ROWS, COLS, preloadImage, getColumnPreviewImageUrls } from './galleryData';
import styles from './index.module.scss';

// <<< Явно типизируем карту >>>
const lqipMap: Record<string, string> = lqipMapData;

gsap.registerPlugin(Observer, ScrollTrigger, InertiaPlugin);
// --- Константы ---
const DEBOUNCE_RESIZE_MS = 150; // Задержка debounce для ресайза
const RENDER_COLS_BUFFER = 4; // Дополнительные колонки для рендеринга (запас)
const RENDER_ROWS_BUFFER = 4; // Сколько доп. строк рендерить снизу
const PRELOAD_THROTTLE_MS = 100; // Задержка throttle для предзагрузки
const ROTATION_CLAMP = 18; // <<< Уменьшили максимальный угол поворота
const ROTATION_SENSITIVITY = 18; // <<< Чувствительность поворота (делитель)
const LERP_FACTOR = 0.7; // <<< Увеличено для более отзывчивого скролла

// --- Footer Visibility Constants ---
const DESKTOP_FOOTER_THRESHOLD = -3000; // Pixels scrolled down on desktop
const MOBILE_FOOTER_THRESHOLD = -1500;  // A smaller scroll distance for mobile devices
const FOOTER_HYSTERESIS = 500;         // Pixels to scroll back up before hiding
const MOBILE_BREAKPOINT_PX = 768;      // Matches SCSS breakpoint for mobile

// --- Preloading constants ---
const PRELOAD_COLS_COUNT_DESKTOP = 8;
const PRELOAD_COLS_COUNT_MOBILE = 12; // Preload more columns on mobile for fast flicks

// --- Function for preloading ONE FULL-SIZE IMAGE ---
const _preloadedFullUrls = new Set<string>();
const preloadFullImage = (url: string) => {
	if (!_preloadedFullUrls.has(url)) {
		_preloadedFullUrls.add(url);
		const img = new Image();
		img.src = url;
	}
};

// --- Тип для хранения рассчитанных размеров  ---
type GridDimensions = {
	viewportWidth: number;
	viewportHeight: number;
	columnWidth: number;
	columnGap: number;
	columnTotalWidth: number; // Ширина колонки + gap
	itemHeight: number;
	rowGap: number;
	totalContentLogicalWidth: number; // Ширина COLS колонок + gap'ы
	totalContentHeight: number;       // Высота ROWS строк + gap'ы (без padding wrapper'а)
	fullWrapperHeight: number;        // Полная высота контента с padding'ами wrapper'а
	repeatingWidth: number;           // Ширина для горизонтального wrap
	repeatingHeight: number;          // Высота для вертикального wrap
	wrapX: (value: number) => number; // Функция Wrap для горизонтали
	wrapY: (value: number) => number; // Функция Wrap для вертикали
	wrapperPaddingTop: number;        // <<< ADDED: Top padding of the content wrapper
	wrapperPaddingLeft: number;       // <<< ADDED: Left padding of the content wrapper
}

type MediaAnimData = {
	element: HTMLDivElement | null;
	rotX: ReturnType<typeof gsap.quickTo> | null;
	rotY: ReturnType<typeof gsap.quickTo> | null;
	visualColumnIndex: number;        // <<< ADDED: Visual index of the column
	visualRowIndexInColumn: number;   // <<< ADDED: Visual index of the item within its column
	lastRotX?: number;                // <<< ADDED: Last applied rotationX
	lastRotY?: number;                // <<< ADDED: Last applied rotationY
};

const getIsTouchDevice = () => {
	if (typeof window === 'undefined') return false;
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// <<< ADDED: A robust image component to handle cached images correctly >>>
const FadingImage = ({ src, alt }: { src: string; alt: string }) => {
	const imgRef = useRef<HTMLImageElement>(null);

	// Use useLayoutEffect to handle cached images, which might be 'complete'
	// before a useEffect callback would run.
	useLayoutEffect(() => {
		const imgNode = imgRef.current;
		if (!imgNode) return;

		const handleLoad = () => {
			// Check if node still exists before adding the class
			if (imgRef.current) {
				imgRef.current.classList.add(styles.imageLoaded);
			}
		};

		// If the browser has already finished loading the image (e.g., from cache),
		// the 'load' event might have already fired. The 'complete' property
		// will be true in this case.
		if (imgNode.complete) {
			handleLoad();
		} else {
			// Otherwise, add the event listener as usual.
			imgNode.addEventListener('load', handleLoad);
		}

		// Cleanup: remove the event listener when the component unmounts or src changes.
		return () => {
			if (imgNode) {
				imgNode.removeEventListener('load', handleLoad);
			}
		};
	}, [src]); // Re-run this effect if the image src changes.

	return (
		<img
			ref={imgRef}
			src={src}
			alt={alt}
			decoding="async"
			style={{ pointerEvents: 'none' }}
		/>
	);
};

// --- Компонент ---
export const InfiniteGallery: React.FC = () => {
	// --- Refs для DOM элементов ---
	const containerRef = useRef<HTMLDivElement>(null);      // Внешний контейнер (.mwg_effect)
	const contentWrapperRef = useRef<HTMLDivElement>(null); // Двигающийся контейнер (.contentWrapper)
	const columnRef = useRef<HTMLDivElement>(null);         // Реф для измерения ОДНОЙ колонки
	const itemRef = useRef<HTMLDivElement>(null);           // Реф для измерения ОДНОГО элемента (.media)
	const canvasRef = useRef<HTMLCanvasElement>(null);        // Реф для холста анимации
	const canvasWorkerRef = useRef<Worker | null>(null); // <<< ADDED: Ref for Canvas Web Worker

	// --- Refs для GSAP и других инстансов ---
	const gsapCtx = useRef<gsap.Context | null>(null);             // Контекст GSAP для очистки
	const observerInstance = useRef<Observer | null>(null);        // Инстанс Observer
	const resizeObserverRef = useRef<ResizeObserver | null>(null); // Инстанс ResizeObserver
	const scrollTriggerInstance = useRef<ScrollTrigger | null>(null); // Инстанс ScrollTrigger
	const inertiaXTweenRef = useRef<gsap.core.Tween | null>(null); // <<< ADDED: Ref for X inertia tween
	const inertiaYTweenRef = useRef<gsap.core.Tween | null>(null); // <<< ADDED: Ref for Y inertia tween

	// --- Refs для анимации и состояния ---
	const incrX = useRef(0); // Накопленное смещение X
	const incrY = useRef(0); // Накопленное смещение Y
	// Ref для throttled-функции предзагрузки
	const throttledPreloadRef = useRef<ReturnType<typeof throttle> | null>(null);

	// <<< ADDED: Ref for throttled footer visibility check >>>
	const throttledCheckFooterVisibilityRef = useRef<ReturnType<typeof throttle> | null>(null);

	const dimensionsRef = useRef<GridDimensions | null>(null); // Хранение рассчитанных размеров
	const isInitialized = useRef(false); // Флаг для однократной инициализации
	const didDragSincePressRef = useRef(false); //  Ref to track drag state for click handling

	// --- Refs для Lerping ---
	const currentActualXRef = useRef(0);
	const currentActualYRef = useRef(0);
	const lerpLoopIdRef = useRef<number | null>(null);
	const isLerpingActiveRef = useRef(false);

	// --- Refs для эффекта вращения ---
	const mediaAnimRefs = useRef(new Map<string, MediaAnimData>());
	const mousePos = useRef({ x: 0, y: 0 });
	const isScrollingRef = useRef(false);
	const containerCenterRef = useRef({ x: 0, y: 0 });
	// <<< Используем number для ID таймаута >>>
	const scrollStopTimeoutRef = useRef<number | null>(null);


	const isTouchDevice = useMemo(() => getIsTouchDevice(), []);

	// --- Состояние для блокировки скролла --- 
	const isScrollLockedRef = useRef(false); // Ref для мгновенного доступа из GSAP
	const [isLockedState, setIsLockedState] = useState(false); // State для ререндера/CSS

	// --- Состояние для количества рендерящихся колонок ---
	const [renderColsCount, setRenderColsCount] = useState(COLS); // Начинаем с COLS, будет пересчитано

	const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null); // <<< Новое состояние

	// --- Состояние и Ref для внутреннего футера ---
	const [showInternalFooter, setShowInternalFooter] = useState(false);
	const internalFooterRef = useRef<HTMLDivElement>(null);
	const showInternalFooterRef = useRef(showInternalFooter); // Ref to mirror state for stable callback
	const [showScrollUpButton, setShowScrollUpButton] = useState(false); // <<< ADDED for ScrollUpButton

	const { setIsGalleryPinned } = usePinState(); // <<< ADDED

	// Update ref whenever state changes
	useEffect(() => {
		showInternalFooterRef.current = showInternalFooter;
	}, [showInternalFooter]);

	const lerpStep = useCallback(() => {
		if (!isInitialized.current || !dimensionsRef.current || !contentWrapperRef.current) {
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

		let newActualX = currentActualXRef.current + (targetX - currentActualXRef.current) * LERP_FACTOR;
		let newActualY = currentActualYRef.current + (targetY - currentActualYRef.current) * LERP_FACTOR;

		const deltaThreshold = 0.01;

		if (Math.abs(targetX - newActualX) < deltaThreshold) {
			newActualX = targetX;
		}
		if (Math.abs(targetY - newActualY) < deltaThreshold) {
			newActualY = targetY;
		}

		if (currentActualXRef.current !== newActualX || currentActualYRef.current !== newActualY) {
			currentActualXRef.current = newActualX;
			currentActualYRef.current = newActualY;

			gsap.set(contentWrapperRef.current, {
				x: dims.wrapX(currentActualXRef.current),
				y: dims.wrapY(currentActualYRef.current),
			});
		}

		if (isLerpingActiveRef.current) {
			if (currentActualXRef.current !== targetX || currentActualYRef.current !== targetY) {
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

	// --- Функция для проверки видимости внутреннего футера ---
	const checkFooterVisibility = useCallback(() => {
		const yScrolled = incrY.current;
		const dims = dimensionsRef.current;

		// Use different thresholds for mobile and desktop, based on viewport width
		const threshold =
			dims && dims.viewportWidth <= MOBILE_BREAKPOINT_PX
				? MOBILE_FOOTER_THRESHOLD
				: DESKTOP_FOOTER_THRESHOLD;

		if (!showInternalFooterRef.current && yScrolled < threshold) {
			setShowInternalFooter(true);
			setShowScrollUpButton(true);
		} else if (showInternalFooterRef.current && yScrolled > threshold + FOOTER_HYSTERESIS) {
			setShowInternalFooter(false);
			setShowScrollUpButton(false);
		}
	}, []);
	const handleScrollUpRequest = useCallback(() => {
		isLerpingActiveRef.current = true;
		if (!lerpLoopIdRef.current) {
			lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
		}

		if (scrollTriggerInstance.current && typeof scrollTriggerInstance.current.start === 'number') {
			const galleryPinStartScrollY = scrollTriggerInstance.current.start;
			const twentyVhInPixels = window.innerHeight * 0.2;


			let targetScrollY = galleryPinStartScrollY - twentyVhInPixels - 1;
			targetScrollY = Math.max(0, targetScrollY); // Ensure not scrolling to a negative value

			gsap.to(incrY, {
				current: 0,
				duration: 1.5,
				ease: 'none'
			});

			gsap.to(window, {
				scrollTo: targetScrollY,
				duration: 1.5,
				ease: 'none',
				onComplete: () => {
					incrY.current = 0;

					setShowInternalFooter(false);
					setShowScrollUpButton(false);
				}
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
				}
			});
		}
	}, [setShowInternalFooter, setShowScrollUpButton, lerpStep]);

	// --- Функция для предзагрузки ПРЕВЬЮ  ---
	const performPreload = useCallback((scrollDirection: 'left' | 'right') => {
		const dims = dimensionsRef.current;
		if (dims && dims.columnTotalWidth > 0) {
			const currentWrappedX = dims.wrapX(currentActualXRef.current);
			const currentApproxFirstVisibleColIndex = Math.floor(-currentWrappedX / dims.columnTotalWidth);
			const preloadColsCount = dims.viewportWidth <= MOBILE_BREAKPOINT_PX ? PRELOAD_COLS_COUNT_MOBILE : PRELOAD_COLS_COUNT_DESKTOP;
			let firstColToPreload: number;

			if (scrollDirection === 'left') {
				// User scrolls left, content moves right, revealing columns with smaller indices (to the left).
				firstColToPreload = currentApproxFirstVisibleColIndex - preloadColsCount;
			} else { // 'right'
				// User scrolls right, content moves left, revealing columns with larger indices (to the right).
				const visibleColsApprox = Math.ceil(dims.viewportWidth / dims.columnTotalWidth);
				firstColToPreload = currentApproxFirstVisibleColIndex + visibleColsApprox;
			}

			for (let i = 0; i < preloadColsCount; i++) {
				const colIndexToPreload = firstColToPreload + i;
				// Получаем URL превью для предзагрузки
				const urlsToPreload = getColumnPreviewImageUrls(colIndexToPreload);
				urlsToPreload.forEach(preloadImage); // preloadImage теперь предзагружает превью
			}
		}
	}, []);

	// --- Функция для управления блокировкой скролла ---
	const setScrollLocked = useCallback((locked: boolean) => {
		if (isScrollLockedRef.current !== locked) {
			isScrollLockedRef.current = locked;
			setIsLockedState(locked); // Обновляем state для CSS
			setIsGalleryPinned(locked); // <<< ADDED: Update context state

			if (containerRef.current) {
				if (locked) {
					containerRef.current.style.touchAction = 'none';
					observerInstance.current?.enable();
				} else {
					containerRef.current.style.touchAction = 'auto';
					observerInstance.current?.disable();
				}
			} else {
				// Fallback if containerRef is not yet available (should be rare in this flow)
				if (locked) {
					observerInstance.current?.enable();
				} else {
					observerInstance.current?.disable();
				}
			}
			document.body.classList.toggle('ifg-locked', locked);
		}
	}, [setIsGalleryPinned]); // <<< ADDED setIsGalleryPinned dependency

	const handleImageClick = useCallback((item: GalleryItem) => { // <<< Принимаем весь объект
		if (!didDragSincePressRef.current) { // <<< ADDED: Check if dragging occurred
			setSelectedItem(item); // <<< Сохраняем весь объект
		}
	}, []);

	// --- Функция закрытия модального окна  ---
	const handleCloseModal = useCallback(() => {
		setSelectedItem(null); // <<< Сбрасываем объект
	}, []);

	// ---  Функция для начала предзагрузки при взаимодействии ---
	const handleInteractionStart = useCallback((fullSrc: string) => {
		preloadFullImage(fullSrc);
	}, []);

	// --- Функция рендеринга одной колонки  ---
	const renderColumn = useCallback((columnIndex: number) => {
		const isFirstColumn = columnIndex === 0;
		const itemsInColumn = [];
		// Обертка индекса колонки для данных
		const logicalColIndex = columnIndex % COLS;
		const baseItemIndex = logicalColIndex * ROWS;

		// <<< Рендерим ROWS + RENDER_ROWS_BUFFER строк >>>
		for (let renderRowIndex = 0; renderRowIndex < ROWS + RENDER_ROWS_BUFFER; renderRowIndex++) {
			// <<< Вычисляем логический индекс строки для данных >>>
			const logicalRowIndex = renderRowIndex % ROWS;
			// <<< Вычисляем финальный индекс элемента в массиве ITEMS (с оберткой) >>>
			const itemIndex = (baseItemIndex + logicalRowIndex); // % TOTAL_ITEMS; - не нужен если ITEMS.length === TOTAL_ITEMS

			if (itemIndex < ITEMS.length && itemIndex >= 0) {
				const item: GalleryItem = ITEMS[itemIndex];
				// Привязываем ref только к самому первому элементу (0, 0)
				const isFirstLogicalItem = renderRowIndex === 0;
				// Уникальный ключ для React, учитывая renderRowIndex
				const itemKey = `${columnIndex}-${item.id}-${renderRowIndex}`;
				// <<< ADDED: Get LQIP Source >>>
				const lqipKey = `/assets/full/${item.id}.webp`;
				const lqipSrc = lqipMap[lqipKey];


				itemsInColumn.push(
					<div
						data-interactive-cursor="true"
						className={styles.media}
						key={itemKey}
						ref={(el: HTMLDivElement | null) => {
							// Assign itemRef conditionally to the first item of the first column
							if (isFirstColumn && isFirstLogicalItem) {
								itemRef.current = el;
							}

							// Управление refs для анимации вращения (без изменений)
							const currentMap = mediaAnimRefs.current;
							const existingEntry = currentMap.get(itemKey); // Используем уникальный ключ

							if (el) {
								if (!existingEntry || existingEntry.element !== el) {
									const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: "power3.out" });
									const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: "power3.out" });
									currentMap.set(itemKey, { element: el, rotX, rotY, visualColumnIndex: columnIndex, visualRowIndexInColumn: renderRowIndex });
								} else if (existingEntry && !existingEntry.rotX) {
									const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: "power3.out" });
									const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: "power3.out" });
									currentMap.set(itemKey, { ...existingEntry, rotX, rotY, visualColumnIndex: columnIndex, visualRowIndexInColumn: renderRowIndex });
								}
							} else {
								if (existingEntry) {
									currentMap.delete(itemKey);
								}
							}
						}}
						role="button"
						tabIndex={0}
						onClick={() => handleImageClick(item)}
						onMouseDown={() => handleInteractionStart(item.fullSrc)}
						onTouchStart={() => handleInteractionStart(item.fullSrc)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								handleInteractionStart(item.fullSrc);
								handleImageClick(item);
							}
						}}
						style={{
							backgroundImage: lqipSrc ? `url(${lqipSrc})` : 'none',
							cursor: 'pointer',
							pointerEvents: 'auto'
						}}
					>
						<FadingImage src={item.previewSrc} alt={item.alt} />
					</div>
				);
			} else {
				console.warn(`[IFG] renderColumn: Invalid itemIndex ${itemIndex} for column ${columnIndex}, row ${renderRowIndex}`);
			}
		}
		return (
			<div
				className={styles.column}
				key={`col-${columnIndex}`}
				ref={isFirstColumn ? columnRef : null}
				style={{ pointerEvents: 'none' }}
			>
				{itemsInColumn}
			</div>
		);
	}, [handleImageClick, handleInteractionStart]);

	// --- Основной useLayoutEffect  ---
	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const contentWrapperElement = contentWrapperRef.current;

		if (!containerElement || !contentWrapperElement || isInitialized.current) {
			return;
		}

		// --- Функция расчета размеров (ОБНОВЛЕНА) ---
		const calculateDimensions = (): GridDimensions | null => {
			const firstColumn = columnRef.current;
			const firstItemContainer = itemRef.current;
			const wrapperElement = contentWrapperRef.current;

			if (!firstColumn || !firstItemContainer || !wrapperElement || !containerElement) {
				console.warn("IFG: Refs not available for measurement yet.");
				return null;
			}
			const computedStyleColumn = window.getComputedStyle(firstColumn);
			const computedStyleWrapper = window.getComputedStyle(wrapperElement);
			const viewportWidth = containerElement.clientWidth;
			const viewportHeight = containerElement.clientHeight;
			const colRect = firstColumn.getBoundingClientRect();
			const itemContainerRect = firstItemContainer.getBoundingClientRect();
			const columnWidth = colRect.width;
			const itemHeight = itemContainerRect.height;
			const columnGap = parseFloat(computedStyleWrapper.columnGap) || 0;
			const rowGap = parseFloat(computedStyleColumn.rowGap) || 0;
			const wrapperPaddingTop = parseFloat(computedStyleWrapper.paddingTop) || 0;
			const wrapperPaddingBottom = parseFloat(computedStyleWrapper.paddingBottom) || 0;
			const wrapperPaddingLeft = parseFloat(computedStyleWrapper.paddingLeft) || 0;

			// Добавляем проверку на валидность размеров перед расчетами
			if (!viewportWidth || !viewportHeight || !columnWidth || !itemHeight || !Number.isFinite(columnWidth) || !Number.isFinite(itemHeight) || itemHeight <= 0) {
				console.error("IFG: Failed to get valid base dimensions.", { viewportWidth, viewportHeight, columnWidth, itemHeight });
				return null;
			}

			const columnTotalWidth = columnWidth + columnGap; // Ширина колонки + правый отступ
			const gridContentHeight = ROWS * itemHeight + Math.max(0, ROWS - 1) * rowGap;
			const fullWrapperHeight = gridContentHeight + wrapperPaddingTop + wrapperPaddingBottom;
			const totalContentLogicalWidth = COLS * columnWidth + Math.max(0, COLS - 1) * columnGap;
			const repeatingWidth = COLS * columnTotalWidth;
			const repeatingHeight = gridContentHeight; // Используем высоту контента без padding'ов wrapper'а

			// Проверка на columnTotalWidth > 0 перед использованием в wrap
			if (columnTotalWidth <= 0 || repeatingHeight <= 0 || !Number.isFinite(totalContentLogicalWidth) || !Number.isFinite(repeatingWidth) || !Number.isFinite(repeatingHeight)) {
				console.error("IFG: Invalid calculated widths/heights.", { columnTotalWidth, totalContentLogicalWidth, repeatingWidth, repeatingHeight });
				return null;
			}


			// ----- Используем repeatingWidth для wrapX -----
			const wrapX = gsap.utils.wrap(-repeatingWidth, 0);
			const wrapY = gsap.utils.wrap(-repeatingHeight, 0);


			const newDimensions: GridDimensions = {
				viewportWidth, viewportHeight, columnWidth, itemHeight, rowGap, columnGap,
				columnTotalWidth,
				totalContentLogicalWidth,
				totalContentHeight: gridContentHeight,
				fullWrapperHeight,
				repeatingWidth,
				repeatingHeight,
				wrapX,
				wrapY,
				wrapperPaddingTop,
				wrapperPaddingLeft
			};
			dimensionsRef.current = newDimensions;
			return newDimensions;
		};

		// --- Функция расчета необходимого количества колонок для рендера ---
		const calculateRenderCols = (dims: GridDimensions): number => {
			if (!dims || dims.columnTotalWidth <= 0) {
				console.warn("IFG: Cannot calculate render cols, invalid dimensions. Falling back to COLS.");
				return COLS;
			}
			// Формула: Логическая ширина + Ширина вьюпорта, делим на ширину колонки, округляем вверх + буфер
			const requiredCols = Math.ceil(
				(dims.totalContentLogicalWidth + dims.viewportWidth) / dims.columnTotalWidth
			);
			const count = requiredCols + RENDER_COLS_BUFFER;
			return count;
		};

		// Создаем GSAP контекст
		gsapCtx.current = gsap.context(() => {
			// --- <<< Объявляем обработчики и функции обновления ВНУТРИ контекста >>> ---
			let updateRotationsRequest: number | null = null;

			const updateRotations = () => {
				updateRotationsRequest = null; // Сбрасываем ID запроса
				const currentMap = mediaAnimRefs.current;
				const mapSize = currentMap.size;
				const dims = dimensionsRef.current;
				const containerElement = containerRef.current;
				const wrapperElement = contentWrapperRef.current;

				if (mapSize === 0 || isTouchDevice || !dims || !containerElement || !wrapperElement) return;

				if (isScrollingRef.current) {
					return;
				}

				const targetMouseX = mousePos.current.x;
				const targetMouseY = mousePos.current.y;

				// --- Get container and wrapper info ONCE ---
				const containerRect = containerElement.getBoundingClientRect();
				const wrapperCurrentX = gsap.getProperty(wrapperElement, "x") as number;
				const wrapperCurrentY = gsap.getProperty(wrapperElement, "y") as number;

				currentMap.forEach((refData, _key) => {
					if (refData.element && refData.rotX && refData.rotY) {
						const rotXQuickTo = refData.rotX;
						const rotYQuickTo = refData.rotY;

						// --- Calculate item's approximate screen position --- 
						const itemBaseOffsetX = (refData.visualColumnIndex * dims.columnTotalWidth) + dims.wrapperPaddingLeft;
						const itemBaseOffsetY = (refData.visualRowIndexInColumn * (dims.itemHeight + dims.rowGap)) + dims.wrapperPaddingTop;

						const itemScreenX = containerRect.left + itemBaseOffsetX + wrapperCurrentX;
						const itemScreenY = containerRect.top + itemBaseOffsetY + wrapperCurrentY;

						// Simple visibility check (can be refined)
						if (itemScreenY + dims.itemHeight < 0 || itemScreenY > window.innerHeight ||
							itemScreenX + dims.columnWidth < 0 || itemScreenX > window.innerWidth) {
							return;
						}

						const midpointX = itemScreenX + dims.columnWidth / 2;
						const midpointY = itemScreenY + dims.itemHeight / 2;

						const rotX = (targetMouseY - midpointY) / ROTATION_SENSITIVITY;
						const rotY = (targetMouseX - midpointX) / ROTATION_SENSITIVITY;
						const clampedRotX = gsap.utils.clamp(-ROTATION_CLAMP, ROTATION_CLAMP, rotX);
						const clampedRotY = gsap.utils.clamp(-ROTATION_CLAMP, ROTATION_CLAMP, rotY);

						const finalRotX = clampedRotX * -1;
						const finalRotY = clampedRotY;

						const previousRotX = refData.lastRotX || 0;
						const previousRotY = refData.lastRotY || 0;
						const threshold = 0.01; // Minimal change to trigger update

						if (Math.abs(finalRotX - previousRotX) > threshold || Math.abs(finalRotY - previousRotY) > threshold) {
							rotXQuickTo(finalRotX);
							rotYQuickTo(finalRotY);
							refData.lastRotX = finalRotX;
							refData.lastRotY = finalRotY;
						}
					}
				});
			};

			// <<< Вспомогательная функция для запуска обновления вращения >>>
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

			// <<< Выносим хелпер за пределы create >>>
			const handleScrollActivity = () => {
				if (!containerElement) return;
				if (!isTouchDevice && !isScrollingRef.current) {
					const bounds = containerElement.getBoundingClientRect();
					containerCenterRef.current = {
						x: bounds.left + bounds.width / 2,
						y: bounds.top + bounds.height / 2,
					};
				}
				if (!isScrollingRef.current) { // If it wasn't scrolling, but now it is
					isScrollingRef.current = true;
					if (canvasWorkerRef.current) {
						canvasWorkerRef.current.postMessage({ isScrolling: true, isTouchDevice: isTouchDevice });
					}
				}


				if (!isTouchDevice) {
					requestRotationUpdate();
				}

				if (scrollStopTimeoutRef.current) {
					clearTimeout(scrollStopTimeoutRef.current);
				}
				scrollStopTimeoutRef.current = window.setTimeout(() => {
					if (isScrollingRef.current) {
						isScrollingRef.current = false;
						if (canvasWorkerRef.current) {
							canvasWorkerRef.current.postMessage({ isScrolling: false, isTouchDevice: isTouchDevice });
						}
					}
					if (!isTouchDevice) {
						requestRotationUpdate();
					}
				}, 150);
			};

			// --- Инициализация Observer для СКРОЛЛА  ---
			if (!observerInstance.current) {
				observerInstance.current = Observer.create({
					target: containerElement,
					type: "wheel,touch,pointer",
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
						didDragSincePressRef.current = false; // <<< ADDED: Reset drag flag on new press
					},
					onChangeX: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;

						// Пропускаем, если мы не заблокированы/не инициализированы
						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;

						// Для DRAG: Пропускаем, если вертикальный скролл преобладает
						if (self.isDragging && Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;

						// <<< ADDED: For wheel events, only proceed if horizontal scroll is dominant
						if (self.event.type === 'wheel' && Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;

						if (self.isDragging) {
							didDragSincePressRef.current = true;
						}

						const baseMultiplier = (self.event.type === "wheel" || !self.isDragging) ? 1 : 1.1;
						const increment = self.deltaX * baseMultiplier;

						if (self.event.type === "wheel") {
							incrX.current -= increment;
						} else {
							incrX.current += increment;
						}

						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}


						// Determine preload direction based on content movement.
						// A negative deltaX from the user (swipe right-to-left) moves content left, revealing items on the right.
						if (self.deltaX < 0) {
							throttledPreloadRef.current?.('right');
						} else if (self.deltaX > 0) {
							throttledPreloadRef.current?.('left');
						}

					},
					onChangeY: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;

						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;
						if (self.isDragging && Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;

						if (self.isDragging) {
							didDragSincePressRef.current = true;
						}

						const baseMultiplier = (self.event.type === "wheel" || !self.isDragging) ? 1 : 1.1;
						const increment = self.deltaY * baseMultiplier;

						if (self.event.type === "wheel") {
							incrY.current -= increment;
						} else {
							incrY.current += increment;
						}

						// <<< LERPING: Activate and start loop if not already active >>>
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}

						// Check for footer visibility
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

						// <<< LERPING: Inertia proxy object initialized with current actual values >>>
						const inertiaProxy = { x: currentActualXRef.current, y: currentActualYRef.current };

						// Determine direction for preloading during inertia
						const inertiaPreloadDirection = self.velocityX < 0 ? 'right' : 'left';

						// Horizontal Inertia
						inertiaXTweenRef.current = gsap.to(inertiaProxy, {
							inertia: {
								x: { velocity: self.velocityX }
							},
							ease: "none",
							onStart: () => {
								// Trigger one preload at the start of inertia
								if (Math.abs(self.velocityX) > 50) {
									throttledPreloadRef.current?.(inertiaPreloadDirection);
								}
							},
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								incrX.current = inertiaProxy.x;
								currentActualXRef.current = inertiaProxy.x;
								gsap.set(contentWrapperElement, { x: dims.wrapX(currentActualXRef.current) });
								// <<< ADDED: Continuously preload during the inertia animation >>>
								if (Math.abs(self.velocityX) > 50) {
									throttledPreloadRef.current?.(inertiaPreloadDirection);
								}
							},
							onComplete: () => {
								if (dims) { // Ensure dims is still valid
									incrX.current = inertiaProxy.x;
									currentActualXRef.current = inertiaProxy.x;
								}
							}
						});

						// Vertical Inertia
						inertiaYTweenRef.current = gsap.to(inertiaProxy, {
							inertia: {
								y: { velocity: self.velocityY }
							},
							ease: "none",
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								incrY.current = inertiaProxy.y;
								currentActualYRef.current = inertiaProxy.y;
								gsap.set(contentWrapperElement, { y: dims.wrapY(currentActualYRef.current) });
								throttledCheckFooterVisibilityRef.current?.();
							},
							onComplete: () => {
								if (dims) { // Ensure dims is still valid
									incrY.current = inertiaProxy.y;
									currentActualYRef.current = inertiaProxy.y;
								}
								throttledCheckFooterVisibilityRef.current?.();
							}
						});
					}
				});
				observerInstance.current.disable(); // Начинаем в выключенном состоянии
			}

			// --- Создание throttled-функции для ПРЕДЗАГРУЗКИ ---
			throttledPreloadRef.current = throttle(performPreload, PRELOAD_THROTTLE_MS, { leading: false, trailing: true });

			const FOOTER_VISIBILITY_THROTTLE_MS = 250;
			throttledCheckFooterVisibilityRef.current = throttle(checkFooterVisibility, FOOTER_VISIBILITY_THROTTLE_MS, { leading: false, trailing: true });

			// --- Добавляем слушатель движения мыши ---
			window.addEventListener('mousemove', handleMouseMove);

			// --- Инициализация ScrollTrigger (ОБНОВЛЕНО) ---
			if (!scrollTriggerInstance.current) {
				scrollTriggerInstance.current = ScrollTrigger.create({
					trigger: containerElement,
					start: "top top",
					end: "+=30000", // Используем ОЧЕНЬ большое значение для "бесконечного" пиннинга вниз
					pin: true,
					pinSpacing: true,
					anticipatePin: 0,
					invalidateOnRefresh: true, // Пересчитывать при рефреше

					onToggle: (self) => {
						setScrollLocked(self.isActive); // Просто включаем/выключаем Observer
					},
				});
			}

			// --- Инициализация ResizeObserver ---
			const debouncedResizeHandler = debounce(() => {
				// 1. Пересчитываем базовые размеры
				const newDims = calculateDimensions();

				// Добавляем проверку contentWrapperElement для безопасности
				if (newDims && gsapCtx.current && contentWrapperElement) {
					// 2. Пересчитываем количество колонок на основе новых размеров
					const newRenderCols = calculateRenderCols(newDims);

					inertiaXTweenRef.current?.kill();
					inertiaYTweenRef.current?.kill();

					// 3. Обновляем GSAP и позицию ВНУТРИ контекста
					gsapCtx.current.add(() => {
						incrX.current = 0;
						currentActualXRef.current = 0; // <<< LERPING: Reset actual as well
						currentActualYRef.current = newDims.wrapY(currentActualYRef.current); // <<< LERPING: And wrap actual Y
						gsap.set(contentWrapperElement, {
							x: newDims.wrapX(currentActualXRef.current), // Use wrapped actual
							y: currentActualYRef.current // <<< FIX: Preserve Y position on resize
						});

						// <<< Сброс вращений при ресайзе (опционально) >>>
						mediaAnimRefs.current.forEach(refData => {
							refData.rotX?.(0);
							refData.rotY?.(0);
						});
					});

					// 4. Обновляем state количества колонок, ЕСЛИ изменилось
					if (newRenderCols !== renderColsCount) {
						mediaAnimRefs.current.clear();
						setRenderColsCount(newRenderCols);
					}
				}
				ScrollTrigger.refresh(); // Обновляем ScrollTrigger после всех изменений

			}, DEBOUNCE_RESIZE_MS);

			resizeObserverRef.current = new ResizeObserver(debouncedResizeHandler);
			resizeObserverRef.current.observe(containerElement); // Наблюдаем за ИЗМЕНЕНИЕМ РАЗМЕРА контейнера

			// --- Первоначальный расчет и настройка ---
			const initialDims = calculateDimensions();

			if (initialDims) {
				const initialRenderCols = calculateRenderCols(initialDims);
				setRenderColsCount(initialRenderCols);

				// <<< Проактивная предзагрузка начальных изображений >>>
				const visibleColsApprox = Math.ceil(initialDims.viewportWidth / initialDims.columnTotalWidth);
				const isMobile = initialDims.viewportWidth <= MOBILE_BREAKPOINT_PX;
				const preloadBuffer = isMobile ? 8 : 5; // Use a larger buffer for mobile

				for (let i = -preloadBuffer; i < visibleColsApprox + preloadBuffer; i++) {
					const urlsToPreload = getColumnPreviewImageUrls(i);
					urlsToPreload.forEach(preloadImage);
				}

				incrX.current = 0;
				incrY.current = 0;
				currentActualXRef.current = 0; // <<< LERPING: Initialize actual
				currentActualYRef.current = 0; // <<< LERPING: Initialize actual
				gsap.set(contentWrapperElement, {
					x: initialDims.wrapX(currentActualXRef.current), // Keep wrapX for horizontal start
					y: 0 // Directly set initial Y to 0 to prevent upward shift from wrapY(0)
				});
				isInitialized.current = true; // Ставим флаг, что инициализация прошла

				// 5. Обновляем ScrollTrigger ПОСЛЕ расчетов и рендеринга
				ScrollTrigger.refresh();

				// 6. Проверяем начальное состояние блокировки (асинхронно, после возможного обновления ST)
				setTimeout(() => {
					if (scrollTriggerInstance.current) {
						setScrollLocked(scrollTriggerInstance.current.isActive);
					}
				}, 0);

			} else {
				console.error("IFG: Failed to get initial dimensions. Component might not work.");
				setRenderColsCount(COLS);
			}

			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				if (updateRotationsRequest) {
					cancelAnimationFrame(updateRotationsRequest);
				}
				// <<< Очищаем таймаут остановки скролла >>>
				if (scrollStopTimeoutRef.current) {
					clearTimeout(scrollStopTimeoutRef.current);
				}
				// <<< LERPING: Clear lerp loop on GSAP context cleanup >>>
				if (lerpLoopIdRef.current) {
					cancelAnimationFrame(lerpLoopIdRef.current);
					lerpLoopIdRef.current = null;
				}
				isLerpingActiveRef.current = false;
			};

		}, containerRef);

		const currentMediaAnimRefs = mediaAnimRefs.current;

		// --- Функция очистки для useLayoutEffect (вне контекста GSAP) ---
		return () => {
			resizeObserverRef.current?.disconnect();
			throttledPreloadRef.current?.cancel();
			throttledCheckFooterVisibilityRef.current?.cancel();

			// Убиваем ScrollTrigger явно перед ревертом контекста
			scrollTriggerInstance.current?.kill();
			scrollTriggerInstance.current = null;
			setIsGalleryPinned(false);


			gsapCtx.current?.revert(); // Это должно убить Observer и quickTo, созданные внутри контекста

			document.body.classList.remove('ifg-locked');
			currentMediaAnimRefs.clear();

			// Сброс рефов
			resizeObserverRef.current = null;
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
	}, [setScrollLocked, renderColsCount, performPreload, lerpStep, checkFooterVisibility, isTouchDevice, setIsGalleryPinned]);

	// --- Мемоизация массива колонок  ---
	const columnsToRender = useMemo(() => {
		// Очищаем refs перед рендером новых колонок, чтобы удалить старые записи
		mediaAnimRefs.current.clear();
		return Array.from({ length: renderColsCount }).map((_, index) =>
			renderColumn(index)
		);
	}, [renderColsCount, renderColumn]);

	// --- useEffect for Background Canvas Animation (REPLACED with Web Worker setup) ---
	useEffect(() => {
		const canvasElement = canvasRef.current;
		const containerElement = containerRef.current; // Used for initial dimensions

		if (!canvasElement || !containerElement || !window.Worker) {
			console.warn("InfiniteGallery: Canvas, container, or Worker not available.");
			return;
		}

		// Ensure worker is only created once or handled if HMR causes re-runs
		if (canvasWorkerRef.current) {
			canvasWorkerRef.current.terminate();
		}

		const worker = new Worker(new URL('./canvas.worker.ts', import.meta.url), { type: 'module' });
		canvasWorkerRef.current = worker;

		// Transfer OffscreenCanvas to the worker
		const offscreenCanvas = canvasElement.transferControlToOffscreen();
		worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);

		// Function to send updates to the worker
		const updateWorker = () => {
			if (!canvasWorkerRef.current || !containerElement) return;

			const rect = containerElement.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			let themeTextColor = '#808080'; // Default fallback
			if (typeof window !== 'undefined') {
				themeTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
			}

			canvasWorkerRef.current.postMessage({
				width: rect.width,
				height: rect.height,
				dpr: dpr,
				themeTextColor: themeTextColor,
				isScrolling: isScrollingRef.current, // Send current scroll state
				isTouchDevice: isTouchDevice // <<< ADDED: Send touch device status
			});
		};

		// Initial update
		updateWorker();

		// Observe container resize to update worker
		const resizeObserver = new ResizeObserver(updateWorker);
		resizeObserver.observe(containerElement);

		const sendScrollState = () => {
			if (canvasWorkerRef.current) {
				canvasWorkerRef.current.postMessage({ isScrolling: isScrollingRef.current, isTouchDevice: isTouchDevice });
			}
		};

		const throttledSendScrollState = throttle(sendScrollState, 100);


		return () => {
			resizeObserver.disconnect();
			if (canvasWorkerRef.current) {
				canvasWorkerRef.current.terminate();
				canvasWorkerRef.current = null;
			}
			throttledSendScrollState.cancel();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Run once on mount. Dependencies like isScrollingRef.current are handled via direct calls.

	// --- useEffect for Footer Animation ---
	useEffect(() => {
		if (internalFooterRef.current) {
			gsap.to(internalFooterRef.current, {
				opacity: showInternalFooter ? 1 : 0,
				visibility: showInternalFooter ? 'visible' : 'hidden',
				pointerEvents: showInternalFooter ? 'auto' : 'none',
				duration: 0.5,
				ease: 'power2.inOut'
			});
		}
	}, [showInternalFooter]);

	// --- Data for Footer Links ---
	const footerLinks = useMemo(() => [
		{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconComponent: InstagramIcon, ariaLabel: "Instagram" },
		{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconComponent: TwitterIcon, ariaLabel: "Twitter" },
		{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconComponent: RedditIcon, ariaLabel: "Reddit" },
		{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconComponent: TheHugIcon, ariaLabel: "TheHug" },
		{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconComponent: EmailIcon, ariaLabel: "Mail" }
	], []);

	// --- Memoize placeholder source for ImageModal (Readability) ---
	const placeholderSrc = useMemo(() => {
		if (!selectedItem) return undefined;
		const key = `/assets/full/${selectedItem.id}.webp`;
		// The `lqipMap[key]` will return undefined if the key doesn't exist,
		// so the `key in lqipMap` check is redundant.
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


			<ScrollUpButton isVisible={showScrollUpButton} onClick={handleScrollUpRequest} />

			{/* Внутренний футер галереи */}
			<div
				ref={internalFooterRef}
				className={styles.internalGalleryFooter}
				style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }} // Начальные стили для GSAP
			>
				{/* Updated Footer Content */}
				{footerLinks.map(link => (
					<div key={link.text} className={styles.footerLinkContainer}>
						<a data-interactive-cursor="true" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.ariaLabel}>
							<link.iconComponent className={styles.footerLinkIcon} />
							<span>{link.text}</span>
						</a>
					</div>
				))}
			</div>

		</section>
	);
};

