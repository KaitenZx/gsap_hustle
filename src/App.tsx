import { useEffect } from 'react';

import styles from './App.module.scss'
import { InfiniteGallery, ITEMS } from './components/InfiniteGallery'

// Set to track preloaded URLs
const _appPreloadedUrls = new Set<string>();

function App() {

  // Add useEffect for preloading
  useEffect(() => {
    console.log('[App Preload] Starting initial preview image preload...');
    let count = 0;
    ITEMS.forEach(item => {
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
      <div id="placeholder1" className={styles.placeholder} >View 1 placeholder - landing</div>
      <div id="placeholder2" className={styles.placeholder} >View 2 placeholder - about me</div>
      <InfiniteGallery />  {/* галерея работ */}
      <div id="placeholder3" className={styles.placeholder} >View 4 placeholder - footer</div>
    </div>
  )
}

export default App
