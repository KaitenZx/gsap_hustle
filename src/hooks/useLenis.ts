import { useEffect } from 'react'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

export function useLenis() {
	useEffect(() => {
		const lenis = new Lenis({
			// wrapper: window, // по умолчанию window
			// content: document.documentElement, // по умолчанию document.documentElement
			// lerp: 0.1, // Значение по умолчанию, можно настроить
			// duration: 1.2, // Значение по умолчанию, можно настроить
			// smoothWheel: true, // Включено по умолчанию
			autoRaf: false, // Устанавливаем в false, так как будем управлять через GSAP ticker
		})

		// Сохраняем ссылку на обработчик тикера для последующего удаления
		const tickerCallback = (time: number) => {
			lenis.raf(time * 1000) // Конвертируем время из секунд в миллисекунды
		}
		gsap.ticker.add(tickerCallback)

		// Интеграция с ScrollTrigger
		const scrollTriggerUpdateCallback = () => ScrollTrigger.update()
		lenis.on('scroll', scrollTriggerUpdateCallback)

		// Отключаем сглаживание задержек в GSAP, если Lenis этим управляет
		gsap.ticker.lagSmoothing(0)

		// Очистка при размонтировании компонента
		return () => {
			lenis.off('scroll', scrollTriggerUpdateCallback) // Удаляем слушатель scroll
			gsap.ticker.remove(tickerCallback) // Удаляем конкретный обработчик тикера
			lenis.destroy()
		}
	}, []) // Пустой массив зависимостей для однократной инициализации
}
