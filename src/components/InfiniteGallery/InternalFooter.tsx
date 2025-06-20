import React, { useMemo, useRef, useEffect } from 'react';

import { gsap } from 'gsap';

import EmailIcon from '../../assets/icons/email_icon.svg?react';
import InstagramIcon from '../../assets/icons/instagramm_icon.svg?react';
import RedditIcon from '../../assets/icons/reddit_icon.svg?react';
import TheHugIcon from '../../assets/icons/thehug_icon.svg?react';
import TwitterIcon from '../../assets/icons/twitter_icon.svg?react';

import styles from './InternalFooter.module.scss';

interface InternalFooterProps {
	isVisible: boolean;
}

export const InternalFooter: React.FC<InternalFooterProps> = ({ isVisible }) => {
	const footerRef = useRef<HTMLDivElement>(null);

	const footerLinks = useMemo(() => [
		{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconComponent: InstagramIcon, ariaLabel: "Instagram" },
		{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconComponent: TwitterIcon, ariaLabel: "Twitter" },
		{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconComponent: RedditIcon, ariaLabel: "Reddit" },
		{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconComponent: TheHugIcon, ariaLabel: "TheHug" },
		{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconComponent: EmailIcon, ariaLabel: "Mail" }
	], []);

	useEffect(() => {
		if (footerRef.current) {
			gsap.to(footerRef.current, {
				opacity: isVisible ? 1 : 0,
				visibility: isVisible ? 'visible' : 'hidden',
				pointerEvents: isVisible ? 'auto' : 'none',
				duration: 0.5,
				ease: 'power2.inOut'
			});
		}
	}, [isVisible]);

	return (
		<div
			ref={footerRef}
			className={styles.internalGalleryFooter}
			style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }} // Initial styles for GSAP
		>
			{footerLinks.map(link => (
				<div key={link.text} className={styles.footerLinkContainer}>
					<a data-interactive-cursor="true" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.ariaLabel}>
						<link.iconComponent className={styles.footerLinkIcon} />
						<span>{link.text}</span>
					</a>
				</div>
			))}
		</div>
	);
}; 