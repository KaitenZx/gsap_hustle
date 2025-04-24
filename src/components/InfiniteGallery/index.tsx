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
const COLS = 15; // Количество колонок в логической сетке
const TOTAL_ITEMS = ROWS * COLS; // Всего элементов (150)
// Количество рендерящихся колонок: основные + дубликаты для бесшовности.
const RENDER_COLS = COLS * 2; // 30 колонок
const DEBOUNCE_RESIZE_MS = 150; // Задержка debounce для ресайза

// --- Генерация данных (плейсхолдеры) ---
const ITEMS = Array.from({ length: TOTAL_ITEMS }, (_, i) => ({
	id: i,
}));

// --- Тип для хранения рассчитанных размеров ---
type GridDimensions = {
	viewportWidth: number;
	viewportHeight: number;
	columnWidth: number;
	itemHeight: number;
	rowGap: number;
	columnGap: number;
	totalContentLogicalWidth: number; // Ширина 15 "логических" колонок + gap'ы
	totalContentHeight: number;       // Высота 10 строк + gap'ы
	wrapX: (value: number) => number; // Функция Wrap для горизонтали
	minY: number;                     // Минимальная позиция Y (обычно 0)
	maxY: number;                     // Максимальная позиция Y (отрицательная или 0)
	scrollableDistanceY: number;      // Расстояние, которое можно проскроллить по вертикали внутри
}

// --- Компонент ---
export const InfiniteFiniteGrid: React.FC = () => {
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

	// --- Функция для управления блокировкой скролла ---
	const setScrollLocked = useCallback((locked: boolean) => {
		if (isScrollLockedRef.current !== locked) {
			console.log("IFG: Setting scroll lock to:", locked);
			isScrollLockedRef.current = locked;
			setIsLockedState(locked); // Обновляем state для CSS

			if (locked) {
				observerInstance.current?.enable();
				console.log("IFG: Observer ENABLED");
				// При блокировке сбросим Y на текущее значение, чтобы избежать скачка
				// (Эта логика теперь перенесена в onToggle ScrollTrigger'а)
				// const currentY = gsap.getProperty(contentWrapperRef.current, "y") as number;
				// incrY.current = currentY;
			} else {
				observerInstance.current?.disable();
				console.log("IFG: Observer DISABLED");
			}
			// Добавляем/убираем класс на body для возможности стилизации (например, скрыть скроллбар)
			document.body.classList.toggle('ifg-locked', locked);
		}
	}, []); // Зависимостей нет

	// --- Функция рендеринга одной колонки ---
	const renderColumn = useCallback((columnIndex: number) => {
		const isFirstColumn = columnIndex === 0;
		const itemsInColumn = [];
		// Определяем базовый индекс элемента для этой колонки, зацикливаясь по COLS
		const baseItemIndex = (columnIndex % COLS) * ROWS;

		for (let i = 0; i < ROWS; i++) {
			const itemIndex = baseItemIndex + i;
			// Убедимся, что не выходим за пределы массива ITEMS
			if (itemIndex < TOTAL_ITEMS) {
				const item = ITEMS[itemIndex];
				const isFirstItem = i === 0;
				itemsInColumn.push(
					<div
						className={styles.media}
						key={`${columnIndex}-${item.id}`} // Уникальный ключ
						// Вешаем реф только на самый первый элемент (в первой колонке) для измерений
						ref={isFirstColumn && isFirstItem ? itemRef : null}
					>
						Item {item.id + 1} {/* Плейсхолдер */}
					</div>
				);
			}
		}
		return (
			<div
				className={styles.column}
				key={`col-${columnIndex}`}
				// Вешаем реф только на первую колонку для измерений
				ref={isFirstColumn ? columnRef : null}
			>
				{itemsInColumn}
			</div>
		);
	}, []); // Зависимостей нет

	// --- Основной useLayoutEffect для всей магии GSAP ---
	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		const contentWrapperElement = contentWrapperRef.current;

		// Ждем рефы и проверяем флаг инициализации
		if (!containerElement || !contentWrapperElement || isInitialized.current) {
			return;
		}
		console.log("IFG: Initializing...");

		// --- Функция расчета размеров ---
		const calculateDimensions = (): GridDimensions | null => {
			const firstColumn = columnRef.current;
			const firstItem = itemRef.current;
			if (!firstColumn || !firstItem) {
				console.warn("IFG: Column or Item ref not available for measurement yet.");
				return null;
			}
			const computedStyleColumn = window.getComputedStyle(firstColumn);
			const computedStyleWrapper = window.getComputedStyle(contentWrapperElement);
			const viewportWidth = containerElement.clientWidth;
			const viewportHeight = containerElement.clientHeight;
			const colRect = firstColumn.getBoundingClientRect();
			const itemRect = firstItem.getBoundingClientRect();
			const columnWidth = colRect.width;
			const itemHeight = itemRect.height;
			const columnGap = parseFloat(computedStyleWrapper.columnGap) || 0;
			const rowGap = parseFloat(computedStyleColumn.rowGap) || 0;

			if (!viewportWidth || !viewportHeight || !columnWidth || !itemHeight || !Number.isFinite(columnWidth) || !Number.isFinite(itemHeight)) {
				console.error("IFG: Failed to get valid dimensions.", { viewportWidth, viewportHeight, columnWidth, itemHeight });
				return null;
			}
			const totalContentLogicalWidth = COLS * columnWidth + Math.max(0, COLS - 1) * columnGap;
			const totalContentHeight = ROWS * itemHeight + Math.max(0, ROWS - 1) * rowGap;
			const wrapX = gsap.utils.wrap(-totalContentLogicalWidth, 0);
			const minY = 0;
			const maxY = Math.min(0, viewportHeight - totalContentHeight);
			const scrollableDistanceY = Math.max(0, totalContentHeight - viewportHeight);

			const newDimensions: GridDimensions = {
				viewportWidth, viewportHeight, columnWidth, itemHeight, rowGap, columnGap,
				totalContentLogicalWidth, totalContentHeight, wrapX, minY, maxY,
				scrollableDistanceY
			};
			console.log("IFG: Dimensions calculated", newDimensions);
			dimensionsRef.current = newDimensions;
			return newDimensions;
		};

		// --- Создание контекста GSAP ---
		gsapCtx.current = gsap.context(() => {
			console.log("IFG: GSAP Context created.");

			// --- Функция для (пере)создания quickTo ---
			const setupQuickTo = (dims: GridDimensions) => {
				xToRef.current = gsap.quickTo(contentWrapperElement, "x", {
					duration: 0.8, ease: "power3.out",
					modifiers: { x: gsap.utils.unitize(value => dims.wrapX(parseFloat(value as string)), "px") }
				});
				yToRef.current = gsap.quickTo(contentWrapperElement, "y", {
					duration: 0.5, ease: "power3.out"
				});
				console.log("IFG: QuickTo instances created/updated.");
			};

			// --- Инициализация Observer ---
			if (!observerInstance.current) {
				console.log("IFG: Creating Observer instance.");
				observerInstance.current = Observer.create({
					target: containerElement, // Слушаем сам контейнер
					type: "wheel,touch,pointer",
					preventDefault: false, // Управляем вручную
					tolerance: 5,
					dragMinimum: 3,

					onChangeX: (self) => {
						if (!isScrollLockedRef.current || !xToRef.current || !dimensionsRef.current) return;
						if (Math.abs(self.deltaX) < Math.abs(self.deltaY)) return;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						if (self.event.type === "wheel") incrX.current -= self.deltaX * multiplier;
						else incrX.current += self.deltaX * multiplier;
						xToRef.current(incrX.current);
						if (Math.abs(self.deltaX) > 0.5) {
							// console.log("IFG: Preventing default for horizontal scroll");
							self.event.preventDefault();
						}
					},
					onChangeY: (self) => {
						if (!isScrollLockedRef.current || !yToRef.current || !dimensionsRef.current) return;
						// Игнорируем, если горизонтальное движение доминирует
						if (Math.abs(self.deltaY) < Math.abs(self.deltaX)) return;

						const dims = dimensionsRef.current;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						const currentY = gsap.getProperty(contentWrapperElement, "y") as number;
						const isScrollingDown = self.deltaY > 0;
						const isScrollingUp = self.deltaY < 0;
						const tolerance = 1; // Допуск для сравнения
						const isStrictlyAtBottom = currentY <= dims.maxY + tolerance;
						const isStrictlyAtTop = currentY >= dims.minY - tolerance;

						let shouldPreventDefault = true; // По умолчанию - предотвращаем

						// *** ИЗМЕНЕННАЯ ЛОГИКА ГРАНИЦ для PIN ***
						// Если мы на границе И скроллим ОТ нее (внутрь контента) - предотвращаем
						if ((isStrictlyAtBottom && isScrollingUp) || (isStrictlyAtTop && isScrollingDown)) {
							shouldPreventDefault = true;
							// console.log(`IFG: At boundary, scrolling inwards. Preventing default.`);
						}
						// Если мы на границе И скроллим К ней (пытаемся выйти из пина) - НЕ предотвращаем
						else if ((isStrictlyAtBottom && isScrollingDown) || (isStrictlyAtTop && isScrollingUp)) {
							shouldPreventDefault = false;
							console.log(`IFG: At boundary, scrolling outwards. NOT preventing default.`);
							// Прилепляем к границе, если чуть вышли
							const targetY = isScrollingDown ? dims.maxY : dims.minY;
							if (currentY !== targetY) { incrY.current = targetY; yToRef.current(targetY); }
						}
						// Если мы НЕ на границе - предотвращаем (позволяем внутренний скролл)
						else {
							shouldPreventDefault = true;
						}

						// Если НЕ нужно предотвращать скролл страницы, то и двигать внутренний контент не надо
						if (shouldPreventDefault) {
							// Накапливаем и двигаем внутренний контент
							if (self.event.type === "wheel") incrY.current -= self.deltaY * multiplier;
							else incrY.current += self.deltaY * multiplier;
							const clampedY = gsap.utils.clamp(dims.maxY, dims.minY, incrY.current);
							incrY.current = clampedY;
							yToRef.current(clampedY);

							// Предотвращаем скролл страницы
							// console.log("IFG: Scrolling internally. Preventing default.");
							self.event.preventDefault();
						}
					},
				});
				observerInstance.current.disable(); // Сразу выключаем
				console.log("IFG: Observer created and immediately DISABLED.");
			}


			// --- Инициализация ScrollTrigger ---
			if (!scrollTriggerInstance.current) {
				console.log("IFG: Creating ScrollTrigger instance with PIN.");
				scrollTriggerInstance.current = ScrollTrigger.create({
					trigger: containerElement,
					start: "top top",
					end: () => `+=${dimensionsRef.current?.scrollableDistanceY ?? containerElement.clientHeight}`,
					pin: true,
					pinSpacing: true,
					anticipatePin: 1,
					// markers: true, // Показать маркеры для отладки
					invalidateOnRefresh: true, // Пересчитывать при рефреше

					onToggle: (self) => {
						console.log(`IFG: ScrollTrigger toggle. isActive: ${self.isActive}, direction: ${self.direction}`);
						setScrollLocked(self.isActive); // Включаем/выключаем Observer

						// *** УМНЫЙ СБРОС ПОЗИЦИИ Y при активации пина ***
						if (self.isActive) {
							const dims = dimensionsRef.current;
							if (dims) {
								// Определяем целевую позицию в зависимости от направления входа
								const targetY = self.direction === 1 ? dims.minY : dims.maxY;
								console.log(`IFG: Pin activated (direction: ${self.direction}). Setting internal Y to: ${targetY}`);
								incrY.current = targetY;
								// Устанавливаем позицию немедленно и обновляем quickTo
								gsap.set(contentWrapperElement, { y: targetY });
								yToRef.current?.(targetY); // Синхронизируем quickTo
							}
						}
					},
					// onUpdate: self => { console.log("Pin progress:", self.progress.toFixed(3)); } // Для отладки
				});
			}

			// --- Инициализация ResizeObserver ---
			const debouncedResizeHandler = debounce(() => {
				console.log("IFG: Resize detected, recalculating...");
				const newDims = calculateDimensions();

				if (newDims && gsapCtx.current) {
					gsapCtx.current.add(() => {
						setupQuickTo(newDims);
						incrX.current = 0;
						// Clamp Y к новым границам, но используем текущее значение incrY
						incrY.current = gsap.utils.clamp(newDims.maxY, newDims.minY, incrY.current);
						gsap.set(contentWrapperElement, { x: 0, y: incrY.current });
						console.log("IFG: Position reset/adjusted after resize.");
					});
				}
				// Обновляем ScrollTrigger ПОСЛЕ наших расчетов.
				// Он сам пересчитает end, так как он задан функцией.
				ScrollTrigger.refresh();
				console.log("IFG: ScrollTrigger refreshed.");
			}, DEBOUNCE_RESIZE_MS);

			resizeObserverRef.current = new ResizeObserver(debouncedResizeHandler);
			resizeObserverRef.current.observe(containerElement); // Наблюдаем за ИЗМЕНЕНИЕМ РАЗМЕРА контейнера

			// --- Первоначальный расчет и настройка ---
			const initialDims = calculateDimensions();
			if (initialDims) {
				setupQuickTo(initialDims); // Создаем quickTo
				gsap.set(contentWrapperElement, { x: 0, y: 0 }); // Ставим в начальную позицию
				incrX.current = 0;
				incrY.current = 0;
				isInitialized.current = true; // Ставим флаг, что инициализация прошла

				// Обновляем ScrollTrigger ПОСЛЕ расчетов и рендеринга
				ScrollTrigger.refresh();
				console.log("IFG: Initial ScrollTrigger refresh.");

				// Проверяем начальное состояние блокировки (с небольшой задержкой)
				setTimeout(() => {
					// Перепроверяем инстанс на случай быстрого размонтирования
					if (scrollTriggerInstance.current) {
						setScrollLocked(scrollTriggerInstance.current.isActive);
						console.log("IFG: Initialization complete. Initial lock state checked:", isScrollLockedRef.current);
					}
				}, 0);

			} else {
				console.error("IFG: Failed to get initial dimensions. Component might not work.");
			}

		}, containerRef); // Привязываем контекст GSAP к containerRef

		// --- Функция очистки при размонтировании компонента ---
		return () => {
			console.log("IFG: Cleaning up...");
			// 1. Отключаем ResizeObserver
			resizeObserverRef.current?.disconnect();
			// 2. Убиваем все, что создано в контексте GSAP
			gsapCtx.current?.revert();
			// 3. Убираем класс с body
			document.body.classList.remove('ifg-locked');
			// 4. Сбрасываем все рефы
			resizeObserverRef.current = null;
			observerInstance.current = null;
			scrollTriggerInstance.current = null;
			gsapCtx.current = null;
			xToRef.current = null;
			yToRef.current = null;
			dimensionsRef.current = null;
			isInitialized.current = false; // Сброс флага
			isScrollLockedRef.current = false; // Сброс состояния блокировки
			console.log("IFG: Cleanup complete.");
		};

	}, [renderColumn, setScrollLocked]); // Зависимости useLayoutEffect

	// --- JSX Разметка ---
	return (
		// Добавляем CSS класс, когда скролл заблокирован
		<section
			className={`${styles.mwg_effect} ${isLockedState ? styles.isLocked : ''}`}
			ref={containerRef}
		>
			<div className={styles.contentWrapper} ref={contentWrapperRef}>
				{/* Рендерим необходимое количество колонок */}
				{Array.from({ length: RENDER_COLS }).map((_, index) =>
					renderColumn(index)
				)}
			</div>
			{/* Опциональный оверлей для отладки */}
			{/* <div className={styles.overlay}>Locked: {isLockedState.toString()} | Y: {incrY.current.toFixed(0)} | MaxY: {dimensionsRef.current?.maxY.toFixed(0)} | Dir: {scrollTriggerInstance.current?.direction}</div> */}
		</section>
	);
};