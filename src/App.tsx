import styles from './App.module.scss'
import { InfiniteGallery } from './components/InfiniteGallery'



function App() {

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
