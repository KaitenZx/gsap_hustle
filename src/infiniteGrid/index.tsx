// src/InfiniteGrid/index.tsx

import React, { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { debounce } from 'lodash' // Используем debounce из lodash
import styles from './index.module.scss';

// --- Импорты изображений (остаются без изменений) ---
import img1 from '../assets/media/img1.jpeg';
import img2 from '../assets/media/img2.jpeg';
import img3 from '../assets/media/img3.jpeg';
import img4 from '../assets/media/img4.jpeg';
import img5 from '../assets/media/img5.jpeg';
import img6 from '../assets/media/img6.jpeg';
import img7 from '../assets/media/img7.jpeg';
import img8 from '../assets/media/img8.jpeg';
import img9 from '../assets/media/img9.jpeg';
import img10 from '../assets/media/img10.jpeg';
import img11 from '../assets/media/img11.jpeg';
import img12 from '../assets/media/img12.jpeg';
import img13 from '../assets/media/img13.jpeg';
import img14 from '../assets/media/img14.jpeg';
import img15 from '../assets/media/img15.jpeg';

// --- Регистрация плагина GSAP ---
// Лучше делать это один раз глобально, но оставляем здесь для полноты примера
gsap.registerPlugin(Observer);

// --- Константа с данными изображений (остается без изменений) ---
const IMAGES = [
	{ src: img1, alt: 'Image 1' },
	{ src: img2, alt: 'Image 2' },
	{ src: img3, alt: 'Image 3' },
	{ src: img4, alt: 'Image 4' },
	{ src: img5, alt: 'Image 5' },
	{ src: img6, alt: 'Image 6' },
	{ src: img7, alt: 'Image 7' },
	{ src: img8, alt: 'Image 8' },
	{ src: img9, alt: 'Image 9' },
	{ src: img10, alt: 'Image 10' },
	{ src: img11, alt: 'Image 11' },
	{ src: img12, alt: 'Image 12' },
	{ src: img13, alt: 'Image 13' },
	{ src: img14, alt: 'Image 14' },
	{ src: img15, alt: 'Image 15' },
] as const;

// --- Компонент InfiniteGrid ---
export const InfiniteGrid: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const observerInstance = useRef<Observer | null>(null);
	const incrX = useRef(0);
	const incrY = useRef(0);
	const gsapCtx = useRef<gsap.Context | null>(null);
	// --- Refs для хранения quickTo и ResizeObserver ---
	const xToRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
	const yToRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);
	// ---

	useLayoutEffect(() => {
		const containerElement = containerRef.current;
		if (!containerElement) {
			console.warn("InfiniteGrid: Container element not found.");
			return;
		}

		// --- Создание контекста GSAP ---
		gsapCtx.current = gsap.context(() => {
			console.log("InfiniteGrid: GSAP Context created.");

			// --- Функция для создания/обновления quickTo ---
			const setupQuickTo = (width: number, height: number) => {
				const halfX = width / 2;
				const halfY = height / 2;

				if (!halfX || !halfY || !Number.isFinite(halfX) || !Number.isFinite(halfY)) {
					console.error("InfiniteGrid: Invalid dimensions in setupQuickTo. Aborting.", { width, height, halfX, halfY });
					return;
				}
				console.log(`InfiniteGrid: Setting up QuickTo with dimensions: ${width.toFixed(0)}x${height.toFixed(0)}`);

				// Используем wrap как в оригинальном примере (-halfX, 0)
				const wrapX = gsap.utils.wrap(-halfX, 0);
				const wrapY = gsap.utils.wrap(-halfY, 0);

				// GSAP Context позаботится об очистке старых quickTo при revert,
				// но можно и вручную убить предыдущие, если нужно больше контроля:
				// xToRef.current?.kill();
				// yToRef.current?.kill();

				xToRef.current = gsap.quickTo(containerElement, "x", {
					duration: 0.8,
					ease: "power3.out",
					modifiers: {
						x: gsap.utils.unitize(value => {
							const parsedValue = parseFloat(value as string);
							const wrapped = wrapX(parsedValue);
							// console.log(`ModX: In=${parsedValue.toFixed(0)}, HalfX=${halfX.toFixed(0)}, Out=${wrapped.toFixed(0)}`);
							return wrapped;
						}, "px")
					}
				});

				yToRef.current = gsap.quickTo(containerElement, "y", {
					duration: 0.8,
					ease: "power3.out",
					modifiers: {
						y: gsap.utils.unitize(value => {
							const parsedValue = parseFloat(value as string);
							const wrapped = wrapY(parsedValue);
							return wrapped;
						}, "px")
					}
				});
			};
			// --- Конец функции setupQuickTo ---


			// --- Инициализация Observer (один раз) ---
			// Убедимся, что Observer не создается повторно при ресайзе
			if (!observerInstance.current) {
				console.log("InfiniteGrid: Creating Observer instance.");
				observerInstance.current = Observer.create({
					target: window,
					type: "wheel,touch,pointer",
					// preventDefault: true, // Раскомментировать при необходимости

					onChangeX: (self) => {
						// Вызываем quickTo только если он инициализирован
						if (!xToRef.current) return;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						if (self.event.type === "wheel") {
							incrX.current -= self.deltaX * multiplier;
						} else {
							incrX.current += self.deltaX * multiplier;
						}
						xToRef.current(incrX.current);
					},

					onChangeY: (self) => {
						// Вызываем quickTo только если он инициализирован
						if (!yToRef.current) return;
						const multiplier = self.event.type === "wheel" ? 1 : 1.5;
						if (self.event.type === "wheel") {
							incrY.current -= self.deltaY * multiplier;
						} else {
							incrY.current += self.deltaY * multiplier;
						}
						yToRef.current(incrY.current);
					},
				});
			}
			// --- Конец инициализации Observer ---


			// --- Инициализация ResizeObserver ---
			// Debounce обработчик ресайза
			const debouncedResizeHandler = debounce((entries: ResizeObserverEntry[]) => {
				for (let entry of entries) {
					// Используем contentBoxSize для получения размеров без padding/border
					// или fallback на contentRect для совместимости
					let width: number, height: number;
					if (entry.contentBoxSize) {
						// Предпочитаемый способ: массив, берем первый (основной)
						const contentBox = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
						width = contentBox.inlineSize;
						height = contentBox.blockSize;
					} else {
						// Fallback для старых браузеров
						width = entry.contentRect.width;
						height = entry.contentRect.height;
					}

					if (width > 0 && height > 0) {
						console.log("InfiniteGrid: ResizeObserver detected size change.");
						// Пересчитываем и обновляем quickTo
						setupQuickTo(width, height);
					} else {
						console.warn("InfiniteGrid: ResizeObserver reported zero dimensions.");
					}
				}
			}, 150); // Задержка debounce в 150ms

			// Создаем и сохраняем инстанс ResizeObserver
			resizeObserverRef.current = new ResizeObserver(debouncedResizeHandler);
			// Начинаем наблюдение за контейнером
			resizeObserverRef.current.observe(containerElement);
			// --- Конец инициализации ResizeObserver ---


			// --- Первоначальная настройка quickTo ---
			// Вызываем setupQuickTo с начальными размерами контейнера
			// clientWidth/clientHeight должны быть доступны здесь внутри useLayoutEffect
			if (containerElement.clientWidth > 0 && containerElement.clientHeight > 0) {
				setupQuickTo(containerElement.clientWidth, containerElement.clientHeight);
			} else {
				// Если размеры все еще 0, можно попробовать через getBoundingClientRect или отложить
				console.warn("InfiniteGrid: Initial clientWidth/clientHeight are zero. Trying getBoundingClientRect.");
				const initialRect = containerElement.getBoundingClientRect();
				if (initialRect.width > 0 && initialRect.height > 0) {
					setupQuickTo(initialRect.width, initialRect.height);
				} else {
					console.error("InfiniteGrid: Failed to get initial dimensions. Animation might not work correctly.");
					// Можно запланировать повторную попытку через requestAnimationFrame
				}
			}
			// --- Конец первоначальной настройки ---

		}, containerRef); // Привязываем контекст к containerRef

		// --- Функция очистки ---
		return () => {
			console.log("InfiniteGrid: Cleaning up GSAP Context, Observer, and ResizeObserver...");
			// 1. Отключаем ResizeObserver
			resizeObserverRef.current?.disconnect();
			// 2. Убиваем Observer
			observerInstance.current?.kill();
			// 3. Очищаем GSAP Context (убьет quickTo и другие анимации в контексте)
			gsapCtx.current?.revert();

			// 4. Сбрасываем все рефы (важно для чистоты)
			resizeObserverRef.current = null;
			observerInstance.current = null;
			gsapCtx.current = null;
			xToRef.current = null;
			yToRef.current = null;
			// Сброс накопленных значений не обязателен, если компонент полностью размонтируется
			// incrX.current = 0;
			// incrY.current = 0;
		};

	}, []); // Пустой массив зависимостей, т.к. ресайз обрабатывается ResizeObserver

	// Вспомогательная функция для рендеринга одного блока с изображениями
	// Добавляем опциональный параметр для aria-hidden
	const renderContentBlock = (isHidden = false) => (
		<div className={styles.content} aria-hidden={isHidden || undefined}>
			{IMAGES.map((image, index) => (
				<div className={styles.media} key={index}>
					<img src={image.src} alt={image.alt} loading="lazy" />
				</div>
			))}
		</div>
	);

	// JSX разметка компонента (остается без изменений, кроме aria-hidden)
	return (
		<section className={styles.mwg_effect026}>
			<div className={styles.container} ref={containerRef}>
				{renderContentBlock()}
				{renderContentBlock(true)}
				{renderContentBlock(true)}
				{renderContentBlock(true)}
			</div>
		</section>
	);
};