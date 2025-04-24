import './App.css'
import { InfiniteFiniteGrid } from './components/InfiniteGallery'



function App() {

  return (
    <div className='App'>
      <div style={{ height: '600px', width: '100vw', background: 'lightblue' }}>Scroll Up/Down Here</div>
      <InfiniteFiniteGrid />
      <div style={{ height: '600px', width: '100vw', background: 'lightgreen' }}>Scroll Up/Down Here</div>
    </div>
  )
}

export default App
