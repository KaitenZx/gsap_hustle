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
	const isControlTransferredRef = useRef(false)

	useEffect(() => {
		const canvasElement = canvasRef.current
		const containerElement = containerRef.current

		if (!canvasElement || !containerElement || !window.Worker) {
			console.warn(
				'useCanvasWorker: Canvas, container, or Worker not available.'
			)
			return
		}

		if (!workerRef.current) {
			const worker = new Worker(
				new URL('../lib/canvas.worker.ts', import.meta.url),
				{
					type: 'module',
				}
			)
			workerRef.current = worker
		}

		if (!isControlTransferredRef.current) {
			const offscreenCanvas = canvasElement.transferControlToOffscreen()
			workerRef.current.postMessage({ canvas: offscreenCanvas }, [
				offscreenCanvas,
			])
			isControlTransferredRef.current = true
		}

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

		const resizeObserver = new ResizeObserver(updateWorker)
		resizeObserver.observe(containerElement)

		return () => {
			resizeObserver.disconnect()
			// The worker will be terminated when the component truly unmounts.
		}
	}, [canvasRef, containerRef, isTouchDevice, isScrollingRef])

	// Real cleanup effect when the component unmounts for good
	useEffect(() => {
		const worker = workerRef.current
		return () => {
			if (worker) {
				worker.terminate()
			}
		}
	}, [])
}
