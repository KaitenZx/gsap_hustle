import React, { useRef, useLayoutEffect, useState, useCallback, useMemo, useEffect } from 'react';

import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { debounce, throttle } from 'lodash';


import lqipMapData from '../../lqip-map.json';
import { ImageModal } from '../ImageModal';

import { ITEMS, GalleryItem, ROWS, COLS } from './galleryData';
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
const LERP_FACTOR = 0.4; // <<< Коэффициент для лерпинга (0.0 - 1.0)

// --- Footer Visibility Constants ---
const INTERNAL_FOOTER_THRESHOLD = -4000; // Pixels scrolled down internally
const INTERNAL_FOOTER_HYSTERESIS = 500;  // Pixels to scroll back up before hiding

// --- Функция для предзагрузки одного ИЗОБРАЖЕНИЯ ПРЕВЬЮ ---
const _preloadedUrls = new Set<string>();
const preloadImage = (url: string) => {
	if (!_preloadedUrls.has(url)) {
		_preloadedUrls.add(url);
		const img = new Image();
		img.src = url;
	}
};

// --- Вспомогательная функция для получения URL ПРЕВЬЮ изображений колонки ---
const getColumnPreviewImageUrls = (columnIndex: number): string[] => {
	const urls: string[] = [];
	const wrappedIndex = (columnIndex % COLS + COLS) % COLS;
	const baseItemIndex = wrappedIndex * ROWS;
	for (let i = 0; i < ROWS; i++) {
		const itemIndex = baseItemIndex + i;
		if (itemIndex < ITEMS.length) {
			// Используем previewSrc
			urls.push(ITEMS[itemIndex].previewSrc);
		}
	}
	return urls;
};

// --- Function for preloading ONE FULL-SIZE IMAGE ---
const _preloadedFullUrls = new Set<string>();
const preloadFullImage = (url: string) => {
	if (!_preloadedFullUrls.has(url)) {
		_preloadedFullUrls.add(url);
		const img = new Image();
		img.src = url;
	}
};

// --- Тип для хранения рассчитанных размеров (ОБНОВЛЕНО) ---
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
}

// --- Тип для хранения данных анимации элемента ---
type MediaAnimData = {
	element: HTMLDivElement | null;
	rotX: ReturnType<typeof gsap.quickTo> | null;
	rotY: ReturnType<typeof gsap.quickTo> | null;
};

// --- Компонент ---
export const InfiniteGallery: React.FC = () => {
	// --- Refs для DOM элементов ---
	const containerRef = useRef<HTMLDivElement>(null);      // Внешний контейнер (.mwg_effect)
	const contentWrapperRef = useRef<HTMLDivElement>(null); // Двигающийся контейнер (.contentWrapper)
	const columnRef = useRef<HTMLDivElement>(null);         // Реф для измерения ОДНОЙ колонки
	const itemRef = useRef<HTMLDivElement>(null);           // Реф для измерения ОДНОГО элемента (.media)
	const canvasRef = useRef<HTMLCanvasElement>(null);        // Реф для холста анимации

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

	const dimensionsRef = useRef<GridDimensions | null>(null); // Хранение рассчитанных размеров
	const isInitialized = useRef(false); // Флаг для однократной инициализации

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

	// <<< Ref для ID анимации >>>
	const animationFrameIdRef = useRef<number | null>(null);

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

	// Update ref whenever state changes
	useEffect(() => {
		showInternalFooterRef.current = showInternalFooter;
	}, [showInternalFooter]);

	// --- Функция для проверки видимости внутреннего футера ---
	const checkFooterVisibility = useCallback(() => {
		const yScrolled = incrY.current;

		if (!showInternalFooterRef.current && yScrolled < INTERNAL_FOOTER_THRESHOLD) {
			setShowInternalFooter(true);
		} else if (showInternalFooterRef.current && yScrolled > INTERNAL_FOOTER_THRESHOLD + INTERNAL_FOOTER_HYSTERESIS) {
			setShowInternalFooter(false);
		}
	}, []); // INTERNAL_FOOTER_THRESHOLD and HYSTERESIS are constants, so no deps needed

	// --- Функция для предзагрузки ПРЕВЬЮ  ---
	const performPreload = useCallback((scrollDirection: 1 | -1) => {
		const dims = dimensionsRef.current;
		if (dims && dims.columnTotalWidth > 0) {
			// Используем currentActualXRef для более точного определения видимой колонки
			const currentWrappedX = dims.wrapX(currentActualXRef.current);
			const currentApproxFirstVisibleColIndex = Math.floor(-currentWrappedX / dims.columnTotalWidth);
			const preloadColsCount = 4;
			let firstColToPreload: number;

			if (scrollDirection === 1) {
				firstColToPreload = currentApproxFirstVisibleColIndex - preloadColsCount;
			} else {
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
	}, []); // Зависимости не изменились

	// --- Функция для управления блокировкой скролла ---
	const setScrollLocked = useCallback((locked: boolean) => {
		if (isScrollLockedRef.current !== locked) {
			isScrollLockedRef.current = locked;
			setIsLockedState(locked); // Обновляем state для CSS

			if (locked) {
				observerInstance.current?.enable();
			} else {
				observerInstance.current?.disable();
			}
			document.body.classList.toggle('ifg-locked', locked);
		}
	}, []); // Пустой массив зависимостей

	// --- НОВАЯ Функция обработчика клика по изображению  ---
	const handleImageClick = useCallback((item: GalleryItem) => { // <<< Принимаем весь объект
		setSelectedItem(item); // <<< Сохраняем весь объект
	}, []);

	// --- НОВАЯ Функция закрытия модального окна  ---
	const handleCloseModal = useCallback(() => {
		setSelectedItem(null); // <<< Сбрасываем объект
	}, []);

	// --- НОВАЯ Функция для начала предзагрузки при взаимодействии ---
	const handleInteractionStart = useCallback((fullSrc: string) => {
		preloadFullImage(fullSrc);
	}, []); // Empty dependencies, preloadFullImage is stable

	// --- Функция Lerp Step ---
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
	}, []); // LERP_FACTOR is a const, so no dependency needed

	// --- useEffect for Lerping Loop ---
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
	}, [lerpStep]); // Dependency on lerpStep

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

			// Проверка на случай, если ITEMS пустой или itemIndex некорректен (хотя не должно быть при правильном заполнении ITEMS)
			if (itemIndex < ITEMS.length && itemIndex >= 0) {
				const item: GalleryItem = ITEMS[itemIndex];
				// Привязываем ref только к самому первому элементу (0, 0)
				const isFirstLogicalItem = renderRowIndex === 0;
				// Уникальный ключ для React, учитывая renderRowIndex
				const itemKey = `${columnIndex}-${item.id}-${renderRowIndex}`;

				itemsInColumn.push(
					<div
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
									currentMap.set(itemKey, { element: el, rotX, rotY });
								} else if (existingEntry && !existingEntry.rotX) {
									const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: "power3.out" });
									const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: "power3.out" });
									currentMap.set(itemKey, { ...existingEntry, rotX, rotY });
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
						style={{ cursor: 'pointer', pointerEvents: 'auto' }}
					>
						<img
							src={item.previewSrc}
							alt={item.alt}
							loading="lazy"
							decoding="async"
							style={{ pointerEvents: 'none' }}
						/>
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
				repeatingWidth, // <<< Добавили
				repeatingHeight, // <<< Добавили
				wrapX,
				wrapY // <<< Добавили
			};
			dimensionsRef.current = newDimensions; // Сохраняем в ref
			return newDimensions;
		};

		// --- Функция расчета необходимого количества колонок для рендера ---
		const calculateRenderCols = (dims: GridDimensions): number => {
			if (!dims || dims.columnTotalWidth <= 0) {
				console.warn("IFG: Cannot calculate render cols, invalid dimensions. Falling back to COLS.");
				return COLS; // Возвращаем базовое число в случае ошибки
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
				if (mapSize === 0) return; // Exit if empty

				// <<< Определяем целевую точку (центр контейнера или курсор) >>>
				let targetX: number;
				let targetY: number;

				if (isScrollingRef.current) {
					targetX = containerCenterRef.current.x;
					targetY = containerCenterRef.current.y;
				} else {
					targetX = mousePos.current.x;
					targetY = mousePos.current.y;
				}
				// <<< Конец определения цели >>>

				currentMap.forEach((refData, _key) => {
					if (refData.element && refData.rotX && refData.rotY) {
						const el = refData.element;
						const rotXQuickTo = refData.rotX;
						const rotYQuickTo = refData.rotY;

						const bounds = el.getBoundingClientRect();
						if (bounds.top < window.innerHeight && bounds.bottom > 0 &&
							bounds.left < window.innerWidth && bounds.right > 0) {
							const midpointX = bounds.left + bounds.width / 2;
							const midpointY = bounds.top + bounds.height / 2;

							// <<< Используем targetX, targetY >>>
							const rotX = (targetY - midpointY) / ROTATION_SENSITIVITY;
							const rotY = (targetX - midpointX) / ROTATION_SENSITIVITY;
							const clampedRotX = gsap.utils.clamp(-ROTATION_CLAMP, ROTATION_CLAMP, rotX);
							const clampedRotY = gsap.utils.clamp(-ROTATION_CLAMP, ROTATION_CLAMP, rotY);

							rotXQuickTo(clampedRotX * -1);
							rotYQuickTo(clampedRotY);
						} else {
							// Optional reset logic here
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
				mousePos.current = { x: event.clientX, y: event.clientY };
				// <<< Используем вспомогательную функцию >>>
				requestRotationUpdate();
			};

			// <<< Выносим хелпер за пределы create >>>
			const handleScrollActivity = () => {
				if (!containerElement) return;
				if (!isScrollingRef.current) {
					const bounds = containerElement.getBoundingClientRect();
					containerCenterRef.current = {
						x: bounds.left + bounds.width / 2,
						y: bounds.top + bounds.height / 2,
					};
				}
				isScrollingRef.current = true;
				if (scrollStopTimeoutRef.current) {
					clearTimeout(scrollStopTimeoutRef.current);
				}
				requestRotationUpdate();
				scrollStopTimeoutRef.current = window.setTimeout(() => {
					isScrollingRef.current = false;
				}, 150);
			};

			// --- Инициализация Observer для СКРОЛЛА  ---
			if (!observerInstance.current) {
				observerInstance.current = Observer.create({
					target: containerElement,
					type: "wheel,touch,pointer",
					// preventDefault: ["wheel", "touch", "pointer"], // Reverted due to TS error, default is false
					tolerance: 5,
					dragMinimum: 3,
					// <<< ADDED: onPress to kill ongoing inertia >>>
					onPress: () => {
						inertiaXTweenRef.current?.kill();
						inertiaYTweenRef.current?.kill();
						// Also, when a new press happens, it means any "centering" for rotation should stop
						// and switch to mouse-following rotation if the gallery isn't actively scrolling via inertia/drag.
						// However, handleScrollActivity already manages isScrollingRef, which should be okay.

						// <<< LERPING: Activate lerping, ensure actuals match targets >>>
						currentActualXRef.current = incrX.current;
						currentActualYRef.current = incrY.current;
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}
					},
					onChangeX: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;

						// Пропускаем, если мы не заблокированы/не инициализированы
						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;

						// Для DRAG: Пропускаем, если вертикальный скролл преобладает
						if (self.isDragging && Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;


						// Предотвращаем стандартный горизонтальный скролл колесом, КОГДА ГАЛЕРЕЯ ЗАБЛОКИРОВАНА
						if (self.event.type === 'wheel' && isScrollLockedRef.current) {
							if (self.event.cancelable) { // <<< ADDED cancelable check
								self.event.preventDefault();
							}
						}

						const baseMultiplier = (self.event.type === "wheel" || !self.isDragging) ? 1 : 1.5;
						const increment = self.deltaX * baseMultiplier;

						// Применяем инкремент с правильным знаком
						// For wheel, positive deltaX usually means scrolling "right" (content moves left)
						// For touch, positive deltaX means finger moved right (content moves right)
						if (self.event.type === "wheel") {
							incrX.current -= increment;
						} else { // Touch/Pointer
							incrX.current += increment;
						}

						// <<< LERPING: Activate and start loop if not already active >>>
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}

						// Предзагрузка (направление зависит от того, как движется КОНТЕНТ)
						// Если incrX увеличивается, контент движется вправо (пользователь свайпнул вправо ИЛИ колесо "вниз/вправо")
						// Если incrX уменьшается, контент движется влево (пользователь свайпнул влево ИЛИ колесо "вверх/влево")
						// self.deltaX > 0: wheel down/right OR touch right.
						// For wheel (incrX -= increment): if self.deltaX > 0, increment > 0, incrX decreases (content moves left) -> preload right (dir -1)
						// For touch (incrX += increment): if self.deltaX > 0, increment > 0, incrX increases (content moves right) -> preload left (dir 1)

						let preloadDirection: 1 | -1 = 1;
						if (self.event.type === "wheel") {
							if (self.deltaX > 0) preloadDirection = -1; // Content moves left
							else if (self.deltaX < 0) preloadDirection = 1; // Content moves right
						} else { // Touch
							if (self.deltaX > 0) preloadDirection = 1; // Content moves right
							else if (self.deltaX < 0) preloadDirection = -1; // Content moves left
						}
						if (self.deltaX !== 0) { // Only preload if there's horizontal movement
							throttledPreloadRef.current?.(preloadDirection);
						}

						// Check for footer visibility
						checkFooterVisibility();
					},
					onChangeY: (self) => {
						handleScrollActivity();
						const dims = dimensionsRef.current;

						if (!isScrollLockedRef.current || !dims || !contentWrapperElement) return;
						// Для DRAG: Пропускаем, если горизонтальный скролл преобладает
						if (self.isDragging && Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;

						// Предотвращаем стандартное вертикальное поведение (скролл страницы)
						if (isScrollLockedRef.current) { // Applicable for both wheel and touch
							if (self.event.cancelable) { // <<< ADDED cancelable check
								self.event.preventDefault();
							}
						}

						const baseMultiplier = (self.event.type === "wheel" || !self.isDragging) ? 1 : 1.5;
						const increment = self.deltaY * baseMultiplier;

						if (self.event.type === "wheel") {
							incrY.current -= increment;
						} else { // Touch/Pointer
							incrY.current += increment;
						}

						// <<< LERPING: Activate and start loop if not already active >>>
						isLerpingActiveRef.current = true;
						if (!lerpLoopIdRef.current) {
							lerpLoopIdRef.current = requestAnimationFrame(lerpStep);
						}
						// No vertical preloading implemented in performPreload, so skipping here.

						// Check for footer visibility
						checkFooterVisibility();
					},
					// <<< ADDED: onDragEnd for Inertia >>>
					onDragEnd: (self) => {
						const dims = dimensionsRef.current;
						if (!dims || !contentWrapperElement || !isScrollLockedRef.current) return;

						// <<< LERPING: Deactivate manual lerping for inertia >>>
						isLerpingActiveRef.current = false;
						if (lerpLoopIdRef.current) {
							cancelAnimationFrame(lerpLoopIdRef.current);
							lerpLoopIdRef.current = null;
						}

						inertiaXTweenRef.current?.kill(); // Kill previous X tween just in case
						inertiaYTweenRef.current?.kill(); // Kill previous Y tween just in case

						// <<< LERPING: Inertia proxy object initialized with current actual values >>>
						const inertiaProxy = { x: currentActualXRef.current, y: currentActualYRef.current };


						// Horizontal Inertia
						inertiaXTweenRef.current = gsap.to(inertiaProxy, {
							inertia: {
								x: { velocity: self.velocityX }
							},
							// modifiers: { // <<< REMOVED: wrapping is done via onUpdate and currentActualXRef
							// 	x: gsap.utils.unitize(value => dims.wrapX(parseFloat(value as string)), "px")
							// },
							ease: "none",
							onStart: () => {
								// self.velocityX > 0: content is thrown to the right (user swiped right)
								//   => preload content that will appear on the left of viewport (dir 1 for performPreload)
								// self.velocityX < 0: content is thrown to the left (user swiped left)
								//   => preload content that will appear on the right of viewport (dir -1 for performPreload)
								if (self.velocityX > 50) throttledPreloadRef.current?.(1);
								else if (self.velocityX < -50) throttledPreloadRef.current?.(-1);
							},
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								// <<< LERPING: Update target and actual from proxy, then apply wrapped actual >>>
								incrX.current = inertiaProxy.x;
								currentActualXRef.current = inertiaProxy.x;
								gsap.set(contentWrapperElement, { x: dims.wrapX(currentActualXRef.current) });
								// NO checkFooterVisibility() here
							},
							onComplete: () => {
								if (dims) { // Ensure dims is still valid
									incrX.current = inertiaProxy.x;
									currentActualXRef.current = inertiaProxy.x;
								}
								// NO checkFooterVisibility() here
							}
						});

						// Vertical Inertia
						inertiaYTweenRef.current = gsap.to(inertiaProxy, {
							inertia: {
								y: { velocity: self.velocityY }
							},
							// modifiers: { // <<< REMOVED: wrapping is done via onUpdate and currentActualYRef
							// 	y: gsap.utils.unitize(value => dims.wrapY(parseFloat(value as string)), "px")
							// },
							ease: "none",
							onUpdate: function () {
								if (!dims || !contentWrapperElement) return;
								// <<< LERPING: Update target and actual from proxy, then apply wrapped actual >>>
								incrY.current = inertiaProxy.y;
								currentActualYRef.current = inertiaProxy.y;
								gsap.set(contentWrapperElement, { y: dims.wrapY(currentActualYRef.current) });
								// Check for footer visibility during vertical inertia update
								checkFooterVisibility();
							},
							onComplete: () => {
								if (dims) { // Ensure dims is still valid
									incrY.current = inertiaProxy.y;
									currentActualYRef.current = inertiaProxy.y;
								}
								// Check for footer visibility on vertical inertia complete
								checkFooterVisibility();
							}
						});
					}
				});
				observerInstance.current.disable(); // Начинаем в выключенном состоянии
			}

			// --- Создание throttled-функции для ПРЕДЗАГРУЗКИ ---
			throttledPreloadRef.current = throttle(performPreload, PRELOAD_THROTTLE_MS, { leading: false, trailing: true });

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
					// markers: true, // Показать маркеры для отладки
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

					// <<< ADDED: Kill inertia tweens on resize before position reset >>>
					inertiaXTweenRef.current?.kill();
					inertiaYTweenRef.current?.kill();

					// 3. Обновляем GSAP и позицию ВНУТРИ контекста
					gsapCtx.current.add(() => {
						// setupScrollQuickTo(newDims); // <<< REMOVED
						// Сбрасываем X, Y остается как есть (будет обернут wrapY)
						// Можно опционально сбросить X, но Y трогать не нужно, чтобы сохранить позицию в цикле
						incrX.current = 0;
						currentActualXRef.current = 0; // <<< LERPING: Reset actual as well
						// incrY.current = newDims.wrapY(incrY.current); // Можно явно обернуть текущее значение на всякий случай
						// currentActualYRef.current = newDims.wrapY(currentActualYRef.current); // <<< LERPING: And wrap actual Y
						gsap.set(contentWrapperElement, {
							x: newDims.wrapX(currentActualXRef.current), // Use wrapped actual
							y: 0 // Directly set initial Y to 0 to prevent upward shift from wrapY(0)
						});
						// Позицию Y не трогаем, quickTo ее держит (quickTo удален, но логика сохранения Y остается)

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
				// setupScrollQuickTo(initialDims); // <<< REMOVED
				// Устанавливаем начальные позиции в 0 (wrapX/wrapY их нормализуют если нужно)
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
					// Перепроверяем инстанс на случай быстрого размонтирования
					if (scrollTriggerInstance.current) {
						setScrollLocked(scrollTriggerInstance.current.isActive);
					}
				}, 0);

			} else {
				console.error("IFG: Failed to get initial dimensions. Component might not work.");
				// Устанавливаем какое-то дефолтное количество колонок, если расчет не удался
				setRenderColsCount(COLS);
			}

			// <<< FIX: Возвращаем функцию очистки из КОНТЕКСТА GSAP >>>
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

			// Убиваем ScrollTrigger явно перед ревертом контекста
			scrollTriggerInstance.current?.kill();
			scrollTriggerInstance.current = null;


			gsapCtx.current?.revert(); // Это должно убить Observer и quickTo, созданные внутри контекста

			document.body.classList.remove('ifg-locked');
			currentMediaAnimRefs.clear();

			// Сброс рефов
			resizeObserverRef.current = null;
			observerInstance.current = null; // Должен быть убит ревертом, но для надежности
			gsapCtx.current = null;
			// xToRef.current = null; // <<< REMOVED
			// yToRef.current = null; // <<< REMOVED
			throttledPreloadRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false;
			isScrollLockedRef.current = false;
			// <<< LERPING: Clear lerp loop on unmount (double check as it's also in GSAP context cleanup) >>>
			if (lerpLoopIdRef.current) {
				cancelAnimationFrame(lerpLoopIdRef.current);
				lerpLoopIdRef.current = null;
			}
			isLerpingActiveRef.current = false;


			// <<< ADDED: Kill inertia tweens on unmount >>>
			inertiaXTweenRef.current?.kill();
			inertiaYTweenRef.current?.kill();
		};
		// <<< Обновлены зависимости (убраны minY/maxY/scrollableDistanceY если они где-то были косвенно) >>>
	}, [setScrollLocked, renderColsCount, performPreload, lerpStep, checkFooterVisibility]); // ADDED checkFooterVisibility back

	// --- Мемоизация массива колонок  ---
	const columnsToRender = useMemo(() => {
		// Очищаем refs перед рендером новых колонок, чтобы удалить старые записи
		mediaAnimRefs.current.clear();
		return Array.from({ length: renderColsCount }).map((_, index) =>
			renderColumn(index)
		);
	}, [renderColsCount, renderColumn]);

	// --- useEffect for Background Canvas Animation ---
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current; // Use the main container for size
		if (!canvas || !container) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// --- Animation Settings (Adapt from provided code) ---
		const pattern = [
			' _&+glitchy+&_ ',
			'*.+pixels+#!      '
		];
		const fontColor = '#444'; // Single subtle color
		const weights = ['normal', 'bold']; // Use string values for ctx.font // Должно быть как минимум 2 значения для логики ниже
		const fontSize = 14; // Adjust as needed
		const lineHeight = 16; // Adjust as needed
		const timeFactor = 0.0005; // Slower time progression
		const xCoordFactor = 0.01; // Adjust pattern scaling
		const yCoordFactor = 0.01;
		const xyCoordFactor = 0.0008;
		const sinMultiplier = 20; // Adjust pattern intensity

		let cols = 0;
		let rows = 0;

		// --- Настройки для троттлинга анимации Canvas ---
		const TARGET_CANVAS_FPS = 15; // Целевой FPS для фона (например, 20-30)
		const frameInterval = 1000 / TARGET_CANVAS_FPS;
		let lastFrameTime = 0;
		// --- Конец настроек троттлинга ---

		const resizeCanvas = () => {
			const dpr = window.devicePixelRatio || 1;
			const rect = container.getBoundingClientRect(); // Use container size
			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;
			canvas.style.width = `${rect.width}px`;
			canvas.style.height = `${rect.height}px`;
			ctx.scale(dpr, dpr);

			cols = Math.floor(rect.width / (fontSize * 0.6)); // Estimate character cols
			rows = Math.floor(rect.height / lineHeight);     // Estimate character rows

			// Устанавливаем базовые стили текста один раз при ресайзе,
			// так как fontSize, textAlign, textBaseline не меняются в drawBackground
			// ctx.font = `${fontSize}px monospace`; // Убрано, т.к. вес меняется
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
		};

		const drawBackground = (time: number) => {
			if (!ctx || cols <= 0 || rows <= 0) return;

			const t = time * timeFactor;
			const cellWidth = (canvas.width / window.devicePixelRatio) / cols;
			const cellHeight = (canvas.height / window.devicePixelRatio) / rows;
			const centerCol = cols / 2;
			const centerRow = rows / 2;

			ctx.clearRect(0, 0, canvas.width, canvas.height); // Очищаем весь канвас
			ctx.fillStyle = fontColor;

			// ОПТИМИЗАЦИЯ: Устанавливаем ctx.font только два раза

			// Проход для первого стиля (weights[0])
			if (weights.length > 0) {
				ctx.font = `${weights[0]} ${fontSize}px 'Alpha Lyrae', monospace`;
				for (let y = 0; y < rows; y++) {
					for (let x = 0; x < cols; x++) {
						const c_index_for_style = (Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2;
						if (c_index_for_style === 0) { // Рендерим только символы этого стиля
							const relX = x - centerCol;
							const relY = y - centerRow;

							const o = Math.sin(relX * relY * xyCoordFactor + relY * yCoordFactor + t) * sinMultiplier;
							const i = Math.floor(Math.abs(relX * xCoordFactor + relY * yCoordFactor + o));

							// Используем pattern[0] если c_index_for_style также 0, или pattern[c_index_for_style]
							const currentPattern = pattern[c_index_for_style] || pattern[0] || '';
							const char = currentPattern[i % currentPattern.length] ?? ' ';

							const drawX = x * cellWidth + cellWidth / 2;
							const drawY = y * cellHeight + cellHeight / 2;
							ctx.fillText(char, drawX, drawY);
						}
					}
				}
			}

			// Проход для второго стиля (weights[1])
			if (weights.length > 1) {
				ctx.font = `${weights[1]} ${fontSize}px 'Alpha Lyrae', monospace`;
				for (let y = 0; y < rows; y++) {
					for (let x = 0; x < cols; x++) {
						const c_index_for_style = (Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2;
						if (c_index_for_style === 1) { // Рендерим только символы этого стиля
							const relX = x - centerCol;
							const relY = y - centerRow;

							const o = Math.sin(relX * relY * xyCoordFactor + relY * yCoordFactor + t) * sinMultiplier;
							const i = Math.floor(Math.abs(relX * xCoordFactor + relY * yCoordFactor + o));

							// Используем pattern[1] если c_index_for_style также 1, или pattern[c_index_for_style]
							const currentPattern = pattern[c_index_for_style] || pattern[1] || '';
							const char = currentPattern[i % currentPattern.length] ?? ' ';

							const drawX = x * cellWidth + cellWidth / 2;
							const drawY = y * cellHeight + cellHeight / 2;
							ctx.fillText(char, drawX, drawY);
						}
					}
				}
			}
		};

		const animate = (currentTime: number) => {
			animationFrameIdRef.current = requestAnimationFrame(animate); // Всегда запрашиваем следующий кадр rAF

			// ОПТИМИЗАЦИЯ: Троттлинг вызова drawBackground
			if (!lastFrameTime) { // Инициализация для первого кадра
				lastFrameTime = currentTime;
			}
			const elapsed = currentTime - lastFrameTime;

			if (elapsed > frameInterval) {
				lastFrameTime = currentTime - (elapsed % frameInterval); // Корректируем lastFrameTime
				drawBackground(currentTime); // Отрисовываем фон, только если прошло достаточно времени
			}
		};

		// Initial setup
		resizeCanvas();
		animationFrameIdRef.current = requestAnimationFrame(animate); // Запускаем цикл анимации

		// Handle resize
		const resizeObserver = new ResizeObserver(() => { // resizeCanvas уже содержит ctx.scale
			resizeCanvas();
		});
		resizeObserver.observe(container);

		// Cleanup
		return () => {
			resizeObserver.disconnect();
			if (animationFrameIdRef.current) {
				cancelAnimationFrame(animationFrameIdRef.current);
			}
		};
	}, []); // Empty dependency array: run only once on mount

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

	return (
		<section
			className={`${styles.mwg_effect} ${isLockedState ? styles.isLocked : ''}`}
			ref={containerRef}
		>
			{/* Canvas for background animation */}
			<canvas ref={canvasRef} className={styles.backgroundCanvas} />

			<div className={styles.contentWrapper} ref={contentWrapperRef}>
				{columnsToRender}
			</div>

			{selectedItem && (
				<ImageModal
					src={selectedItem.fullSrc}
					alt={selectedItem.alt}
					onClose={handleCloseModal}
					// Добавляем логгирование перед доступом к lqipMap
					placeholderSrc={(() => {
						if (!selectedItem) return undefined;
						const key = `/assets/full/${selectedItem.id}.webp`;
						// Добавим проверку наличия ключа
						return key in lqipMap ? lqipMap[key] : undefined;
					})()}
				/>
			)}

			{/* Внутренний футер галереи */}
			<div
				ref={internalFooterRef}
				className={styles.internalGalleryFooter}
				style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }} // Начальные стили для GSAP
			>
				placeholder footer: link link link
			</div>

		</section>
	);
};

