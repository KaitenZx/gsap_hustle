import React, { useEffect, useState } from 'react';

import styles from './index.module.scss';
type ImageModalProps = {
	src: string;
	placeholderSrc?: string;
	alt?: string;
	onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, placeholderSrc, alt = "Full size view", onClose }) => {

	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		setIsLoaded(false);
		if (!src) return;

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
				setIsLoaded(true);
			}
		}
		img.src = src;

		return () => {
			isMounted = false;
		};
	}, [src]);

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
			>
				{placeholderSrc && (
					<img
						src={placeholderSrc}
						alt="Loading..."
						className={`${styles.placeholderImage} ${isLoaded ? styles.mainLoaded : ''}`}
						aria-hidden="true"
					/>
				)}

				<img
					src={src}
					alt={alt}
					className={`${styles.modalImage} ${isLoaded ? styles.loaded : ''}`}
					onError={(e) => {
						console.error("Image failed to render:", src);
						(e.target as HTMLImageElement).style.opacity = '0';
					}}
				/>
			</div>
		</div>
	);
};

