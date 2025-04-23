import React, { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import styles from './index.module.scss';



import img1 from '../assets/media/img1.jpeg';
import img2 from '../assets/media/img2.jpeg';
import img3 from '../assets/media/img3.jpeg';
import img4 from '../assets/media/img4.jpeg';
import img5 from '../assets/media/img5.jpeg';
import img6 from '../assets/media/img6.jpeg';
import img7 from '../assets/media/img7.jpeg';
import img8 from '../assets/media/img8.jpeg';


const imageUrls = [img1, img2, img3, img4, img5, img6, img7, img8];


// Количество медиа-элементов, одновременно видимых и анимируемых на экране.
// Это число влияет на длительность анимации и параметры stagger.
const VISIBLE_MEDIA_COUNT = 8;

// --- Компонент ---

const Effect012: React.FC = () => {
	// --- Ссылки (Refs) ---
	// Используем useRef для получения прямых ссылок на DOM-элементы без необходимости querySelector
	// и для хранения значений, которые должны сохраняться между рендерами без их вызова.

	// Ссылка на корневой DOM-элемент <section> компонента. Используется для контекста GSAP и слушателя мыши.
	const rootRef = useRef<HTMLElement>(null);
	// Ссылка на DOM-элемент .container, к которому применяются 3D-трансформации (вращение).
	const containerRef = useRef<HTMLDivElement>(null);
	// Массив ссылок на DOM-элементы .media (основные контейнеры для картинок).
	const mediaRefs = useRef<(HTMLDivElement | null)[]>([]);
	// Массив ссылок на DOM-элементы <img> внутри .media.
	const mediaImageRefs = useRef<(HTMLImageElement | null)[]>([]);
	// Массив для хранения URL-адресов изображений, полученных из секции предзагрузки.
	const loadedUrlsRef = useRef<string[]>([]);
	// Индекс текущего изображения для циклического переключения URL в `updateMedia`.
	const imageIndexRef = useRef<number>(0);
	// Ссылка на основной таймлайн GSAP, управляющий всей анимацией.
	const timelineRef = useRef<gsap.core.Timeline | null>(null);
	// Объект для хранения значения `delta`, которое будет плавно анимироваться `quickTo` для скролла.
	const deltaObjectRef = useRef<{ delta: number }>({ delta: 0 });
	// ID таймера (`setTimeout`) для сброса скорости скролла после паузы.
	const isWheelingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Накопленное значение времени для установки `.time()` основного таймлайна.
	const incrRef = useRef<number>(0);

	// --- Вспомогательные функции ---

	/**
	 * Обновляет состояние одного медиа-элемента:
	 * - Устанавливает случайную позицию X/Y для контейнера .media.
	 * - Устанавливает начальную Z-позицию для контейнера .media (далеко).
	 * - Устанавливает начальный масштаб scale: 0 для элемента <img> внутри.
	 * - Назначает следующий URL из `loadedUrlsRef` для элемента <img>.
	 * Вызывается при инициализации и при каждом 'повторе' анимации элемента (onRepeat).
	 * @param mediaElement - DOM-элемент .media для обновления.
	 */
	const updateMedia = (mediaElement: HTMLDivElement | null) => {
		if (!mediaElement) return; // Проверка на null

		// Устанавливаем позицию и начальное Z для родительского div.media
		gsap.set(mediaElement, {
			xPercent: -50, // Центрируем элемент по горизонтали относительно его точки X
			yPercent: -50, // Центрируем элемент по вертикали относительно его точки Y
			// Случайная позиция X в пределах от 20% до 80% ширины окна
			x: () => (Math.random() * (0.8 - 0.2) + 0.2) * window.innerWidth,
			// Случайная позиция Y в пределах от 20% до 80% высоты окна
			y: () => (Math.random() * (0.8 - 0.2) + 0.2) * window.innerHeight,
			// Начальная позиция по оси Z (глубина). -300vw эквивалентно -300 * ширина окна / 100.
			z: () => -300 * window.innerWidth / 100,
		});

		const imgElement = mediaElement.querySelector('img'); // Находим дочерний img
		if (imgElement) {
			// Устанавливаем начальный масштаб scale: 0 для самого изображения img
			gsap.set(imgElement, { scale: 0 });

			// Назначаем следующий URL картинки, если URL'ы были загружены
			if (loadedUrlsRef.current.length > 0) {
				// Увеличиваем индекс и используем остаток от деления (%) для зацикливания
				imageIndexRef.current = (imageIndexRef.current + 1) % loadedUrlsRef.current.length;
				// Устанавливаем атрибут src
				imgElement.setAttribute('src', loadedUrlsRef.current[imageIndexRef.current]);
			}
		}
	};

	/**
	 * Функция, выполняемая на каждый "тик" (кадр) анимационного цикла GSAP.
	 * Обновляет текущее время основного таймлайна на основе времени кадра и скорости скролла.
	 * @param _time - Общее время выполнения GSAP (не используется здесь).
	 * @param deltaTime - Время в миллисекундах с предыдущего тика.
	 * @param _frame - Номер кадра (не используется здесь).
	 */
	const tick = (_time: number, deltaTime: number, _frame: number) => {
		// Переводим deltaTime из миллисекунд в секунды
		const dtSeconds = deltaTime / 1000;
		// Получаем коэффициент скорости от скролла (изменяемый через quickTo)
		// Делим на 300 для уменьшения влияния (подбирается экспериментально)
		const scrollSpeedFactor = deltaObjectRef.current.delta / 300;

		// Обновляем накопленное время таймлайна: базовая скорость (dtSeconds) + скорость скролла
		incrRef.current += scrollSpeedFactor + dtSeconds;

		// Если таймлайн существует, устанавливаем его текущее время
		if (timelineRef.current) {
			// .time() устанавливает абсолютное время таймлайна. GSAP сам обработает
			// внутренние повторы (repeat) и задержки (delay) в stagger-анимациях.
			timelineRef.current.time(incrRef.current);
		}
	};

	/**
	 * Обработчик события прокрутки колеса мыши (`wheel`).
	 * Использует gsap.quickTo для плавного изменения значения скорости скролла.
	 * Запускает таймер для сброса скорости до 0 при отсутствии скролла.
	 * @param event - Событие WheelEvent.
	 * @param deltaTo - Функция gsap.quickTo для изменения `deltaObjectRef.current.delta`.
	 */
	const handleWheel = (event: WheelEvent, deltaTo: gsap.QuickToFunc | null) => {
		if (!deltaTo) return; // Проверка наличия quickTo функции

		// Вызываем quickTo, передавая ему значение event.deltaY (вертикальная прокрутка)
		// GSAP плавно анимирует deltaObjectRef.current.delta к этому значению.
		deltaTo(event.deltaY);

		// Очищаем предыдущий таймер сброса, если он был
		if (isWheelingTimeoutRef.current) clearTimeout(isWheelingTimeoutRef.current);

		// Устанавливаем новый таймер: через 120мс бездействия плавно вернем delta к 0
		isWheelingTimeoutRef.current = setTimeout(() => {
			deltaTo(0); // Плавно анимируем delta к 0
			isWheelingTimeoutRef.current = null; // Сбрасываем ID таймера
		}, 120); // Время бездействия в мс
	};

	/**
	 * Обработчик события движения мыши (`mousemove`).
	 * Рассчитывает вращение контейнера на основе положения курсора.
	 * Использует gsap.quickTo для плавного применения вращения.
	 * @param event - Событие MouseEvent.
	 * @param rotYQuickTo - Функция quickTo для rotationY.
	 * @param rotXQuickTo - Функция quickTo для rotationX.
	 */
	const handleMouseMove = (
		event: MouseEvent,
		rotYQuickTo: gsap.QuickToFunc | null,
		rotXQuickTo: gsap.QuickToFunc | null
	) => {
		// Проверяем наличие quickTo функций и размеров окна
		if (!rotYQuickTo || !rotXQuickTo || !window.innerWidth || !window.innerHeight) return;

		// Нормализуем координаты мыши: от -0.5 до 0.5 относительно центра окна
		const normalizedX = (event.clientX / window.innerWidth) - 0.5;
		const normalizedY = (event.clientY / window.innerHeight) - 0.5;

		// Рассчитываем углы вращения. Множитель 10 усиливает эффект (можно настроить).
		const rotationYValue = normalizedX * 10;
		const rotationXValue = normalizedY * 10;

		// Вызываем quickTo для плавного поворота контейнера
		rotYQuickTo(rotationYValue); // Вращение вокруг Y зависит от X-позиции мыши
		rotXQuickTo(-rotationXValue); // Вращение вокруг X зависит от Y-позиции (инвертируем для естественности)
	};


	// --- Основной эффект инициализации и очистки ---
	// Используем useLayoutEffect, т.к. он выполняется синхронно после DOM-мутаций,
	// что позволяет GSAP применить начальные стили ДО того, как браузер отрисует кадр,
	// избегая "мелькания" или "прыжка" из исходных CSS-стилей.
	useLayoutEffect(() => {

		// --- 1. Сбор URL изображений (выполняется только один раз при монтировании) ---
		if (rootRef.current && loadedUrlsRef.current.length === 0) {
			const preloadImages = rootRef.current.querySelectorAll<HTMLImageElement>(`.${styles.preloadMedias} img`);
			preloadImages.forEach(img => {
				// Проверяем, что src не пустой и не равен адресу текущей страницы (браузеры могут так делать)
				if (img.src && img.src !== window.location.href) {
					loadedUrlsRef.current.push(img.src);
				}
			});
			console.log('Preloaded image URLs:', loadedUrlsRef.current);
			// Предупреждение, если URL не найдены
			if (loadedUrlsRef.current.length === 0) {
				console.warn("Warning: No image URLs were preloaded. Check image paths and the '.preloadMedias' div.");
			}
		}

		// Переменные для хранения экземпляров quickTo и обработчиков событий.
		// Они нужны для корректного удаления в функции очистки контекста.
		let deltaToInstance: gsap.QuickToFunc | null = null;
		let rotYInstance: gsap.QuickToFunc | null = null;
		let rotXInstance: gsap.QuickToFunc | null = null;
		let wheelHandler: ((event: WheelEvent) => void) | null = null;
		let mouseMoveHandler: ((event: MouseEvent) => void) | null = null;

		// --- 2. GSAP Контекст ---
		// gsap.context() - это КЛЮЧЕВАЯ функция для использования GSAP в React.
		// Она создает "песочницу" для всех GSAP-анимаций, твинов, таймлайнов, тикеров и т.д.,
		// созданных внутри её колбэка. Функция, возвращаемая из context(),
		// позволяет "откатить" (revert) все эти изменения и очистить память.
		const ctx = gsap.context(() => {

			// --- 2.1 Валидация перед инициализацией анимации ---
			if (loadedUrlsRef.current.length === 0) {
				console.error("Cannot initialize animation: No preloaded images found.");
				return; // Прерываем инициализацию, если нет картинок
			}
			// Фильтруем массивы рефов, чтобы получить только реальные DOM-элементы
			const validMediaElements = mediaRefs.current.filter(el => el !== null) as HTMLDivElement[];
			const validMediaImageElements = mediaImageRefs.current.filter(img => img !== null) as HTMLImageElement[];
			// Проверяем, что количество элементов совпадает и они существуют
			if (validMediaElements.length === 0 || validMediaImageElements.length !== validMediaElements.length) {
				console.error("Cannot initialize animation: Media elements or image elements missing or mismatch.");
				return; // Прерываем, если элементы не найдены или их количество не совпадает
			}

			// --- 2.2 Начальная установка состояний элементов ---
			// Применяем начальные позиции, Z, scale и первую картинку ко всем видимым элементам
			validMediaElements.forEach(updateMedia);
			console.log('Initial media positions and states set.');

			// --- 2.3 Создание основного таймлайна анимации ---
			const tl = gsap.timeline({
				paused: true, // Начинаем с паузы, т.к. время будет управляться вручную через `tick()`
			});

			// --- 2.3.1 Анимация движения по оси Z ---
			// Анимируем Z-координату для контейнеров .media
			tl.to(validMediaElements, {
				z: 0, // Конечное значение Z (у экрана)
				duration: VISIBLE_MEDIA_COUNT, // Длительность равна количеству элементов (8 сек)
				ease: "none", // Линейное движение без ускорения/замедления
				stagger: { // Объект для управления анимацией нескольких элементов с задержкой
					each: 1, // Каждый следующий элемент начинает анимацию через 1 секунду
					repeat: -1, // Анимация КАЖДОГО элемента повторяется бесконечно
					// Функция, вызываемая при каждом повторе анимации ОДНОГО элемента
					onRepeat: function (this: gsap.core.Tween) {
						// `this` здесь ссылается на конкретный Tween (анимацию) этого элемента
						// `this.targets()` возвращает массив целей этого твина (здесь будет 1 элемент)
						const targetMediaElement = this.targets()[0] as HTMLDivElement | null;
						// Вызываем updateMedia, чтобы сбросить элемент назад и сменить картинку
						updateMedia(targetMediaElement);
					},
				}
			}, 0); // Добавляем эту анимацию в самое начало таймлайна (позиция 0)

			// --- 2.3.2 Анимация ПОЯВЛЕНИЯ (Scale 0 -> 1) ---
			// Анимируем масштаб для элементов <img> внутри .media
			tl.fromTo(validMediaImageElements,
				{ scale: 0 }, // Начальное состояние (уже установлено в updateMedia)
				{
					scale: 1, // Конечное состояние
					duration: 0.6, // Короткая длительность анимации появления
					ease: "back.out(2)", // Эффект "выпрыгивания"
					stagger: {
						each: 1, // Синхронизируем со стартом Z-анимации каждого элемента
						repeat: -1, // Повторяем бесконечно для каждого img
						// Задержка перед СЛЕДУЮЩИМ повторением этой анимации scale-up.
						// Общий цикл = 8 сек, анимация = 0.6 сек. Задержка = 8 - 0.6 = 7.4 сек.
						repeatDelay: 7.4,
					}
				},
				"<" // Специальный параметр позиции: начать одновременно с предыдущей анимацией в таймлайне (т.е. с Z-анимацией)
			);

			// --- 2.3.3 Анимация ИСЧЕЗНОВЕНИЯ (Scale 1 -> 0) ---
			// Анимируем масштаб для элементов <img>
			tl.fromTo(validMediaImageElements,
				{ scale: 1 }, // Начальное состояние перед исчезновением
				{
					scale: 0, // Конечное состояние
					duration: 0.6, // Длительность исчезновения
					ease: "back.in(1.2)", // Эффект "втягивания"
					// ВАЖНО: т.к. свойство scale анимируется двумя твинами, immediateRender: false
					// предотвращает мгновенное применение начального состояния {scale: 1} этого твина,
					// что могло бы перебить начальное {scale: 0} из предыдущего твина.
					immediateRender: false,
					// Задержка перед НАЧАЛОМ самой первой анимации исчезновения.
					// Элемент должен исчезнуть прямо перед достижением z=0.
					// Цикл Z = 8 сек, анимация исчезновения = 0.6 сек. Старт на 8 - 0.6 = 7.4 сек.
					delay: 7.4,
					stagger: {
						each: 1, // Синхронизируем с Z-анимацией
						repeat: -1, // Повторяем бесконечно
						// Задержка перед СЛЕДУЮЩИМ повторением этой scale-down анимации.
						repeatDelay: 7.4,
						// Функция, вызываемая при каждом повторе анимации scale-down.
						onRepeat: function (this: gsap.core.Tween) {
							// Принудительно устанавливаем scale: 1 перед началом следующего цикла исчезновения,
							// чтобы гарантировать правильное начальное состояние для ease: "back.in".
							const targetImageElement = this.targets()[0] as Element | null; // Element совместим с TweenTarget
							if (targetImageElement) gsap.set(targetImageElement, { scale: 1 });
						}
					}
				},
				"<" // Начать одновременно с предыдущей (т.е. с Z-анимацией), но с учетом внутреннего `delay: 7.4`
			);

			// Сохраняем созданный таймлайн в реф для доступа из `tick()`
			timelineRef.current = tl;
			console.log('GSAP timeline created and configured.');

			// --- 2.4 Инициализация gsap.quickTo для плавных реакций ---
			// quickTo - это высокооптимизированная функция для частого обновления одного свойства.
			// Идеально для реакций на скролл или движение мыши.

			// quickTo для управления скоростью скролла (анимирует deltaObjectRef.current.delta)
			deltaToInstance = gsap.quickTo(deltaObjectRef.current, 'delta', {
				duration: 0.5, // Длительность "сглаживания" значения delta
				ease: "power1.out", // Изинг для плавности
			});
			console.log('GSAP quickTo for scroll delta initialized.');

			// quickTo для вращения контейнера по оси Y
			if (containerRef.current) { // Проверяем, что реф контейнера доступен
				rotYInstance = gsap.quickTo(containerRef.current, "rotationY", {
					duration: 0.5, // Плавность реакции на мышь
					ease: 'power1.out'
				});
				// quickTo для вращения контейнера по оси X
				rotXInstance = gsap.quickTo(containerRef.current, "rotationX", {
					duration: 0.5,
					ease: 'power1.out'
				});
				console.log('GSAP quickTo for container rotation initialized.');
			} else {
				console.error("Container ref is not available for rotation quickTo setup.");
			}

			// --- 2.5 Запуск тикера GSAP ---
			// gsap.ticker.add() добавляет функцию в основной цикл обновления GSAP (requestAnimationFrame).
			// Наша функция `tick` будет вызываться на каждом кадре.
			gsap.ticker.add(tick);
			console.log('GSAP ticker started with tick function.');

			// --- 2.6 Добавление обработчиков событий ---
			// Создаем обертку для handleWheel, чтобы передать актуальный `deltaToInstance`.
			wheelHandler = (event: WheelEvent) => handleWheel(event, deltaToInstance);
			window.addEventListener('wheel', wheelHandler, { passive: true }); // passive: true для оптимизации скролла
			console.log('Wheel event listener added.');

			// Добавляем обработчик движения мыши на корневой элемент секции
			if (rootRef.current && rotYInstance && rotXInstance) {
				// Создаем обертку для handleMouseMove, передавая актуальные quickTo для вращения.
				mouseMoveHandler = (event: MouseEvent) => handleMouseMove(event, rotYInstance, rotXInstance);
				rootRef.current.addEventListener('mousemove', mouseMoveHandler);
				console.log('Mousemove event listener added.');
			}

			// --- 2.7 Функция очистки для контекста GSAP ---
			// Эта функция будет вызвана ПЕРЕД тем, как сработает ctx.revert().
			// Здесь мы должны УДАЛИТЬ все, что не управляется напрямую GSAP:
			// слушатели событий и функции, добавленные в ticker.
			return () => {
				console.log('Context cleanup: Removing ticker and event listeners...');
				gsap.ticker.remove(tick); // Удаляем нашу функцию из тикера

				// Удаляем слушатель скролла с window
				if (wheelHandler) window.removeEventListener('wheel', wheelHandler);

				// Удаляем слушатель мыши с корневого элемента
				if (rootRef.current && mouseMoveHandler) {
					rootRef.current.removeEventListener('mousemove', mouseMoveHandler);
				}

				// Очищаем таймер сброса скорости, если он активен
				if (isWheelingTimeoutRef.current) clearTimeout(isWheelingTimeoutRef.current);

				console.log('Ticker and listeners removed.');
				// Все GSAP-сущности (timeline, quickTo, set-значения) будут очищены ниже вызовом ctx.revert()
			};

		}, rootRef); // Привязываем контекст к корневому элементу (rootRef.current)

		// --- 3. Функция очистки для useLayoutEffect ---
		// Эта функция вызывается при размонтировании компонента (или перед следующим запуском эффекта, если меняются зависимости).
		// Здесь мы вызываем ctx.revert() для очистки ВСЕХ GSAP-эффектов, созданных внутри контекста.
		return () => {
			console.log('Effect cleanup: Reverting GSAP context...');
			// ctx.revert() останавливает все анимации, удаляет все созданные твины/таймлайны,
			// сбрасывает все инлайн-стили, установленные GSAP через .set() или анимации, к их исходным значениям.
			ctx.revert();

			// Дополнительно сбрасываем значения рефов, которые могли измениться
			timelineRef.current = null;
			incrRef.current = 0;
			deltaObjectRef.current.delta = 0;

			console.log('GSAP context reverted.');

			// Опционально: Явно сбросить вращение контейнера, если revert не справился (редко)
			// if (containerRef.current) {
			//      gsap.set(containerRef.current, { rotationX: 0, rotationY: 0, overwrite: true });
			// }
		};

	}, []); // Пустой массив зависимостей `[]` означает, что эффект запустится 1 раз после монтирования и очистится 1 раз при размонтировании.

	// --- Рендер JSX ---
	return (
		// Привязываем реф к корневому элементу
		<section ref={rootRef} className={styles.mwg_effect012}>

			{/* Опциональный статический хедер */}
			<div className={styles.header}>
				<p>Lamps supply</p>
				<p>All our catalog</p>
				<p>008 models</p>
			</div>

			{/* Контейнер, к которому применяются 3D вращения */}
			{/* Привязываем реф к этому элементу */}
			<div ref={containerRef} className={styles.container}>

				{/* Динамически генерируем видимые медиа-элементы */}
				{Array.from({ length: VISIBLE_MEDIA_COUNT }).map((_, index) => (
					<div
						key={index} // Уникальный ключ для React
						className={styles.media} // Класс для стилизации и позиционирования
						// Используем callback ref для заполнения массива ссылок mediaRefs и mediaImageRefs
						ref={el => {
							// Сохраняем ссылку на DOM-элемент div.media
							mediaRefs.current[index] = el;
							if (el) {
								// Если элемент есть, находим и сохраняем ссылку на дочерний img
								mediaImageRefs.current[index] = el.querySelector('img');
							} else {
								// Если элемент удаляется (React может это делать), очищаем и ссылку на img
								if (mediaImageRefs.current[index]) {
									mediaImageRefs.current[index] = null;
								}
							}
						}}
					>
						{/* Изображение внутри. Атрибут src будет установлен динамически через updateMedia */}
						<img src="" alt={`Animated media ${index + 1}`} />
					</div>
				))}
			</div>

			{/* Скрытый блок для предзагрузки изображений */}
			{/* Это гарантирует, что изображения будут загружены браузером заранее */}
			<div className={styles.preloadMedias}>
				{imageUrls.map((url, index) => (
					<img key={index} src={url} alt={`Preload ${index + 1}`} />
				))}
			</div>
		</section>
	);
};

export default Effect012; // Экспортируем компонент для использования в других частях приложения