import React, { useEffect, useState } from 'react';

import styles from './index.module.scss';
type ImageModalProps = {
	src: string;
	placeholderSrc?: string; // Плейсхолдер теперь обязателен для этой стратегии
	alt?: string;
	onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, placeholderSrc, alt = "Full size view", onClose }) => {

	const [isLoaded, setIsLoaded] = useState(false);

	// --- Эффект предзагрузки основного изображения ---
	useEffect(() => {
		setIsLoaded(false);
		if (!src) return; // Не грузить, если нет src

		let isMounted = true;
		const img = new Image();
		img.onload = () => {
			if (isMounted) {
				setIsLoaded(true);
			}
		};
		img.onerror = () => {
			if (isMounted) {
				console.error(`Failed to load image: ${src}`);
				// В случае ошибки, все равно считаем "загруженным", чтобы скрыть плейсхолдер
				// и показать сломанное изображение или alt текст
				setIsLoaded(true);
			}
		}
		img.src = src;

		return () => {
			isMounted = false;
		};
	}, [src]);

	// --- Эффект для блокировки скролла body и обработки Escape ---
	useEffect(() => {
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			document.body.style.overflow = originalOverflow;
		};
	}, [onClose]);

	// Обработчик нажатия Enter/Space на оверлее
	const handleOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClose();
		}
	};

	return (
		<div
			className={styles.overlay}
			onClick={onClose}
			onKeyDown={handleOverlayKeyDown}
			role="button"
			aria-label="Close modal"
			tabIndex={0}
			style={{ cursor: 'pointer' }}
			data-interactive-cursor="true"
		>
			<div
				className={styles.modalContent}
				role="dialog"
				aria-modal="true"
				aria-label={alt}
			// Убираем старый style для backgroundImage
			>
				{/* Плейсхолдер */}
				{placeholderSrc && (
					<img
						src={placeholderSrc}
						alt="Loading..." // Alt для плейсхолдера
						className={`${styles.placeholderImage} ${isLoaded ? styles.mainLoaded : ''}`}
						aria-hidden="true" // Скрываем от скринридеров, т.к. есть основное изображение
					/>
				)}

				{/* Основное изображение */}
				<img
					src={src}
					alt={alt}
					className={`${styles.modalImage} ${isLoaded ? styles.loaded : ''}`}
					// Можно добавить onError для отображения fallback UI, если src не загрузился
					onError={(e) => {
						// Например, скрыть img или показать иконку ошибки
						// (Хотя isLoaded все равно будет true из-за useEffect)
						console.error("Image failed to render:", src);
						(e.target as HTMLImageElement).style.opacity = '0'; // Скрыть сломанное изображение
					}}
				/>
			</div>
		</div>
	);
};

