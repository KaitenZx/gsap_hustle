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
	// Изначально показываем плейсхолдер, если он есть, иначе сразу основной src
	const [currentSrc, setCurrentSrc] = useState(placeholderSrc || src);

	// --- Эффект для загрузки полного изображения, если есть плейсхолдер ---
	useEffect(() => {
		// Если не было плейсхолдера или изображение уже основное, ничего не делаем
		if (!placeholderSrc || currentSrc === src) {
			setIsLoaded(true); // Считаем загруженным
			return;
		}

		let isMounted = true; // Флаг для отслеживания размонтирования
		const img = new Image();
		img.onload = () => {
			// Обновляем src и ставим флаг загрузки, только если компонент еще смонтирован
			if (isMounted) {
				setCurrentSrc(src);
				setIsLoaded(true);
			}
		};
		img.src = src; // Начинаем загрузку основного изображения

		// Функция очистки: если компонент размонтируется до загрузки
		return () => {
			isMounted = false;
		};
		// Зависимости: основной src и плейсхолдер
	}, [src, placeholderSrc, currentSrc]);

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
			>

				<img
					src={currentSrc} // Используем текущий источник (плейсхолдер или основной)
					alt={alt}
					className={`${styles.modalImage} ${isLoaded ? styles.loaded : ''}`}
					style={{
						// Можно добавить инлайн-стиль для размытия, если не хотите менять CSS-файл
						// filter: isLoaded ? 'none' : 'blur(10px)',
						// transition: 'filter 0.3s ease-in-out',
					}}
				/>
			</div>
		</div>
	);
};

