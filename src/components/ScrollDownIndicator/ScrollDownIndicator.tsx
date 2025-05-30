import React, { useState, useEffect } from 'react';

import styles from './ScrollDownIndicator.module.scss';

const ScrollDownIndicator: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const appearTimer = setTimeout(() => {
			setIsVisible(true);
		}, 5000);

		const handleScroll = () => {
			if (window.scrollY > 200) {
				setIsVisible(false);
				window.removeEventListener('scroll', handleScroll);
				clearTimeout(appearTimer); // Clear the timer if scroll happens before 5s
			}
		};

		window.addEventListener('scroll', handleScroll);

		return () => {
			clearTimeout(appearTimer);
			window.removeEventListener('scroll', handleScroll);
		};
	}, []);

	if (!isVisible) {
		return null;
	}

	return (
		<div className={`${styles.scrollIndicatorContainer} ${isVisible ? styles.visible : ''}`}>
			{/* First arrow (top one, starts more transparent or syncs with animation state) */}
			<span className={styles.arrowOne}>
				<svg viewBox="0 0 512 512" enableBackground="new 0 0 512 512">
					<path d="M293.751,455.868c-20.181,20.179-53.165,19.913-73.673-0.595l0,0c-20.508-20.508-20.773-53.493-0.594-73.672 l189.999-190c20.178-20.178,53.164-19.913,73.672,0.595l0,0c20.508,20.509,20.772,53.492,0.595,73.671L293.751,455.868z" />
					<path d="M220.249,455.868c20.18,20.179,53.164,19.913,73.672-0.595l0,0c20.509-20.508,20.774-53.493,0.596-73.672 l-190-190c-20.178-20.178-53.164-19.913-73.671,0.595l0,0c-20.508,20.509-20.772,53.492-0.595,73.671L220.249,455.868z" />
				</svg>
			</span>
			{/* Second arrow (bottom one, starts more opaque or syncs with animation state) */}
			<span className={styles.arrowTwo}>
				<svg viewBox="0 0 512 512" enableBackground="new 0 0 512 512">
					<path d="M293.751,455.868c-20.181,20.179-53.165,19.913-73.673-0.595l0,0c-20.508-20.508-20.773-53.493-0.594-73.672 l189.999-190c20.178-20.178,53.164-19.913,73.672,0.595l0,0c20.508,20.509,20.772,53.492,0.595,73.671L293.751,455.868z" />
					<path d="M220.249,455.868c20.18,20.179,53.164,19.913,73.672-0.595l0,0c20.509-20.508,20.774-53.493,0.596-73.672 l-190-190c-20.178-20.178-53.164-19.913-73.671,0.595l0,0c-20.508,20.509-20.772,53.492-0.595,73.671L220.249,455.868z" />
				</svg>
			</span>
		</div>
	);
};

export default ScrollDownIndicator; 