import React, { useEffect } from 'react';

import styles from './index.module.scss'; // Импортируем стили

type ImageModalProps = {
	src: string;
	alt?: string; // Добавим alt для доступности
	onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, alt = "Full size view", onClose }) => {

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
					src={src}
					alt={alt}
					className={styles.modalImage}
				/>
			</div>
		</div>
	);
};

