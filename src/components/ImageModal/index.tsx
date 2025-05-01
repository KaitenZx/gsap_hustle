import React, { useEffect, useState } from 'react';

import styles from './index.module.scss'; // Импортируем стили

type ImageModalProps = {
	src: string;
	placeholderSrc?: string; // Добавляем опциональный плейсхолдер
	alt?: string; // Добавим alt для доступности
	onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, placeholderSrc, alt = "Full size view", onClose }) => {

	const [isLoaded, setIsLoaded] = useState(false);
	// Убираем placeholderSrc из начального значения. Всегда начинаем с основного src,
	// но будем скрывать его или применять стили, пока isLoaded = false.
	// const [currentSrc, setCurrentSrc] = useState(placeholderSrc || src); // <<< УДАЛИТЬ

	// --- Эффект для загрузки полного изображения ---
	useEffect(() => {
		// Сбросим isLoaded при смене src
		setIsLoaded(false);

		let isMounted = true; // Флаг для отслеживания размонтирования
		const img = new Image();
		img.onload = () => {
			// Обновляем флаг загрузки, только если компонент еще смонтирован
			if (isMounted) {
				// setCurrentSrc(src); // <<< УДАЛИТЬ (currentSrc больше не нужен)
				setIsLoaded(true);
			}
		};
		img.onerror = () => {
			// Обработка ошибки загрузки (опционально)
			// Можно установить isLoaded в true, чтобы показать сломанную иконку,
			// или оставить false, чтобы показать плейсхолдер.
			if (isMounted) {
				console.error(`Failed to load image: ${src}`);
				setIsLoaded(true); // Показать alt текст / иконку ошибки
			}
		}
		img.src = src; // Начинаем загрузку основного изображения

		// Функция очистки: если компонент размонтируется до загрузки
		return () => {
			isMounted = false;
		};
		// Зависимость только от основного src
	}, [src]);

	// --- Эффект для блокировки скролла body и обработки Escape ---
	useEffect(() => {
		// Блокируем скролл основной страницы
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		// Обработчик нажатия Escape
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		// Функция очистки
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			document.body.style.overflow = originalOverflow; // Восстанавливаем скролл
		};
	}, [onClose]); // Зависимость от onClose

	// --- Обработчики кликов ---

	// Обработчик нажатия Enter/Space на оверлее для закрытия
	const handleOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault(); // Предотвращаем стандартное действие (например, скролл пробелом)
			onClose();
		}
	};

	return (
		// Меняем onClick, чтобы закрывать по любому клику внутри
		<div
			className={styles.overlay}
			onClick={onClose} // Закрываем по любому клику внутри
			onKeyDown={handleOverlayKeyDown} // Закрываем по Enter/Space
			role="button"
			aria-label="Close modal"
			tabIndex={0} // Делаем оверлей фокусируемым
			style={{ cursor: 'pointer' }} // Указываем, что фон кликабельный
		>
			<div
				className={styles.modalContent}
				role="dialog"
				aria-modal="true"
				aria-label={alt}
				// Применяем плейсхолдер как фон, пока isLoaded = false
				style={!isLoaded && placeholderSrc ? {
					backgroundImage: `url("${placeholderSrc}")`,
					backgroundSize: 'contain', // Масштабирует фон, сохраняя пропорции
					backgroundRepeat: 'no-repeat',
					backgroundPosition: 'center center',
				} : {}}
			>

				<img
					// src={currentSrc} // <<< ИЗМЕНИТЬ
					src={src} // Всегда используем основной src
					alt={alt}
					// Добавляем стиль для скрытия img, пока он не загружен, если есть плейсхолдер
					className={`${styles.modalImage} ${isLoaded ? styles.loaded : styles.loadingWithPlaceholder}`}
					style={{
						// Можно управлять видимостью через стили, чтобы избежать "прыжка"
						// opacity: isLoaded ? 1 : 0,
						// transition: 'opacity 0.3s ease-in-out',
					}}
				/>
			</div>
		</div>
	);
};

