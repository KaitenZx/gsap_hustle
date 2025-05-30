import { useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import debounce from 'lodash/debounce';

import styles from './App.module.scss'
import { AboutMe } from './components/AboutMe';
import { GlitchCursor } from './components/GlitchCursor';
import { InfiniteGallery } from './components/InfiniteGallery'
import { ITEMS, GalleryItem } from './components/InfiniteGallery/galleryData';
import 'lenis/dist/lenis.css'; // Раскомментируйте, если используете npm-пакет
import './styles/theme.css'; // Import theme styles
import { ThemeProvider } from './context/ThemeContext'; // Import ThemeProvider

// Set to track preloaded URLs
const _appPreloadedUrls = new Set<string>();

function AppContent() {
  // --- useEffect для инициализации Lenis ---
  useEffect(() => {
    const lenis = new Lenis({
      // wrapper: window, // по умолчанию window
      // content: document.documentElement, // по умолчанию document.documentElement
      // lerp: 0.1, // Значение по умолчанию, можно настроить
      // duration: 1.2, // Значение по умолчанию, можно настроить
      // smoothWheel: true, // Включено по умолчанию
      autoRaf: false, // Устанавливаем в false, так как будем управлять через GSAP ticker
    });

    // Сохраняем ссылку на обработчик тикера для последующего удаления
    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000); // Конвертируем время из секунд в миллисекунды
    };
    gsap.ticker.add(tickerCallback);

    // Интеграция с ScrollTrigger
    const scrollTriggerUpdateCallback = () => ScrollTrigger.update();
    lenis.on('scroll', scrollTriggerUpdateCallback);

    // Отключаем сглаживание задержек в GSAP, если Lenis этим управляет
    gsap.ticker.lagSmoothing(0);


    // Очистка при размонтировании компонента
    return () => {
      lenis.off('scroll', scrollTriggerUpdateCallback); // Удаляем слушатель scroll
      gsap.ticker.remove(tickerCallback); // Удаляем конкретный обработчик тикера
      lenis.destroy();
    };
  }, []); // Пустой массив зависимостей для однократной инициализации

  // Add useEffect for preloading
  useEffect(() => {
    ITEMS.forEach((item: GalleryItem) => {
      if (!_appPreloadedUrls.has(item.previewSrc)) {
        _appPreloadedUrls.add(item.previewSrc);
        const img = new Image();
        img.src = item.previewSrc;
      }
    });
  }, []); // Empty dependency array ensures this runs only once on mount

  useEffect(() => {
    if (typeof window === 'undefined') return; // Guard for SSR or other environments

    gsap.registerPlugin(ScrollTrigger);

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

    // Событие resize на visualViewport для более точного отслеживания изменений
    // связанных с клавиатурой, зумом и т.д.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', debouncedRefresh);
    }

    // window.addEventListener('resize') все еще полезен для отлавливания
    // изменений размера окна, которые не всегда триггерят visualViewport.resize (например, поворот экрана)
    window.addEventListener('resize', debouncedRefresh);
    window.addEventListener('orientationchange', debouncedRefresh);


    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', debouncedRefresh);
      }
      window.removeEventListener('resize', debouncedRefresh);
      window.removeEventListener('orientationchange', debouncedRefresh);
      debouncedRefresh.cancel();
    };
  }, []);

  return (
    <div className={styles.app}>
      <GlitchCursor />
      <AboutMe />
      <InfiniteGallery />
    </div>
  )
}

// Wrap AppContent with ThemeProvider
function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App
