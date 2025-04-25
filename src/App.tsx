import './App.css'
import { InfiniteGallery } from './components/InfiniteGallery'



function App() {

  return (
    <div className='App'>
      <div id="placeholder1" style={{ height: '100vh', width: '100vw', background: 'lightblue' }}>Вью 1 placeholder - landing</div>
      <div id="placeholder2" style={{ height: '100vh', width: '100vw', background: 'lightblue' }}>Вью 2 placeholder - about me</div>
      <InfiniteGallery />  {/* галерея работ */}
      <div id="placeholder3" style={{ height: '100vh', width: '100vw', background: 'lightgreen' }}>Вью 4 placeholder - footer</div>
    </div>
  )
}

export default App
