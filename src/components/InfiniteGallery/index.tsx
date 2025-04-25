/* eslint-disable no-console */
import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';

import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { debounce } from 'lodash';

import styles from './index.module.scss';

// --- Регистрация плагинов GSAP ---
gsap.registerPlugin(Observer, ScrollTrigger);

// --- Константы ---
const ROWS = 10; // Количество строк в логической сетке
const COLS = 15; // Количество КОЛОНОК в ЛОГИЧЕСКОЙ сетке (определяет wrap)
const TOTAL_ITEMS = ROWS * COLS; // Всего элементов (150)
// --- УБРАЛИ RENDER_COLS ---
const DEBOUNCE_RESIZE_MS = 150; // Задержка debounce для ресайза
const RENDER_COLS_BUFFER = 2; // Дополнительные колонки для рендеринга (запас)

// --- Генерация данных (плейсхолдеры) ---
const ITEMS = Array.from({ length: TOTAL_ITEMS }, (_, i) => ({
	id: i,
}));

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
	const itemRef = useRef<HTMLDivElement>(null);           // Реф для измерения ОДНОГО элемента

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

	const dimensionsRef = useRef<GridDimensions | null>(null); // Хранение рассчитанных размеров
	const isInitialized = useRef(false); // Флаг для однократной инициализации

	// --- Состояние для блокировки скролла ---
	const isScrollLockedRef = useRef(false); // Ref для мгновенного доступа из GSAP
	const [isLockedState, setIsLockedState] = useState(false); // State для ререндера/CSS

	// --- НОВОЕ Состояние для количества рендерящихся колонок ---
	// Начинаем с COLS как базовое значение, будет пересчитано немедленно
	const [renderColsCount, setRenderColsCount] = useState(COLS);

	// --- Функция для управления блокировкой скролла ---
	const setScrollLocked = useCallback((locked: boolean) => {
		if (isScrollLockedRef.current !== locked) {
			console.log("IFG: Setting scroll lock to:", locked);
			isScrollLockedRef.current = locked;
			setIsLockedState(locked); // Обновляем state для CSS

			if (locked) {
				observerInstance.current?.enable();
				console.log("IFG: Observer ENABLED");
			} else {
				observerInstance.current?.disable();
				console.log("IFG: Observer DISABLED");
			}
			document.body.classList.toggle('ifg-locked', locked);
		}
	}, []);

	// --- Функция рендеринга одной колонки (без изменений) ---
	const renderColumn = useCallback((columnIndex: number) => {
		const isFirstColumn = columnIndex === 0;
		const itemsInColumn = [];
		// Определяем базовый индекс элемента для этой колонки, зацикливаясь по COLS
		const baseItemIndex = (columnIndex % COLS) * ROWS;

		for (let i = 0; i < ROWS; i++) {
			const itemIndex = baseItemIndex + i;
			if (itemIndex < TOTAL_ITEMS) {
				const item = ITEMS[itemIndex];
				const isFirstItem = i === 0;
				itemsInColumn.push(
					<div
						className={styles.media}
						key={`${columnIndex}-${item.id}`}
						ref={isFirstColumn && isFirstItem ? itemRef : null}
					>
						Item {item.id + 1}
					</div>
				);
			}
		}
		return (
			<div
				className={styles.column}
				key={`col-${columnIndex}`}
				ref={isFirstColumn ? columnRef : null}
			>
				{itemsInColumn}
			</div>
		);
	}, []);

	// --- Основной useLayoutEffect для всей магии GSAP ---
	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const contentWrapperElement = contentWrapperRef.current;

		if (!containerElement || !contentWrapperElement || isInitialized.current) {
			return;
		}
		console.log("IFG: Initializing...");

		// --- Функция расчета размеров ---
		// Возвращает GridDimensions или null
		const calculateDimensions = (): GridDimensions | null => {
			const firstColumn = columnRef.current;
			const firstItem = itemRef.current;
			const wrapperElement = contentWrapperRef.current;

			if (!firstColumn || !firstItem || !wrapperElement || !containerElement) {
				console.warn("IFG: Refs not available for measurement yet.");
				return null;
			}
			const computedStyleColumn = window.getComputedStyle(firstColumn);
			const computedStyleWrapper = window.getComputedStyle(wrapperElement);
			const viewportWidth = containerElement.clientWidth;
			const viewportHeight = containerElement.clientHeight;
			const colRect = firstColumn.getBoundingClientRect();
			const itemRect = firstItem.getBoundingClientRect();
			const columnWidth = colRect.width;
			const itemHeight = itemRect.height;
			const columnGap = parseFloat(computedStyleWrapper.columnGap) || 0;
			const rowGap = parseFloat(computedStyleColumn.rowGap) || 0;
			const wrapperPaddingTop = parseFloat(computedStyleWrapper.paddingTop) || 0;
			const wrapperPaddingBottom = parseFloat(computedStyleWrapper.paddingBottom) || 0;

			// Добавляем проверку на валидность размеров перед расчетами
			if (!viewportWidth || !viewportHeight || !columnWidth || !itemHeight || !Number.isFinite(columnWidth) || !Number.isFinite(itemHeight)) {
				console.error("IFG: Failed to get valid base dimensions.", { viewportWidth, viewportHeight, columnWidth, itemHeight });
				return null;
			}

			const columnTotalWidth = columnWidth + columnGap; // Ширина колонки + правый отступ
			const gridContentHeight = ROWS * itemHeight + Math.max(0, ROWS - 1) * rowGap;
			const fullWrapperHeight = gridContentHeight + wrapperPaddingTop + wrapperPaddingBottom;
			// Логическая ширина контента (COLS колонок)
			const totalContentLogicalWidth = COLS * columnWidth + Math.max(0, COLS - 1) * columnGap;

			// Проверка на columnTotalWidth > 0 перед использованием в wrap
			if (columnTotalWidth <= 0 || !Number.isFinite(totalContentLogicalWidth)) {
				console.error("IFG: Invalid calculated widths.", { columnTotalWidth, totalContentLogicalWidth });
				return null;
			}

			const wrapX = gsap.utils.wrap(-totalContentLogicalWidth, 0);
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
			console.log("IFG: Dimensions calculated", newDimensions);
			dimensionsRef.current = newDimensions; // Сохраняем в ref
			return newDimensions;
		};

		// --- Функция расчета необходимого количества колонок для рендера ---
		// Принимает размеры, возвращает число
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
			console.log(`IFG: Calculated render cols: ceil((${dims.totalContentLogicalWidth.toFixed(0)} + ${dims.viewportWidth}) / ${dims.columnTotalWidth.toFixed(2)}) + ${RENDER_COLS_BUFFER} = ${count}`);
			return count;
		};

		// --- Создание контекста GSAP ---
		gsapCtx.current = gsap.context(() => {
			console.log("IFG: GSAP Context created.");

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
				console.log("IFG: QuickTo instances created/updated.");
			};

			// --- Инициализация Observer (логика без изменений) ---
			if (!observerInstance.current) {
				console.log("IFG: Creating Observer instance.");
				observerInstance.current = Observer.create({
					target: containerElement,
					type: "wheel,touch,pointer",
					preventDefault: false,
					tolerance: 5,
					dragMinimum: 3,
					onChangeX: (self) => {
						if (Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;

						if (self.event.type === 'wheel' && Math.abs(self.deltaX) > 0) {
							console.log("IFG: Horizontal wheel detected, preventing default browser navigation swipe.");
							self.event.preventDefault();
							self.event.preventDefault(); // Предотвратить действие по умолчанию
							self.event.stopPropagation(); // Остановить всплытие события
						}

						if (!isScrollLockedRef.current || !xToRef.current || !dimensionsRef.current) return;

						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						if (self.event.type === "wheel") { incrX.current -= self.deltaX * multiplier }
						else { incrX.current += self.deltaX * multiplier }
						xToRef.current(incrX.current);
					},
					onChangeY: (self) => {
						if (!isScrollLockedRef.current || !yToRef.current || !dimensionsRef.current) return;
						if (Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;

						const dims = dimensionsRef.current;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						const currentY = gsap.getProperty(contentWrapperElement, "y") as number;
						const isScrollingDown = self.deltaY > 0;
						const isScrollingUp = self.deltaY < 0;
						const tolerance = 1;
						const isStrictlyAtBottom = currentY <= dims.maxY + tolerance;
						const isStrictlyAtTop = currentY >= dims.minY - tolerance;
						let shouldPreventDefault = true;

						if ((isStrictlyAtBottom && isScrollingUp) || (isStrictlyAtTop && isScrollingDown)) {
							shouldPreventDefault = true;
						} else if ((isStrictlyAtBottom && isScrollingDown) || (isStrictlyAtTop && isScrollingUp)) {
							shouldPreventDefault = false;
							console.log(`IFG: At boundary, scrolling outwards. NOT preventing default.`);
							const targetY = isScrollingDown ? dims.maxY : dims.minY;
							if (currentY !== targetY) { incrY.current = targetY; yToRef.current(targetY); }
						} else {
							shouldPreventDefault = true;
						}

						if (shouldPreventDefault) {
							if (self.event.type === "wheel") incrY.current -= self.deltaY * multiplier;
							else incrY.current += self.deltaY * multiplier;
							const clampedY = gsap.utils.clamp(dims.maxY, dims.minY, incrY.current);
							incrY.current = clampedY;
							yToRef.current(clampedY);
							self.event.preventDefault();
						}
					},
				});
				observerInstance.current.disable();
				console.log("IFG: Observer created and immediately DISABLED.");
			}

			// --- Инициализация ScrollTrigger (логика без изменений) ---
			if (!scrollTriggerInstance.current) {
				console.log("IFG: Creating ScrollTrigger instance with PIN.");
				scrollTriggerInstance.current = ScrollTrigger.create({
					trigger: containerElement,
					start: "top top",
					// Используем ref с размерами для динамического end
					end: () => `+=${dimensionsRef.current?.scrollableDistanceY ?? containerElement.clientHeight}`,
					pin: true,
					pinSpacing: true,
					anticipatePin: 1,
					// markers: true,
					invalidateOnRefresh: true,
					onToggle: (self) => {
						console.log(`IFG: ScrollTrigger toggle. isActive: ${self.isActive}, direction: ${self.direction}`);
						setScrollLocked(self.isActive);
						if (self.isActive) {
							const dims = dimensionsRef.current;
							if (dims && contentWrapperElement) { // Добавили проверку contentWrapperElement
								const targetY = self.direction === 1 ? dims.minY : dims.maxY;
								console.log(`IFG: Pin activated (direction: ${self.direction}). Setting internal Y to: ${targetY}`);
								incrY.current = targetY;
								gsap.set(contentWrapperElement, { y: targetY });
								yToRef.current?.(targetY);
							}
						}
					},
				});
			}

			// --- Инициализация ResizeObserver ---
			const debouncedResizeHandler = debounce(() => {
				console.log("IFG: Resize detected, recalculating...");
				// 1. Пересчитываем базовые размеры
				const newDims = calculateDimensions();

				if (newDims && gsapCtx.current && contentWrapperElement) { // Добавили проверку contentWrapperElement
					// 2. Пересчитываем количество колонок на основе новых размеров
					const newRenderCols = calculateRenderCols(newDims);

					// 3. Обновляем GSAP и позицию
					gsapCtx.current.add(() => {
						setupQuickTo(newDims);
						incrX.current = 0;
						incrY.current = gsap.utils.clamp(newDims.maxY, newDims.minY, incrY.current);
						gsap.set(contentWrapperElement, { x: 0, y: incrY.current });
						console.log("IFG: Position reset/adjusted after resize.");
					});

					// 4. Обновляем state количества колонок, ЕСЛИ изменилось
					// Сравниваем с текущим значением из state (renderColsCount)
					if (newRenderCols !== renderColsCount) {
						console.log(`IFG: Render cols changed from ${renderColsCount} to ${newRenderCols}. Updating state.`);
						setRenderColsCount(newRenderCols); // Обновляем state -> React перерендерит колонки
					}
				}
				// 5. Обновляем ScrollTrigger ПОСЛЕ всех расчетов и возможных ререндеров
				ScrollTrigger.refresh();
				console.log("IFG: ScrollTrigger refreshed.");
			}, DEBOUNCE_RESIZE_MS);

			resizeObserverRef.current = new ResizeObserver(debouncedResizeHandler);
			resizeObserverRef.current.observe(containerElement);

			// --- Первоначальный расчет и настройка ---
			// 1. Рассчитываем начальные размеры
			const initialDims = calculateDimensions();

			if (initialDims) {
				// 2. Рассчитываем начальное количество колонок
				const initialRenderCols = calculateRenderCols(initialDims);
				console.log("IFG: Initial render cols calculated:", initialRenderCols);
				// 3. Устанавливаем начальное количество колонок в state
				setRenderColsCount(initialRenderCols);

				// 4. Настраиваем GSAP (quickTo, начальная позиция)
				setupQuickTo(initialDims);
				gsap.set(contentWrapperElement, { x: 0, y: 0 });
				incrX.current = 0;
				incrY.current = 0;
				isInitialized.current = true;

				// 5. Обновляем ScrollTrigger
				ScrollTrigger.refresh();
				console.log("IFG: Initial ScrollTrigger refresh.");

				// 6. Проверяем начальное состояние блокировки (асинхронно)
				setTimeout(() => {
					if (scrollTriggerInstance.current) {
						setScrollLocked(scrollTriggerInstance.current.isActive);
						console.log("IFG: Initialization complete. Initial lock state checked:", isScrollLockedRef.current);
					}
				}, 0);

			} else {
				console.error("IFG: Failed to get initial dimensions. Component might not work.");
				// Можно установить какое-то дефолтное количество колонок, если расчет не удался
				setRenderColsCount(COLS); // Ставим хотя бы логическое число
			}

		}, containerRef);

		// --- Функция очистки при размонтировании компонента ---
		return () => {
			console.log("IFG: Cleaning up...");
			resizeObserverRef.current?.disconnect();
			gsapCtx.current?.revert(); // Убьет Observer, ScrollTrigger, quickTo, созданные в контексте
			document.body.classList.remove('ifg-locked');
			resizeObserverRef.current = null;
			observerInstance.current = null; // Хотя revert должен убить, обнуляем для чистоты
			scrollTriggerInstance.current = null; // Аналогично
			gsapCtx.current = null;
			xToRef.current = null;
			yToRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false;
			isScrollLockedRef.current = false;
			console.log("IFG: Cleanup complete.");
		};

		// Добавляем renderColsCount в зависимости, т.к. debouncedResizeHandler его читает
	}, [renderColumn, setScrollLocked, renderColsCount]);

	// --- JSX Разметка ---
	return (
		<section
			className={`${styles.mwg_effect} ${isLockedState ? styles.isLocked : ''}`}
			ref={containerRef}
		>
			<div className={styles.contentWrapper} ref={contentWrapperRef}>
				{/* Используем state renderColsCount для определения количества колонок */}
				{Array.from({ length: renderColsCount }).map((_, index) =>
					renderColumn(index)
				)}
			</div>
			{/* <div className={styles.overlay}>Cols: {renderColsCount} | Locked: {isLockedState.toString()}</div> */}
		</section>
	);
};