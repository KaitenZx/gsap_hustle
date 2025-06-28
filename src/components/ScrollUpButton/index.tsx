import React from 'react';
// Removed useState, useEffect, gsap, ScrollToPlugin as they are not needed for the base button yet

import styles from './index.module.scss';

// Define props interface
interface ScrollUpButtonProps {
	isVisible: boolean;
	onClick?: () => void;
}

export const ScrollUpButton: React.FC<ScrollUpButtonProps> = ({ isVisible, onClick }) => {

	const handleButtonClick = () => {
		onClick?.();
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			handleButtonClick();
		}
	};

	if (!isVisible) {
		return null;
	}

	return (
		<div
			data-interactive-cursor="true"
			className={`${styles.scrollUpButtonContainer} ${isVisible ? styles.visible : ''}`}
			onClick={handleButtonClick}
			style={{ cursor: 'pointer' }}
			role="button"
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			<span className={styles.arrowUp}>
				<svg width="800px" height="800px" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
					<rect width="16" height="16" id="icon-bound" fill="none" />
					<path d="M12.586,9.414L8,4.828L3.414,9.414L2,8L8,2L14,8L12.586,9.414Z M8.172,7.172L7.828,7.172L7.578,7.422L8.422,7.422L8.172,7.172Z M8.672,7.672L7.328,7.672L7.078,7.922L8.922,7.922L8.672,7.672Z M9.172,8.172L6.828,8.172L6.578,8.422L9.422,8.422L9.172,8.172Z M9.672,8.672L6.328,8.672L6.078,8.922L9.922,8.922L9.672,8.672Z M10.172,9.172L5.828,9.172L5.578,9.422L10.422,9.422L10.172,9.172Z M10.672,9.672L5.328,9.672L5.078,9.922L7.906,9.922L8,9.828L8.094,9.922L10.922,9.922L10.672,9.672Z M7.656,10.172L4.828,10.172L4.578,10.422L7.406,10.422L7.656,10.172Z M11.172,10.172L8.344,10.172L8.594,10.422L11.422,10.422L11.172,10.172Z M7.156,10.672L4.328,10.672L4.078,10.922L6.906,10.922L7.156,10.672Z M11.672,10.672L8.844,10.672L9.094,10.922L11.922,10.922L11.672,10.672Z M6.656,11.172L3.828,11.172L3.578,11.422L6.406,11.422L6.656,11.172Z M12.172,11.172L9.344,11.172L9.594,11.422L12.422,11.422L12.172,11.172Z M6.156,11.672L3.328,11.672L3.078,11.922L5.906,11.922L6.156,11.672Z M12.672,11.672L9.844,11.672L10.094,11.922L12.922,11.922L12.672,11.672Z M5.656,12.172L2.828,12.172L2.578,12.422L5.406,12.422L5.656,12.172Z M13.172,12.172L10.344,12.172L10.594,12.422L13.422,12.422L13.172,12.172Z M5.156,12.672L2.328,12.672L2.078,12.922L4.906,12.922L5.156,12.672Z M13.672,12.672L10.844,12.672L11.094,12.922L13.922,12.922L13.672,12.672Z M4.656,13.172L2.172,13.172L2.422,13.422L4.406,13.422L4.656,13.172Z M13.828,13.172L11.344,13.172L11.594,13.422L13.578,13.422L13.828,13.172Z M4.156,13.672L2.672,13.672L2.914,13.914L3.914,13.914L4.156,13.672Z M13.328,13.672L11.844,13.672L12.086,13.914L13.086,13.914L13.328,13.672Z M3.664,14.164L3.164,14.164L3.414,14.414L3.664,14.164Z M12.836,14.164L12.336,14.164L12.586,14.414L12.836,14.164Z" />
				</svg>
			</span>
		</div>
	);
};
