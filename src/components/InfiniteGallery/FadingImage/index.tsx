import React, { useRef, useLayoutEffect } from 'react';

import styles from './index.module.scss';

interface FadingImageProps {
	src: string;
	alt: string;
	className?: string;
}

export const FadingImage: React.FC<FadingImageProps> = ({
	src,
	alt,
	className,
}) => {
	const imgRef = useRef<HTMLImageElement>(null);

	useLayoutEffect(() => {
		const imgNode = imgRef.current;
		if (!imgNode) return;

		let isMounted = true;

		const handleLoad = () => {
			if (imgRef.current && isMounted) {
				imgRef.current.classList.add(styles.imageLoaded);
			}
		};

		if (imgNode.complete) {
			handleLoad();
		}

		imgNode.addEventListener('load', handleLoad);

		return () => {
			isMounted = false;
			imgNode.removeEventListener('load', handleLoad);
		};
	}, [src]);

	return (
		<img
			ref={imgRef}
			src={src}
			alt={alt}
			decoding="async"
			className={`${styles.image} ${className || ''}`}
		/>
	);
}; 