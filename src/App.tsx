import { useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import debounce from 'lodash/debounce';

import styles from './App.module.scss'
import { AboutMe } from './components/AboutMe';
import { GlitchCursor } from './components/GlitchCursor';
import { GlitchOverlay } from './components/GlitchOverlay';
import { InfiniteGallery } from './components/InfiniteGallery';
import { getColumnPreviewImageUrls, preloadImage } from './components/InfiniteGallery/lib/galleryData';
import 'lenis/dist/lenis.css'; // Раскомментируйте, если используете npm-пакет
import './styles/theme.css'; // Import theme styles
import { PinStateProvider } from './context/PinStateContext';
import { ThemeProvider } from './context/ThemeContext'; // Import ThemeProvider
import { useLenis } from './hooks/useLenis';


function AppContent() {
  useLenis();

  useEffect(() => {
    // Preload images for the first few columns to ensure they are ready
    // by the time the user scrolls down to the gallery.
    const INITIAL_PRELOAD_COLS = 8; // Preload 8 columns
    for (let i = 0; i < INITIAL_PRELOAD_COLS; i++) {
      const urlsToPreload = getColumnPreviewImageUrls(i);
      urlsToPreload.forEach(preloadImage);
    }
  }, []);



  useEffect(() => {
    if (typeof window === 'undefined') return; // Guard for SSR or other environments

    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

    const setVisualViewportHeight = () => {
      if (window.visualViewport) {
        const visualVh = window.visualViewport.height * 0.01;
        document.documentElement.style.setProperty('--visual-vh', `${visualVh}px`);
      } else {
        // Fallback для браузеров без поддержки visualViewport
        const fallbackVh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--visual-vh', `${fallbackVh}px`);
      }
    };

    const debouncedRefresh = debounce(() => {
      setVisualViewportHeight(); // Установим --visual-vh перед refresh
      ScrollTrigger.refresh();
    }, 150);

    setVisualViewportHeight(); // Первоначальная установка


    window.addEventListener('resize', debouncedRefresh);
    window.addEventListener('orientationchange', debouncedRefresh);


    return () => {
      window.removeEventListener('resize', debouncedRefresh);
      window.removeEventListener('orientationchange', debouncedRefresh);
      debouncedRefresh.cancel();
    };
  }, []);

  return (
    <div className={styles.app}>
      <GlitchCursor />
      <GlitchOverlay />
      <AboutMe />
      <InfiniteGallery />
    </div>
  )
}

// Wrap AppContent with ThemeProvider and PinStateProvider
function App() {
  return (
    <ThemeProvider>
      <PinStateProvider>
        <AppContent />
      </PinStateProvider>
    </ThemeProvider>
  );
}

export default App
