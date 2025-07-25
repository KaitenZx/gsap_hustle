import React, { useState, useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

import styles from './index.module.scss';

export const ScrollDownIndicator: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		gsap.registerPlugin(ScrollToPlugin);

		const appearTimer = setTimeout(() => {
			setIsVisible(true);
		}, 5000);

		const handleScroll = () => {
			if (window.scrollY > 200) {
				setIsVisible(false);
				window.removeEventListener('scroll', handleScroll);
				clearTimeout(appearTimer);
			}
		};

		window.addEventListener('scroll', handleScroll);

		return () => {
			clearTimeout(appearTimer);
			window.removeEventListener('scroll', handleScroll);
		};
	}, []);

	const handleIndicatorClick = () => {
		if (!isVisible) return;

		const vh = window.innerHeight / 100;
		const scrollAmount = 100 * vh;
		const currentScrollY = window.scrollY || window.pageYOffset;
		const targetScrollY = currentScrollY + scrollAmount;

		gsap.to(window, {
			scrollTo: targetScrollY,
			duration: 4,
			ease: 'expo.inOut',
		});

		setIsVisible(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			handleIndicatorClick();
		}
	};

	if (!isVisible) {
		return null;
	}

	return (
		<div
			data-interactive-cursor="true"
			className={`${styles.scrollIndicatorContainer} ${isVisible ? styles.visible : ''}`}
			onClick={handleIndicatorClick}
			style={{ cursor: 'pointer' }}
			role="button"
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			<span className={styles.arrowOne}>
				<svg width="800px" height="800px" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
					<rect width="16" height="16" id="icon-bound" fill="none" />
					<path d="M12.586,6.586L8,11.172L3.414,6.586L2,8L8,14L14,8L12.586,6.586ZM8.172,8.828L7.828,8.828L7.578,8.578L8.422,8.578L8.172,8.828ZM8.672,8.328L7.328,8.328L7.078,8.078L8.922,8.078L8.672,8.328ZM9.172,7.828L6.828,7.828L6.578,7.578L9.422,7.578L9.172,7.828ZM9.672,7.328L6.328,7.328L6.078,7.078L9.922,7.078L9.672,7.328ZM10.172,6.828L5.828,6.828L5.578,6.578L10.422,6.578L10.172,6.828ZM10.672,6.328L5.328,6.328L5.078,6.078L7.906,6.078L8,6.172L8.094,6.078L10.922,6.078L10.672,6.328ZM7.656,5.828L4.828,5.828L4.578,5.578L7.406,5.578L7.656,5.828ZM11.172,5.828L8.344,5.828L8.594,5.578L11.422,5.578L11.172,5.828ZM7.156,5.328L4.328,5.328L4.078,5.078L6.906,5.078L7.156,5.328ZM11.672,5.328L8.844,5.328L9.094,5.078L11.922,5.078L11.672,5.328ZM6.656,4.828L3.828,4.828L3.578,4.578L6.406,4.578L6.656,4.828ZM12.172,4.828L9.344,4.828L9.594,4.578L12.422,4.578L12.172,4.828ZM6.156,4.328L3.328,4.328L3.078,4.078L5.906,4.078L6.156,4.328ZM12.672,4.328L9.844,4.328L10.094,4.078L12.922,4.078L12.672,4.328ZM5.656,3.828L2.828,3.828L2.578,3.578L5.406,3.578L5.656,3.828ZM13.172,3.828L10.344,3.828L10.594,3.578L13.422,3.578L13.172,3.828ZM5.156,3.328L2.328,3.328L2.078,3.078L4.906,3.078L5.156,3.328ZM13.672,3.328L10.844,3.328L11.094,3.078L13.922,3.078L13.672,3.328ZM4.656,2.828L2.172,2.828L2.422,2.578L4.406,2.578L4.656,2.828ZM13.828,2.828L11.344,2.828L11.594,2.578L13.578,2.578L13.828,2.828ZM4.156,2.328L2.672,2.328L2.914,2.086L3.914,2.086L4.156,2.328ZM13.328,2.328L11.844,2.328L12.086,2.086L13.086,2.086L13.328,2.328ZM3.664,1.836L3.164,1.836L3.414,1.586L3.664,1.836ZM12.836,1.836L12.336,1.836L12.586,1.586L12.836,1.836Z" />
				</svg>
			</span>
		</div>
	);
};
