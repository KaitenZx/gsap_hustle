import React, { useRef, useLayoutEffect, useState, useCallback, useMemo, useEffect } from 'react';

import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { debounce, throttle } from 'lodash';


import lqipMapData from '../../lqip-map.json';
import { ImageModal } from '../ImageModal';

import styles from './index.module.scss';

// <<< Явно типизируем карту >>>
const lqipMap: Record<string, string> = lqipMapData;

gsap.registerPlugin(Observer, ScrollTrigger);
// --- Константы ---
const ROWS = 7; // Количество строк в логической сетке
const COLS = 28; // Количество КОЛОНОК в ЛОГИЧЕСКОЙ сетке (определяет wrap)
const TOTAL_ITEMS = ROWS * COLS;
const DEBOUNCE_RESIZE_MS = 150; // Задержка debounce для ресайза
const RENDER_COLS_BUFFER = 2; // Дополнительные колонки для рендеринга (запас)
const RENDER_ROWS_BUFFER = 4; // Сколько доп. строк рендерить снизу
const PRELOAD_THROTTLE_MS = 200; // Задержка throttle для предзагрузки
const ROTATION_CLAMP = 18; // <<< Уменьшили максимальный угол поворота
const ROTATION_SENSITIVITY = 18; // <<< Чувствительность поворота (делитель)
const ACCELERATION_FACTOR = 0.0002; // <<< Фактор ускорения скролла (чем больше, тем сильнее ускорение)
// Y_THRESHOLD больше не нужен для preventDefault
// const Y_THRESHOLD = 0.1;

// --- Типизация для импортированного модуля изображения ---
type ImageModule = {
	default: string;
}

// --- Загрузка И ПРЕВЬЮ, И ПОЛНЫХ изображений с помощью Vite Glob Import ---
const previewImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/preview/*.webp', { eager: true });
const fullImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/full/*.webp', { eager: true });

// --- Вспомогательная функция для извлечения ID и URL из пути ---
const extractImageData = (path: string, module: ImageModule | undefined): { id: number; url: string } | null => {
	// Используем регулярное выражение, которое найдет число перед .webp, игнорируя путь
	const match = /([\w-]+)\/(\d+)\.webp$/.exec(path); // Находит 'preview'/'full' и 'id'
	const id = match ? parseInt(match[2], 10) : -1;
	const url = module?.default;
	if (id !== -1 && typeof url === 'string') {
		return { id, url };
	}
	return null;
};

// --- Обработка и СОПОСТАВЛЕНИЕ URL превью и полных изображений ---
const previewImages = Object.entries(previewImageModules)
	.map(([path, module]) => extractImageData(path, module))
	.filter((item): item is { id: number; url: string } => item !== null);

const fullImageUrlsById: Map<number, string> = new Map<number, string>();
Object.entries(fullImageModules).forEach(([path, module]) => {
	const imageData = extractImageData(path, module);
	if (imageData) {
		fullImageUrlsById.set(imageData.id, imageData.url);
	}
});

// Сортируем превью по ID
previewImages.sort((a, b) => a.id - b.id);

// --- Обновленная типизация для элемента галереи ---
type GalleryItem = {
	id: number;
	previewSrc: string; // Превью
	fullSrc: string;    // Полная версия
	alt: string;
}

// --- Генерация данных ---
// Убедимся, что берем ровно TOTAL_ITEMS, если их достаточно
const sourceItems = previewImages
	.map((previewItem) => {
		const fullSrc = fullImageUrlsById.get(previewItem.id);
		return fullSrc ? {
			id: previewItem.id,
			previewSrc: previewItem.url,
			fullSrc: fullSrc,
			alt: `Gallery image ${previewItem.id}`
		} : null;
	})
	.filter((item): item is GalleryItem => item !== null);

// --- Заполняем массив ITEMS до TOTAL_ITEMS, повторяя элементы, если нужно ---
export const ITEMS: GalleryItem[] = [];
if (sourceItems.length > 0) {
	for (let i = 0; i < TOTAL_ITEMS; i++) {
		ITEMS.push(sourceItems[i % sourceItems.length]);
	}
	// Добавляем предупреждение, если исходных уникальных элементов меньше TOTAL_ITEMS
	if (sourceItems.length < TOTAL_ITEMS) {
		console.warn(`[InfiniteGallery] Warning: Only found ${sourceItems.length} unique valid image pairs, but TOTAL_ITEMS is ${TOTAL_ITEMS}. Repeating items to fill the grid.`);
	}
} else {
	console.error("[InfiniteGallery] Error: No valid image pairs found. Gallery will be empty.");
}

// Проверка, достаточно ли ПОЛНЫХ изображений найдено для каждого превью
if (ITEMS.length < previewImages.slice(0, TOTAL_ITEMS).length) {
	console.warn(`[InfiniteGallery] Warning: Some full-size images corresponding to preview images (up to ${TOTAL_ITEMS}) were not found in '/src/assets/full/'. Check filenames.`);
} else if (ITEMS.length < TOTAL_ITEMS) {
	// Предупреждение, если изначально не хватило превью
	console.warn(`[InfiniteGallery] Warning: Expected ${TOTAL_ITEMS} preview images, but only found ${previewImages.length} in '/src/assets/preview/'.`);
}

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

	// --- Refs для анимации и состояния ---
	const xToRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null); // quickTo для X
	const yToRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null); // quickTo для Y
	const incrX = useRef(0); // Накопленное смещение X
	const incrY = useRef(0); // Накопленное смещение Y
	// Ref для throttled-функции предзагрузки
	const throttledPreloadRef = useRef<ReturnType<typeof throttle> | null>(null);

	const dimensionsRef = useRef<GridDimensions | null>(null); // Хранение рассчитанных размеров
	const isInitialized = useRef(false); // Флаг для однократной инициализации

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

	// --- Функция для предзагрузки ПРЕВЬЮ  ---
	const performPreload = useCallback((scrollDirection: 1 | -1) => {
		const dims = dimensionsRef.current;
		if (dims && dims.columnTotalWidth > 0) {
			const currentWrappedX = dims.wrapX(incrX.current);
			const currentApproxFirstVisibleColIndex = Math.floor(-currentWrappedX / dims.columnTotalWidth);
			const preloadColsCount = 2;
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

	// --- НОВАЯ Функция обработчика клика по изображению (обновлена) ---
	const handleImageClick = useCallback((item: GalleryItem) => { // <<< Принимаем весь объект
		setSelectedItem(item); // <<< Сохраняем весь объект
	}, []);

	// --- НОВАЯ Функция закрытия модального окна (обновлена) ---
	const handleCloseModal = useCallback(() => {
		setSelectedItem(null); // <<< Сбрасываем объект
	}, []);

	// --- НОВАЯ Функция для начала предзагрузки при взаимодействии ---
	const handleInteractionStart = useCallback((fullSrc: string) => {
		preloadFullImage(fullSrc);
	}, []); // Empty dependencies, preloadFullImage is stable

	// --- Функция рендеринга одной колонки (ОБНОВЛЕНА для вертикального буфера) ---
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
			// Важно: Убедись, что ITEMS.length === TOTAL_ITEMS
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
									const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: "power3.out" });
									const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: "power3.out" });
									currentMap.set(itemKey, { element: el, rotX, rotY });
								} else if (existingEntry && !existingEntry.rotX) {
									const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: "power3.out" });
									const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: "power3.out" });
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
			// <<< НОВОЕ: Высота для вертикального повторения >>>
			const repeatingHeight = gridContentHeight; // Используем высоту контента без padding'ов wrapper'а

			// Проверка на columnTotalWidth > 0 перед использованием в wrap
			if (columnTotalWidth <= 0 || repeatingHeight <= 0 || !Number.isFinite(totalContentLogicalWidth) || !Number.isFinite(repeatingWidth) || !Number.isFinite(repeatingHeight)) {
				console.error("IFG: Invalid calculated widths/heights.", { columnTotalWidth, totalContentLogicalWidth, repeatingWidth, repeatingHeight });
				return null;
			}

			// ----- Используем repeatingWidth для wrapX -----
			const wrapX = gsap.utils.wrap(-repeatingWidth, 0);
			// <<< НОВОЕ: Используем repeatingHeight для wrapY >>>
			// Обертываем от -height до 0, чтобы соответствовать уменьшению incrY при скролле вниз (колесом)
			const wrapY = gsap.utils.wrap(-repeatingHeight, 0);

			// minY, maxY, scrollableDistanceY больше не нужны

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

			// --- Функция для (пере)создания quickTo для СКРОЛЛА (ОБНОВЛЕНА) ---
			const setupScrollQuickTo = (dims: GridDimensions) => {
				if (!contentWrapperElement) return; // Доп. проверка
				xToRef.current = gsap.quickTo(contentWrapperElement, "x", {
					duration: 0.8, ease: "power3.out",
					modifiers: { x: gsap.utils.unitize(value => dims.wrapX(parseFloat(value as string)), "px") }
				});
				// <<< ОБНОВЛЕНО: Используем wrapY >>>
				yToRef.current = gsap.quickTo(contentWrapperElement, "y", {
					duration: 0.5, ease: "power3.out",
					modifiers: { y: gsap.utils.unitize(value => dims.wrapY(parseFloat(value as string)), "px") }
				});
			};

			// --- Инициализация Observer для СКРОЛЛА (ОБНОВЛЕНО onChangeY) ---
			if (!observerInstance.current) {
				observerInstance.current = Observer.create({
					target: containerElement,
					type: "wheel,touch,pointer",
					// <<< preventDefault будет управляться ИЗ onChangeX/onChangeY >>>
					preventDefault: false,
					tolerance: 5,
					dragMinimum: 3,

					onChangeX: (self) => {
						handleScrollActivity();
						// Пропускаем, если вертикальный скролл преобладает ИЛИ мы не заблокированы/не инициализированы
						if (Math.abs(self.deltaX) < Math.abs(self.deltaY) || !isScrollLockedRef.current || !xToRef.current || !dimensionsRef.current) return;

						// <<< Предотвращаем стандартный горизонтальный скролл колесом, КОГДА ГАЛЕРЕЯ ЗАБЛОКИРОВАНА >>>
						if (self.event.type === 'wheel' && isScrollLockedRef.current) {
							self.event.preventDefault();
						}

						// <<< Расчет ускорения >>>
						const baseMultiplier = self.event.type === "wheel" ? 1 : 1.5;
						const velocityX = self.velocityX; // Получаем скорость от Observer
						const accelMultiplier = 1 + Math.abs(velocityX) * ACCELERATION_FACTOR;
						const incrementX = self.deltaX * baseMultiplier * accelMultiplier; // Применяем ускорение

						// <<< Применяем инкремент с правильным знаком >>>
						if (self.event.type === "wheel") {
							incrX.current -= incrementX;
						} else {
							// Для touch/pointer deltaX уже имеет правильный знак относительно смещения
							incrX.current += incrementX;
						}

						xToRef.current(incrX.current);
						throttledPreloadRef.current?.(self.deltaX > 0 ? 1 : -1);
					},
					onChangeY: (self) => {
						handleScrollActivity();
						// Пропускаем, если горизонтальный скролл преобладает ИЛИ мы не заблокированы/не инициализированы
						// (Проверка isScrollLockedRef здесь не так критична, т.к. preventDefault ниже ее учтет, но оставим для симметрии)
						if (Math.abs(self.deltaY) < Math.abs(self.deltaX) || !yToRef.current || !dimensionsRef.current) return;

						const dims = dimensionsRef.current; // dims нужен только для wrapY внутри yToRef

						// <<< Расчет ускорения >>>
						const baseMultiplier = self.event.type === "wheel" ? 1 : 1.5;
						const velocityY = self.velocityY; // Получаем скорость от Observer
						const accelMultiplier = 1 + Math.abs(velocityY) * ACCELERATION_FACTOR;
						const incrementY = self.deltaY * baseMultiplier * accelMultiplier; // Применяем ускорение

						// <<< Применяем инкремент к incrY без clamp >>>
						if (self.event.type === "wheel") {
							incrY.current -= incrementY;
						} else {
							incrY.current += incrementY;
						}

						// Запускаем анимацию quickTo, wrapY в модификаторе сделает свое дело
						yToRef.current(incrY.current);

						// --- ИЗМЕНЕНО: Логика preventDefault ---
						// Предотвращаем стандартное вертикальное поведение (скролл страницы)
						// ВСЕГДА, когда ScrollTrigger активен (isScrollLockedRef.current === true).
						// Горизонтальный скролл (если deltaX > deltaY) обрабатывается в onChangeX.
						if (isScrollLockedRef.current) {
							self.event.preventDefault();
						}
						// --- КОНЕЦ ИЗМЕНЕНИЯ preventDefault ---
					},
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
					// <<< ВОЗВРАЩАЕМ end, но с ОЧЕНЬ БОЛЬШИМ значением >>>
					// Это гарантирует, что при скролле вниз end не будет достигнут,
					// пока preventDefault активен. Открепление произойдет только
					// при скролле обратно вверх мимо start.
					end: "+=2880", // Используем большое значение
					pin: true,
					pinSpacing: true,
					anticipatePin: 1,
					// markers: true, // Показать маркеры для отладки
					invalidateOnRefresh: true, // Пересчитывать при рефреше

					// <<< ОБНОВЛЕНО onToggle: Убрана логика сброса/анимации Y >>>
					onToggle: (self) => {
						setScrollLocked(self.isActive); // Просто включаем/выключаем Observer
						// Никаких манипуляций с incrY или yToRef здесь больше не нужно
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

					// 3. Обновляем GSAP и позицию ВНУТРИ контекста
					gsapCtx.current.add(() => {
						setupScrollQuickTo(newDims);
						// Сбрасываем X, Y остается как есть (будет обернут wrapY)
						// Можно опционально сбросить X, но Y трогать не нужно, чтобы сохранить позицию в цикле
						incrX.current = 0;
						// incrY.current = newDims.wrapY(incrY.current); // Можно явно обернуть текущее значение на всякий случай
						gsap.set(contentWrapperElement, { x: 0 }); // Сбрасываем X визуально
						// Позицию Y не трогаем, quickTo ее держит
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
				setupScrollQuickTo(initialDims);
				// Устанавливаем начальные позиции в 0 (wrapX/wrapY их нормализуют если нужно)
				incrX.current = 0;
				incrY.current = 0;
				gsap.set(contentWrapperElement, { x: incrX.current, y: incrY.current });
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
			xToRef.current = null;
			yToRef.current = null;
			throttledPreloadRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false;
			isScrollLockedRef.current = false;
		};
		// <<< Обновлены зависимости (убраны minY/maxY/scrollableDistanceY если они где-то были косвенно) >>>
	}, [setScrollLocked, renderColsCount, performPreload]); // Зависимости в основном для колбэков

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
		const weights = ['normal', 'bold']; // Use string values for ctx.font
		const fontSize = 12; // Adjust as needed
		const lineHeight = 14; // Adjust as needed
		const timeFactor = 0.0005; // Slower time progression
		const xCoordFactor = 0.01; // Adjust pattern scaling
		const yCoordFactor = 0.01;
		const xyCoordFactor = 0.0008;
		const sinMultiplier = 20; // Adjust pattern intensity

		let cols = 0;
		let rows = 0;

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

			ctx.font = `${fontSize}px monospace`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
		};

		const drawBackground = (time: number) => {
			if (!ctx || cols <= 0 || rows <= 0) return;

			const t = time * timeFactor;
			const cellWidth = canvas.width / window.devicePixelRatio / cols;
			const cellHeight = canvas.height / window.devicePixelRatio / rows;
			const centerCol = cols / 2;
			const centerRow = rows / 2;

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = fontColor;

			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					const relX = x - centerCol;
					const relY = y - centerRow;

					const o = Math.sin(relX * relY * xyCoordFactor + relY * yCoordFactor + t) * sinMultiplier;
					const i = Math.floor(Math.abs(relX * xCoordFactor + relY * yCoordFactor + o)); // Adjusted factors
					const c = (Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2; // Simplified checker

					const char = pattern[c]?.[i % pattern[c]?.length] ?? ' ';
					const weight = weights[c] ?? 'normal';

					ctx.font = `${weight} ${fontSize}px monospace`; // Set weight per char

					// Calculate position to draw character
					const drawX = x * cellWidth + cellWidth / 2;
					const drawY = y * cellHeight + cellHeight / 2;

					ctx.fillText(char, drawX, drawY);
				}
			}
		};

		const animate = (currentTime: number) => {
			drawBackground(currentTime);
			animationFrameIdRef.current = requestAnimationFrame(animate);
		};

		// Initial setup
		resizeCanvas();
		animationFrameIdRef.current = requestAnimationFrame(animate);

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
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

		</section>
	);
};

