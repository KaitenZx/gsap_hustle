import React, { useRef, useLayoutEffect, useState, useCallback, useMemo } from 'react';

import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { debounce, throttle } from 'lodash';


import { ImageModal } from '../ImageModal';

import styles from './index.module.scss';

gsap.registerPlugin(Observer, ScrollTrigger);
// --- Константы ---
const ROWS = 7; // Количество строк в логической сетке
const COLS = 10; // Количество КОЛОНОК в ЛОГИЧЕСКОЙ сетке (определяет wrap)
const TOTAL_ITEMS = ROWS * COLS; // Всего элементов (70)
const DEBOUNCE_RESIZE_MS = 150; // Задержка debounce для ресайза
const RENDER_COLS_BUFFER = 2; // Дополнительные колонки для рендеринга (запас)
const PRELOAD_THROTTLE_MS = 200; // Задержка throttle для предзагрузки

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
const ITEMS: GalleryItem[] = previewImages
	.slice(0, TOTAL_ITEMS) // Берем только нужное количество превью
	.map((previewItem) => {
		const fullSrc = fullImageUrlsById.get(previewItem.id);
		// Возвращаем элемент, только если нашли соответствующее полное изображение
		return fullSrc ? {
			id: previewItem.id,
			previewSrc: previewItem.url,
			fullSrc: fullSrc,
			alt: `Gallery image ${previewItem.id}` // Используем ID из файла для alt
		} : null;
	})
	.filter((item): item is GalleryItem => item !== null); // Отфильтровываем null, если не нашлось полное изображение

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
		// console.log(`[IFG Preload] Requesting: ${url.split('/').pop()}`);
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

// --- Тип для хранения рассчитанных размеров ---
type GridDimensions = {
	viewportWidth: number;
	viewportHeight: number;
	columnWidth: number;
	columnGap: number;
	columnTotalWidth: number; // Ширина колонки + gap
	itemHeight: number;
	rowGap: number;
	totalContentLogicalWidth: number; // Ширина 15 "логических" колонок + gap'ы
	totalContentHeight: number;       // Высота 10 строк + gap'ы (без padding wrapper'а)
	fullWrapperHeight: number;        // Полная высота контента с padding'ами wrapper'а
	wrapX: (value: number) => number; // Функция Wrap для горизонтали
	minY: number;                     // Минимальная позиция Y (обычно 0)
	maxY: number;                     // Максимальная позиция Y (отрицательная или 0)
	scrollableDistanceY: number;      // Расстояние, которое можно проскроллить по вертикали внутри
}

// --- Компонент ---
export const InfiniteGallery: React.FC = () => {
	// --- Refs для DOM элементов ---
	const containerRef = useRef<HTMLDivElement>(null);      // Внешний контейнер (.mwg_effect)
	const contentWrapperRef = useRef<HTMLDivElement>(null); // Двигающийся контейнер (.contentWrapper)
	const columnRef = useRef<HTMLDivElement>(null);         // Реф для измерения ОДНОЙ колонки
	const itemRef = useRef<HTMLDivElement>(null);           // Реф для измерения ОДНОГО элемента (.media)

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

	// --- Состояние для блокировки скролла ---
	const isScrollLockedRef = useRef(false); // Ref для мгновенного доступа из GSAP
	const [isLockedState, setIsLockedState] = useState(false); // State для ререндера/CSS

	// --- Состояние для количества рендерящихся колонок ---
	const [renderColsCount, setRenderColsCount] = useState(COLS); // Начинаем с COLS, будет пересчитано

	// --- НОВОЕ Состояние для отслеживания выбранного изображения для модального окна ---
	const [selectedFullSrc, setSelectedFullSrc] = useState<string | null>(null);

	// --- Функция для предзагрузки ПРЕВЬЮ (использует обновленную getColumnPreviewImageUrls) ---
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

	// --- НОВАЯ Функция обработчика клика по изображению ---
	const handleImageClick = useCallback((fullSrc: string) => {
		setSelectedFullSrc(fullSrc);
		// Опционально: Можно временно заблокировать скролл страницы пока модалка открыта,
		// если она не будет сама это делать.
		// document.body.style.overflow = 'hidden';
	}, []); // Пустой массив зависимостей, т.к. использует только setSelectedFullSrc

	// --- НОВАЯ Функция закрытия модального окна ---
	const handleCloseModal = useCallback(() => {
		setSelectedFullSrc(null);
		// Опционально: Восстанавливаем скролл страницы
		// document.body.style.overflow = '';
	}, []);

	// --- Функция рендеринга одной колонки (обновлена для клика и previewSrc) ---
	const renderColumn = useCallback((columnIndex: number) => {
		const isFirstColumn = columnIndex === 0;
		const itemsInColumn = [];
		const baseItemIndex = (columnIndex % COLS) * ROWS;

		for (let i = 0; i < ROWS; i++) {
			const itemIndex = baseItemIndex + i;
			if (itemIndex < ITEMS.length) {
				const item: GalleryItem = ITEMS[itemIndex];
				const isFirstItem = i === 0;
				itemsInColumn.push(
					<div
						className={styles.media}
						key={`${columnIndex}-${item.id}`}
						ref={isFirstColumn && isFirstItem ? itemRef : null}
						role="button"
						tabIndex={0}
						onClick={() => handleImageClick(item.fullSrc)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								handleImageClick(item.fullSrc);
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
			}
		}
		return (
			<div
				className={styles.column}
				key={`col-${columnIndex}`}
				ref={isFirstColumn ? columnRef : null}
				style={{ pointerEvents: 'none' }} // Отключаем события на колонке (кроме .media)
			>
				{itemsInColumn}
			</div>
		);
	}, [handleImageClick]);

	// --- Основной useLayoutEffect (обновлен для использования getColumnPreviewImageUrls) ---
	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const contentWrapperElement = contentWrapperRef.current;

		// Ждем рефы и проверяем флаг инициализации
		if (!containerElement || !contentWrapperElement || isInitialized.current) {
			return;
		}

		// --- Функция расчета размеров ---
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
			// Логическая ширина контента (COLS колонок)
			const totalContentLogicalWidth = COLS * columnWidth + Math.max(0, COLS - 1) * columnGap;
			// ----- FIX: Рассчитываем корректную ширину одного полного цикла ----
			const repeatingWidth = COLS * columnTotalWidth; // COLS * (ширина + gap)

			// Проверка на columnTotalWidth > 0 перед использованием в wrap
			if (columnTotalWidth <= 0 || !Number.isFinite(totalContentLogicalWidth) || !Number.isFinite(repeatingWidth)) { // Добавили проверку repeatingWidth
				console.error("IFG: Invalid calculated widths.", { columnTotalWidth, totalContentLogicalWidth, repeatingWidth });
				return null;
			}

			// ----- FIX: Используем repeatingWidth для wrapX -----
			const wrapX = gsap.utils.wrap(-repeatingWidth, 0);
			const minY = 0;
			const maxY = Math.min(0, viewportHeight - fullWrapperHeight);
			const scrollableDistanceY = Math.max(0, fullWrapperHeight - viewportHeight);

			const newDimensions: GridDimensions = {
				viewportWidth, viewportHeight, columnWidth, itemHeight, rowGap, columnGap,
				columnTotalWidth, // Добавили
				totalContentLogicalWidth,
				totalContentHeight: gridContentHeight,
				fullWrapperHeight, // Добавили
				wrapX, minY, maxY, scrollableDistanceY
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

		gsapCtx.current = gsap.context(() => {
			// --- Функция для (пере)создания quickTo ---
			const setupQuickTo = (dims: GridDimensions) => {
				if (!contentWrapperElement) return; // Доп. проверка
				xToRef.current = gsap.quickTo(contentWrapperElement, "x", {
					duration: 0.8, ease: "power3.out",
					modifiers: { x: gsap.utils.unitize(value => dims.wrapX(parseFloat(value as string)), "px") }
				});
				yToRef.current = gsap.quickTo(contentWrapperElement, "y", {
					duration: 0.5, ease: "power3.out"
				});
			};

			// --- Инициализация Observer ---
			if (!observerInstance.current) {
				observerInstance.current = Observer.create({
					target: containerElement, // Слушаем сам контейнер
					type: "wheel,touch,pointer",
					preventDefault: false, // Управляем вручную
					tolerance: 5,
					dragMinimum: 3,

					onChangeX: (self) => {
						// Игнорируем, если вертикальное движение доминирует
						if (Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;

						// Предотвращаем горизонтальный свайп страницы колесом/тачпадом
						if (self.event.type === 'wheel' && Math.abs(self.deltaX) > 0) {
							self.event.preventDefault(); // Предотвратить действие по умолчанию
							// self.event.stopPropagation(); // Обычно не нужен, но можно оставить при необходимости
						}

						// Выходим, если не заблокировано или нет quickTo/размеров
						if (!isScrollLockedRef.current || !xToRef.current || !dimensionsRef.current) return;

						// Накапливаем и применяем смещение X
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						if (self.event.type === "wheel") { incrX.current -= self.deltaX * multiplier }
						else { incrX.current += self.deltaX * multiplier }
						xToRef.current(incrX.current);

						// Вызываем throttled-функцию предзагрузки ПРЕВЬЮ
						throttledPreloadRef.current?.(self.deltaX > 0 ? 1 : -1);
					},
					onChangeY: (self) => {
						// Выходим, если не заблокировано или нет quickTo/размеров
						if (!isScrollLockedRef.current || !yToRef.current || !dimensionsRef.current) return;
						// Игнорируем, если горизонтальное движение доминирует
						if (Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;

						const dims = dimensionsRef.current;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;

						// Рассчитываем целевое значение Y
						let targetY = incrY.current;
						if (self.event.type === "wheel") targetY -= self.deltaY * multiplier;
						else targetY += self.deltaY * multiplier;

						// Ограничиваем Y границами
						const clampedY = gsap.utils.clamp(dims.maxY, dims.minY, targetY);

						// --- FIX: Определяем, нужно ли предотвращать скролл страницы (новая логика) ---
						// Определяем направление скролла (true = вниз, false = вверх)
						// Важно: deltaY для wheel инвертирован по сравнению с touch/pointer
						const isScrollingDown = self.event.type === "wheel" ? self.deltaY > 0 : self.deltaY < 0;

						let shouldPreventDefault = false;
						if (isScrollingDown) {
							// Если скроллим ВНИЗ, предотвращаем, если еще НЕ достигли НИЖНЕЙ границы (maxY)
							// Используем небольшой допуск, чтобы избежать проблем с float-сравнением
							shouldPreventDefault = incrY.current > dims.maxY + 0.01;
						} else {
							// Если скроллим ВВЕРХ, предотвращаем, если еще НЕ достигли ВЕРХНЕЙ границы (minY)
							shouldPreventDefault = incrY.current < dims.minY - 0.01;
						}
						// --- Конец FIX ---

						// Если нужно предотвращать скролл страницы (т.е. мы внутри границ И ЕСТЬ КУДА СКРОЛЛИТЬ)
						if (shouldPreventDefault) {
							// Накапливаем и двигаем внутренний контент
							incrY.current = clampedY;
							yToRef.current(clampedY);

							// Предотвращаем скролл страницы
							self.event.preventDefault();
						} else {
							// Если предотвращать не нужно (достигли границы ИЛИ пытаемся выйти за нее),
							// то просто прилепляем контент к границе, если он еще не там.
							// НЕ вызываем preventDefault(), позволяя странице скроллиться.
							if (incrY.current !== clampedY) { // Сравниваем текущий ref с клампнутым значением
								incrY.current = clampedY;
								yToRef.current(clampedY);
							}
						}
					},
				});
				observerInstance.current.disable(); // Сразу выключаем
			}

			// --- Создание throttled-функции для предзагрузки (внутри gsap.context) ---
			// Создаем throttled-версию внутри контекста, используя performPreload из useCallback
			// чтобы она тоже очистилась при revert
			throttledPreloadRef.current = throttle(performPreload, PRELOAD_THROTTLE_MS, { leading: false, trailing: true });

			// --- Инициализация ScrollTrigger ---
			if (!scrollTriggerInstance.current) {
				scrollTriggerInstance.current = ScrollTrigger.create({
					trigger: containerElement,
					start: "top top",
					// Используем ref с размерами для динамического end
					end: () => `+=${dimensionsRef.current?.scrollableDistanceY ?? containerElement.clientHeight}`,
					pin: true,
					pinSpacing: true,
					anticipatePin: 1, // Помогает избежать "прыжка" при входе/выходе
					// markers: true, // Показать маркеры для отладки
					invalidateOnRefresh: true, // Пересчитывать end при рефреше (важно для динамического end)

					onToggle: (self) => {
						setScrollLocked(self.isActive); // Включаем/выключаем Observer

						// Умный сброс позиции Y при активации пина
						if (self.isActive) {
							const dims = dimensionsRef.current;
							// Добавляем проверку contentWrapperElement для безопасности
							if (dims && contentWrapperElement) {
								// Определяем целевую позицию в зависимости от направления входа
								const targetY = self.direction === 1 ? dims.minY : dims.maxY;
								incrY.current = targetY;
								// Устанавливаем позицию немедленно и обновляем quickTo
								gsap.set(contentWrapperElement, { y: targetY });
								yToRef.current?.(targetY); // Синхронизируем quickTo
							}
						}
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
						setupQuickTo(newDims);
						// Сбрасываем X, клампим Y к новым границам
						incrX.current = 0;
						incrY.current = gsap.utils.clamp(newDims.maxY, newDims.minY, incrY.current);
						gsap.set(contentWrapperElement, { x: 0, y: incrY.current });
					});

					// 4. Обновляем state количества колонок, ЕСЛИ изменилось
					// Сравниваем с текущим значением из state (renderColsCount)
					if (newRenderCols !== renderColsCount) {
						setRenderColsCount(newRenderCols); // Обновляем state -> React перерендерит колонки
					}
				}
				// 5. Обновляем ScrollTrigger ПОСЛЕ всех расчетов и возможных ререндеров
				ScrollTrigger.refresh();

				// --- Предзагрузка начальных ПРЕВЬЮ изображений ---
				if (newDims && newDims.columnTotalWidth > 0) {
					const visibleColsApprox = Math.ceil(newDims.viewportWidth / newDims.columnTotalWidth);
					const preloadColsCount = 2; // Предзагружаем 2 колонки справа
					for (let i = 0; i < preloadColsCount; i++) {
						const colIndexToPreload = visibleColsApprox + i;
						const urlsToPreload = getColumnPreviewImageUrls(colIndexToPreload);
						urlsToPreload.forEach(preloadImage);
					}
				}
			}, DEBOUNCE_RESIZE_MS);

			resizeObserverRef.current = new ResizeObserver(debouncedResizeHandler);
			resizeObserverRef.current.observe(containerElement); // Наблюдаем за ИЗМЕНЕНИЕМ РАЗМЕРА контейнера

			// --- Первоначальный расчет и настройка ---
			// 1. Рассчитываем начальные размеры
			const initialDims = calculateDimensions();

			if (initialDims) {
				// 2. Рассчитываем начальное количество колонок
				const initialRenderCols = calculateRenderCols(initialDims);
				// 3. Устанавливаем начальное количество колонок в state
				setRenderColsCount(initialRenderCols);

				// 4. Настраиваем GSAP (quickTo, начальная позиция)
				setupQuickTo(initialDims);
				gsap.set(contentWrapperElement, { x: 0, y: 0 });
				incrX.current = 0;
				incrY.current = 0;
				isInitialized.current = true; // Ставим флаг, что инициализация прошла

				// --- Предзагрузка начальных ПРЕВЬЮ изображений ---
				if (initialDims.columnTotalWidth > 0) {
					const visibleColsApprox = Math.ceil(initialDims.viewportWidth / initialDims.columnTotalWidth);
					const preloadColsCount = 2; // Предзагружаем 2 колонки справа
					for (let i = 0; i < preloadColsCount; i++) {
						const colIndexToPreload = visibleColsApprox + i;
						const urlsToPreload = getColumnPreviewImageUrls(colIndexToPreload);
						urlsToPreload.forEach(preloadImage);
					}
				}

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

		}, containerRef); // Привязываем контекст GSAP к containerRef

		// --- Функция очистки при размонтировании компонента ---
		return () => {
			// 1. Отключаем ResizeObserver
			resizeObserverRef.current?.disconnect();
			// 2. Отменяем любые ожидающие вызовы throttled-функции
			throttledPreloadRef.current?.cancel();
			// 3. Убиваем все, что создано в контексте GSAP
			// Это включает Observer, ScrollTrigger, все анимации и quickTo
			gsapCtx.current?.revert();
			// 4. Убираем класс с body
			document.body.classList.remove('ifg-locked');
			// 5. Сбрасываем все рефы (хотя revert уже многое сделал, это для чистоты)
			resizeObserverRef.current = null;
			observerInstance.current = null;
			scrollTriggerInstance.current = null;
			gsapCtx.current = null;
			xToRef.current = null;
			yToRef.current = null;
			throttledPreloadRef.current = null; // Сброс рефа для throttle
			dimensionsRef.current = null;
			isInitialized.current = false; // Сброс флага
			isScrollLockedRef.current = false; // Сброс состояния блокировки
		};

		// Добавляем renderColsCount, performPreload, setScrollLocked в зависимости
	}, [renderColumn, setScrollLocked, renderColsCount, performPreload]); // Зависимости useLayoutEffect

	// --- Мемоизация массива колонок ---
	const columnsToRender = useMemo(() => {
		return Array.from({ length: renderColsCount }).map((_, index) =>
			renderColumn(index)
		);
	}, [renderColsCount, renderColumn]);

	// --- JSX Разметка (раскомментируем и используем ImageModal) ---
	return (
		<section
			className={`${styles.mwg_effect} ${isLockedState ? styles.isLocked : ''}`}
			ref={containerRef}
		>
			<div className={styles.contentWrapper} ref={contentWrapperRef}>
				{columnsToRender}
			</div>

			{/* Используем ImageModal */}
			{selectedFullSrc && (
				<ImageModal
					src={selectedFullSrc}
					alt={`Full size view of image ${selectedFullSrc.split('/').pop()?.split('.')[0] ?? ''}`} // Генерируем alt
					onClose={handleCloseModal}
				/>
			)}

		</section>
	);
};

// --- Убираем закомментированный код ImageModal из этого файла ---
/*
import stylesModal from './ImageModal.module.scss';
... (весь закомментированный ImageModal) ...
*/