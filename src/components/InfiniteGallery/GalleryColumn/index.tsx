import React from 'react';

import { gsap } from 'gsap';

import { FadingImage } from '../FadingImage';
import {
	ITEMS,
	COLS,
	GalleryItem,
	RENDER_ROWS_BUFFER,
	ROWS,
} from '../lib/galleryData';
import { MediaAnimData } from '../lib/types';

import styles from './index.module.scss';

interface GalleryColumnProps {
	columnIndex: number;
	itemRef: React.RefObject<HTMLDivElement | null>;
	columnRef: React.RefObject<HTMLDivElement | null>;
	mediaAnimRefs: React.MutableRefObject<Map<string, MediaAnimData>>;
	handleImageClick: (item: GalleryItem) => void;
	handleInteractionStart: (fullSrc: string) => void;
	lqipMap: Record<string, string>;
}

export const GalleryColumn: React.FC<GalleryColumnProps> = ({
	columnIndex,
	itemRef,
	columnRef,
	mediaAnimRefs,
	handleImageClick,
	handleInteractionStart,
	lqipMap,
}) => {
	const isFirstColumn = columnIndex === 0;
	const itemsInColumn = [];
	const logicalColIndex = columnIndex % COLS;
	const baseItemIndex = logicalColIndex * ROWS;

	for (
		let renderRowIndex = 0;
		renderRowIndex < ROWS + RENDER_ROWS_BUFFER;
		renderRowIndex++
	) {
		const logicalRowIndex = renderRowIndex % ROWS;
		const itemIndex = baseItemIndex + logicalRowIndex;

		if (itemIndex < ITEMS.length && itemIndex >= 0) {
			const item: GalleryItem = ITEMS[itemIndex];
			const isFirstLogicalItem = renderRowIndex === 0;
			const itemKey = `${columnIndex}-${item.id}-${renderRowIndex}`;
			const lqipKey = `/assets/full/${item.id}.webp`;
			const lqipSrc = lqipMap[lqipKey];

			itemsInColumn.push(
				<div
					data-interactive-cursor="true"
					className={styles.media}
					key={itemKey}
					ref={(el: HTMLDivElement | null) => {
						if (isFirstColumn && isFirstLogicalItem) {
							(
								itemRef as React.MutableRefObject<HTMLDivElement | null>
							).current = el;
						}

						const currentMap = mediaAnimRefs.current;
						const existingEntry = currentMap.get(itemKey);

						if (el) {
							if (!existingEntry || existingEntry.element !== el) {
								const rotX = gsap.quickTo(el, 'rotationX', {
									duration: 0.5,
									ease: 'power3.out',
								});
								const rotY = gsap.quickTo(el, 'rotationY', {
									duration: 0.5,
									ease: 'power3.out',
								});
								currentMap.set(itemKey, {
									element: el,
									rotX,
									rotY,
									visualColumnIndex: columnIndex,
									visualRowIndexInColumn: renderRowIndex,
								});
							} else if (existingEntry && !existingEntry.rotX) {
								const rotX = gsap.quickTo(el, 'rotationX', {
									duration: 0.5,
									ease: 'power3.out',
								});
								const rotY = gsap.quickTo(el, 'rotationY', {
									duration: 0.5,
									ease: 'power3.out',
								});
								currentMap.set(itemKey, {
									...existingEntry,
									rotX,
									rotY,
									visualColumnIndex: columnIndex,
									visualRowIndexInColumn: renderRowIndex,
								});
							}
						} else {
							if (existingEntry) {
								currentMap.delete(itemKey);
							}
						}
					}}
					role="button"
					tabIndex={0}
					onClick={() => handleImageClick(item)}
					onMouseDown={() => handleInteractionStart(item.fullSrc)}
					onTouchStart={() => handleInteractionStart(item.fullSrc)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							handleInteractionStart(item.fullSrc);
							handleImageClick(item);
						}
					}}
					style={{
						backgroundImage: lqipSrc ? `url(${lqipSrc})` : 'none',
						cursor: 'pointer',
						pointerEvents: 'auto',
					}}
				>
					<FadingImage src={item.previewSrc} alt={item.alt} />
				</div>
			);
		} else {
			console.warn(
				`[IFG] renderColumn: Invalid itemIndex ${itemIndex} for column ${columnIndex}, row ${renderRowIndex}`
			);
		}
	}
	return (
		<div
			className={styles.column}
			key={`col-${columnIndex}`}
			ref={isFirstColumn ? columnRef : undefined}
			style={{ pointerEvents: 'none' }}
		>
			{itemsInColumn}
		</div>
	);
}; 