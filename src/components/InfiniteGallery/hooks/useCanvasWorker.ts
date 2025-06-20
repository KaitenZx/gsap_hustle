import { useEffect, useRef } from 'react'

interface UseCanvasWorkerProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>
	containerRef: React.RefObject<HTMLDivElement | null>
	isTouchDevice: boolean
	isScrollingRef: React.RefObject<boolean>
}

export const useCanvasWorker = ({
	canvasRef,
	containerRef,
	isTouchDevice,
	isScrollingRef,
}: UseCanvasWorkerProps) => {
	const workerRef = useRef<Worker | null>(null)

	useEffect(() => {
		const canvasElement = canvasRef.current
		const containerElement = containerRef.current

		if (!canvasElement || !containerElement || !window.Worker) {
			console.warn(
				'useCanvasWorker: Canvas, container, or Worker not available.'
			)
			return
		}

		// Ensure worker is only created once or handled if HMR causes re-runs
		if (workerRef.current) {
			workerRef.current.terminate()
		}

		const worker = new Worker(new URL('../canvas.worker.ts', import.meta.url), {
			type: 'module',
		})
		workerRef.current = worker

		// Transfer OffscreenCanvas to the worker
		const offscreenCanvas = canvasElement.transferControlToOffscreen()
		worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas])

		// Function to send updates to the worker
		const updateWorker = () => {
			if (!workerRef.current || !containerElement) return

			const rect = containerElement.getBoundingClientRect()
			const dpr = window.devicePixelRatio || 1
			let themeTextColor = '#808080' // Default fallback
			if (typeof window !== 'undefined') {
				themeTextColor = getComputedStyle(document.documentElement)
					.getPropertyValue('--text-color')
					.trim()
			}

			workerRef.current.postMessage({
				width: rect.width,
				height: rect.height,
				dpr: dpr,
				themeTextColor: themeTextColor,
				isScrolling: isScrollingRef.current, // Send current scroll state
				isTouchDevice: isTouchDevice,
			})
		}

		// Initial update
		updateWorker()

		// Observe container resize to update worker
		const resizeObserver = new ResizeObserver(updateWorker)
		resizeObserver.observe(containerElement)

		return () => {
			resizeObserver.disconnect()
			if (workerRef.current) {
				workerRef.current.terminate()
				workerRef.current = null
			}
		}
	}, [canvasRef, containerRef, isTouchDevice, isScrollingRef])
}
