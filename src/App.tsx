import { useEffect } from 'react';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import styles from './App.module.scss'
import { AboutMe } from './components/AboutMe';
import { InfiniteGallery } from './components/InfiniteGallery'
import { ITEMS, GalleryItem } from './components/InfiniteGallery/galleryData';

import 'lenis/dist/lenis.css'; // Раскомментируйте, если используете npm-пакет

// Set to track preloaded URLs
const _appPreloadedUrls = new Set<string>();

function App() {
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

    console.log('[App] Lenis initialized for smooth page scrolling.');

    // Очистка при размонтировании компонента
    return () => {
      lenis.off('scroll', scrollTriggerUpdateCallback); // Удаляем слушатель scroll
      gsap.ticker.remove(tickerCallback); // Удаляем конкретный обработчик тикера
      lenis.destroy();
      console.log('[App] Lenis destroyed.');
    };
  }, []); // Пустой массив зависимостей для однократной инициализации

  // Add useEffect for preloading
  useEffect(() => {
    console.log('[App Preload] Starting initial preview image preload...');
    let count = 0;
    ITEMS.forEach((item: GalleryItem) => {
      if (!_appPreloadedUrls.has(item.previewSrc)) {
        _appPreloadedUrls.add(item.previewSrc);
        const img = new Image();
        img.src = item.previewSrc;
        count++;
      }
    });
    console.log(`[App Preload] Initiated preload for ${count} preview images.`);
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className={styles.app}>
      <AboutMe />
      <InfiniteGallery />
      <div id="placeholder3" className={styles.footer} >placeholder footer: link link link </div>
    </div>
  )
}

export default App
