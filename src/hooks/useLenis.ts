import { useEffect } from 'react'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

export function useLenis() {
	useEffect(() => {
		const lenis = new Lenis({
			autoRaf: false, // Устанавливаем в false, так как будем управлять через GSAP ticker
		})

		const tickerCallback = (time: number) => {
			lenis.raf(time * 1000)
		}
		gsap.ticker.add(tickerCallback)

		const scrollTriggerUpdateCallback = () => ScrollTrigger.update()
		lenis.on('scroll', scrollTriggerUpdateCallback)

		gsap.ticker.lagSmoothing(0)

		return () => {
			lenis.off('scroll', scrollTriggerUpdateCallback) // Удаляем слушатель scroll
			gsap.ticker.remove(tickerCallback) // Удаляем конкретный обработчик тикера
			lenis.destroy()
		}
	}, [])
}
