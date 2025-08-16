import { useRef } from 'react';

import EmailIcon from '../../assets/icons/email_icon.svg?react';
import InstagramIcon from '../../assets/icons/instagramm_icon.svg?react';
import RedditIcon from '../../assets/icons/reddit_icon.svg?react';
import TheHugIcon from '../../assets/icons/thehug_icon.svg?react';
import TwitterIcon from '../../assets/icons/twitter_icon.svg?react';
import { usePinState } from '../../context/PinStateContext';
import { ScrollDownIndicator } from '../ScrollDownIndicator';
import { ThemeToggleButton } from '../ThemeToggleButton';

import { useAsciiAnimation } from './hooks/useAsciiAnimation';
import { useTextPinningAnimation } from './hooks/useTextPinningAnimation';
import styles from './index.module.scss';

const linksData = [
	{ href: "https://www.instagram.com/glitchypixels/", text: "INSTAGRAM", iconComponent: InstagramIcon, alt: "Instagram Icon" },
	{ href: "https://x.com/iamglitchypixel", text: "TWITTER", iconComponent: TwitterIcon, alt: "Twitter Icon" },
	{ href: "https://www.reddit.com/user/iamglitchypixels/", text: "REDDIT", iconComponent: RedditIcon, alt: "Reddit Icon" },
	{ href: "https://thehug.xyz/artists/glitchypixels", text: "THEHUG", iconComponent: TheHugIcon, alt: "TheHug Icon" },
	{ href: "mailto:iamglitchypixel@gmail.com", text: "MAIL", iconComponent: EmailIcon, alt: "Email Icon" }
];

const exposData = [
	{
		title: "Fubar 2k23 exhibition",
		titleHref: "https://fubar.space/2023/expo-art/",
		subtitle: "Inner emigration",
		subtitleHref: "https://www.instagram.com/p/Cmci5PXvmWa/?igsh=MTRtNWQ2d2FteDg4Zw==",
		year: "2023",
	},
	{
		title: "Fubar 2k23 exhibition",
		titleHref: "https://fubar.space/2023/expo-art/",
		subtitle: "thealienarms / glitchypixels collection",
		subtitleHref: "https://www.instagram.com/p/Cmci5PXvmWa/",
		year: "2023",
	},
	{
		title: "GLITCH.ART.BR - IV EDITION",
		titleHref: "https://www.glitch.art.br/en/index.html",
		subtitle: "Follow Me!",
		subtitleHref: "https://www.instagram.com/p/CxNmQ6UIRgm/?igsh=bnJhNWx0em1oaGl5",
		year: "2023",
	},
	{
		title: "NIANGI - Error in Control",
		titleHref: "https://www.instagram.com/__niangi___/",
		subtitle: "7 selected artworks",
		subtitleHref: "https://www.instagram.com/p/CrltMfmIPIw/?igsh=MThjcG9hZThlejgxYQ==",
		year: "2024",
	},
	{
		title: "Fubar 2k24 exhibition",
		titleHref: "https://fubar.space/2024/artist-list/",
		subtitle: "Procrastination",
		subtitleHref: "https://www.instagram.com/p/CqF0xxNosMk/?igsh=djNqc2gxZ245eWE0",
		year: "2024",
	},
	{
		title: "GLITCH.ART.BR - V EDITION",
		titleHref: "https://www.glitch.art.br/en/index.html",
		subtitle: "Back To The Underground",
		subtitleHref: "https://www.instagram.com/p/C_gPIjloB8r/",
		year: "2024",
	},
	{
		title: "Awita New York Studio: 2nd Year anniversary",
		titleHref: "https://awomaninthearts.com/applications/evolve",
		subtitle: "3 selected artworks",
		subtitleHref: "https://www.instagram.com/p/DA_yChPOIks/",
		year: "2025",
	}
];


export const AboutMe = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const ditherStrength = useRef<number>(1.0);

	const aboutMeContainerRef = useRef<HTMLDivElement>(null);
	const pinHeightRef = useRef<HTMLDivElement>(null);
	const pinnedTextContainerRef = useRef<HTMLDivElement>(null);
	const paragraphsContainerRef = useRef<HTMLDivElement>(null);

	const { setIsAboutMePinned } = usePinState();

	useAsciiAnimation({
		canvasRef,
		containerRef: aboutMeContainerRef,
		pinHeightRef,
		ditherStrength,
	});

	useTextPinningAnimation({
		pinHeightRef,
		pinnedTextContainerRef,
		canvasRef,
		aboutMeContainerRef,
		ditherStrength,
		setIsAboutMePinned,
	});

	return (
		<div ref={aboutMeContainerRef} className={styles.aboutMeContainer}>
			<div data-interactive-cursor="true" className={styles.themeToggleWrapper}>
				<ThemeToggleButton />
			</div>
			<canvas
				ref={canvasRef}
				className={styles.asciiCanvas}
			/>
			<ScrollDownIndicator />
			<section className={styles.mwgEffect004}>
				<div ref={pinHeightRef} className={styles.pinHeight}>
					<div ref={pinnedTextContainerRef} className={`${styles.textAnimationContainer} ${styles.textContainerHiddenByOpacity}`}>
						<div ref={paragraphsContainerRef} className={`${styles.textColumn} ${styles.aboutColumn}`}>
							<h2>ABOUT ME</h2>
							<div className={styles.aboutParagraphsRow}>
								<p className={styles.paragraph}>
									As{'\u00A0'}a glitch artist and{'\u00A0'}multidisciplinary designer from{'\u00A0'}Russia,
									currently based in{'\u00A0'}Cyprus, I{'\u00A0'}explore the{'\u00A0'}intersection of{'\u00A0'}digital
									aesthetics and{'\u00A0'}human experience. My journey into glitch art began in{'\u00A0'}2022,
									when{'\u00A0'}I discovered how digital distortions could express
									deeper truths about memory and{'\u00A0'}perception.
								</p>
								<p className={styles.paragraph}>
									Growing up during the{'\u00A0'}dawn of{'\u00A0'}the{'\u00A0'}internet era, I{'\u00A0'}developed
									a{'\u00A0'}deep appreciation for{'\u00A0'}early web aesthetics, which now influences
									my artistic approach. Through my work, I{'\u00A0'}combine traditional design
									principles with digital manipulation techniques to{'\u00A0'}create pieces
									that examine themes of{'\u00A0'}nostalgia, impermanence,
									and{'\u00A0'}technological evolution.
								</p>
								<p className={styles.paragraph}>
									My glitch art invites viewers to{'\u00A0'}reflect on{'\u00A0'}their own relationships
									with memory, technology, and{'\u00A0'}time, while challenging conventional
									notions of{'\u00A0'}digital perfection. Each piece serves as{'\u00A0'}a meditation
									on{'\u00A0'}how our memories of{'\u00A0'}places and{'\u00A0'}people transform over time,
									much like the{'\u00A0'}distorted digital images in{'\u00A0'}my work.
								</p>
							</div>
						</div>

						<div className={styles.exposLinksWrapper}>
							<div className={`${styles.textColumn} ${styles.exposColumn}`}>
								<h2>EXPOS</h2>
								<ul>
									{exposData.map((expo) => (
										<li key={`${expo.title}-${expo.subtitle}`}>
											<a href={expo.titleHref} data-interactive-cursor="true" className={styles.expoLinkBlock} target="_blank" rel="noopener noreferrer">
												<span className={styles.animatableText}>{expo.title}</span>
												{' '}
												<span className={`${styles.yearTag} ${styles.word}`}>{expo.year}</span>
											</a>
											<a href={expo.subtitleHref} data-interactive-cursor="true" className={styles.expoLinkBlock} target="_blank" rel="noopener noreferrer">
												<span className={`${styles.subText} ${styles.animatableText}`}>{expo.subtitle}</span>
											</a>
										</li>
									))}
								</ul>
							</div>

							<div className={`${styles.textColumn} ${styles.linksColumn}`}>
								<h2>LINKS</h2>
								<ul>
									{linksData.map((link) => (
										<li key={link.text}>
											<a data-interactive-cursor="true" href={link.href} target="_blank" rel="noopener noreferrer" className={styles.word}>
												<link.iconComponent className={styles.linkIcon} />
												<span>{link.text}</span>
											</a>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};
