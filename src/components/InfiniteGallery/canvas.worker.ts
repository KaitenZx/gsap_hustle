// canvas.worker.ts

type CanvasWorkerData = {
	canvas?: OffscreenCanvas
	width?: number
	height?: number
	themeTextColor?: string
	isScrolling?: boolean
	dpr?: number
	isTouchDevice?: boolean
}

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let themeTextColor = 'rgba(128, 128, 128, 0.6)' // Default
let isScrolling = false
let devicePixelRatio = 1
let isTouchDeviceWorker = false // Default to false

// --- Animation Settings (Copied from InfiniteGallery/index.tsx) ---
const pattern = [' _&+glitchy+&_ ', '*.+pixels+#!      ']
const weights = ['normal', 'bold']
const fontSize = 14
const lineHeight = 16
const timeFactor = 0.0005
const xCoordFactor = 0.01
const yCoordFactor = 0.01
const xyCoordFactor = 0.0008
const sinMultiplier = 20

let cols = 0
let rows = 0
let animationFrameId: number | null = null
const TARGET_CANVAS_FPS = 15
const frameInterval = 1000 / TARGET_CANVAS_FPS
let canvasInternalTime = 0

// Optimization state variables
let targetSparsity = 0 // 0 = full density, 0.7 = 70% characters skipped
let currentSparsity = 0
const sparsityLerpFactor = 0.15 // How quickly sparsity transitions

let targetSinMultiplier = sinMultiplier
let currentSinMultiplier = sinMultiplier
const sinMultiplierLerpFactor = 0.15 // How quickly sinMultiplier transitions
const scrollingSinMultiplier = 5 // Reduced value for sinMultiplier during scroll

function setupCanvas(width: number, height: number) {
	if (!canvas || !ctx) return

	canvas.width = width * devicePixelRatio
	canvas.height = height * devicePixelRatio
	// OffscreenCanvas does not have a style property
	// canvas.style.width = `${width}px`;
	// canvas.style.height = `${height}px`;
	ctx.scale(devicePixelRatio, devicePixelRatio)

	cols = Math.floor(width / (fontSize * 0.6))
	rows = Math.floor(height / lineHeight)

	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
}

function drawBackground(
	time: number,
	sparsity: number,
	activeSinMultiplier: number
) {
	if (!ctx || !canvas || cols <= 0 || rows <= 0) return

	const currentWidth = canvas.width / devicePixelRatio
	const currentHeight = canvas.height / devicePixelRatio

	const t = time * timeFactor
	const cellWidth = currentWidth / cols
	const cellHeight = currentHeight / rows
	const centerCol = cols / 2
	const centerRow = rows / 2

	ctx.clearRect(0, 0, currentWidth, currentHeight)
	ctx.fillStyle = themeTextColor

	if (weights.length > 0) {
		ctx.font = `${weights[0]} ${fontSize}px 'Alpha Lyrae', monospace`
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const c_index_for_style =
					(Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2
				if (c_index_for_style === 0) {
					const relX = x - centerCol
					const relY = y - centerRow
					const o =
						Math.sin(relX * relY * xyCoordFactor + relY * yCoordFactor + t) *
						activeSinMultiplier
					const i = Math.floor(
						Math.abs(relX * xCoordFactor + relY * yCoordFactor + o)
					)
					const currentPattern = pattern[c_index_for_style] || pattern[0] || ''
					const char = currentPattern[i % currentPattern.length] ?? ' '
					const drawX = x * cellWidth + cellWidth / 2
					const drawY = y * cellHeight + cellHeight / 2

					// Apply sparsity
					if (sparsity > 0 && Math.random() < sparsity) {
						continue // Skip drawing this character
					}
					ctx.fillText(char, drawX, drawY)
				}
			}
		}
	}

	if (weights.length > 1) {
		ctx.font = `${weights[1]} ${fontSize}px 'Alpha Lyrae', monospace`
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const c_index_for_style =
					(Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2
				if (c_index_for_style === 1) {
					const relX = x - centerCol
					const relY = y - centerRow
					const o =
						Math.sin(relX * relY * xyCoordFactor + relY * yCoordFactor + t) *
						activeSinMultiplier
					const i = Math.floor(
						Math.abs(relX * xCoordFactor + relY * yCoordFactor + o)
					)
					const currentPattern = pattern[c_index_for_style] || pattern[1] || ''
					const char = currentPattern[i % currentPattern.length] ?? ' '
					const drawX = x * cellWidth + cellWidth / 2
					const drawY = y * cellHeight + cellHeight / 2

					// Apply sparsity
					if (sparsity > 0 && Math.random() < sparsity) {
						continue // Skip drawing this character
					}
					ctx.fillText(char, drawX, drawY)
				}
			}
		}
	}
}

function animate() {
	// Lerp optimization parameters towards their targets
	currentSparsity += (targetSparsity - currentSparsity) * sparsityLerpFactor
	currentSinMultiplier +=
		(targetSinMultiplier - currentSinMultiplier) * sinMultiplierLerpFactor

	// Prevent overshooting for very small differences to settle values to prevent jitter
	if (Math.abs(targetSparsity - currentSparsity) < 0.001) {
		currentSparsity = targetSparsity
	}
	if (Math.abs(targetSinMultiplier - currentSinMultiplier) < 0.01) {
		currentSinMultiplier = targetSinMultiplier
	}

	// Update internal time and draw the frame. The timing is now handled by setTimeout.
	canvasInternalTime += frameInterval
	drawBackground(canvasInternalTime, currentSparsity, currentSinMultiplier)

	// Reschedule the next frame ONLY if not paused (touch device AND scrolling).
	// This is the key change: setTimeout replaces requestAnimationFrame.
	if (!(isTouchDeviceWorker && isScrolling)) {
		animationFrameId = self.setTimeout(animate, frameInterval)
	} else {
		animationFrameId = null
	}
}

self.onmessage = (e: MessageEvent<CanvasWorkerData>) => {
	const { data } = e

	if (typeof data.isTouchDevice === 'boolean') {
		isTouchDeviceWorker = data.isTouchDevice
	}

	if (data.canvas) {
		canvas = data.canvas
		ctx = canvas.getContext('2d')
		if (!ctx) {
			console.error('Canvas worker: Failed to get OffscreenCanvas context.')
			return
		}
		// Initial setup will be triggered by a subsequent 'resize' message
		// that includes width and height.
	}

	if (typeof data.dpr === 'number') {
		devicePixelRatio = data.dpr
	}

	if (typeof data.width === 'number' && typeof data.height === 'number') {
		if (canvas && ctx) {
			setupCanvas(data.width, data.height)
			// Start animation loop if not already started and canvas is ready
			if (!animationFrameId && data.width > 0 && data.height > 0) {
				canvasInternalTime = 0 // Reset time on new init/resize
				// The animate function itself will check isTouchDeviceWorker && isScrolling
				// and might not schedule the *next* frame if those conditions are met.
				// But the first frame will be attempted.
				animate()
			} else if (animationFrameId && (data.width === 0 || data.height === 0)) {
				// If canvas becomes 0 size, stop animation
				if (animationFrameId) {
					clearTimeout(animationFrameId)
					animationFrameId = null
				}
			}
		}
	}

	if (data.themeTextColor) {
		// Add a small opacity to the theme text color for the background
		// This is a simple way to make it less prominent.
		// Assuming themeTextColor is a hex or rgb string.
		// This logic might need to be more robust if colors can be in other formats.
		try {
			if (/^#([0-9A-F]{3}){1,2}$/i.test(data.themeTextColor)) {
				// Hex
				const r = parseInt(data.themeTextColor.slice(1, 3), 16)
				const g = parseInt(data.themeTextColor.slice(3, 5), 16)
				const b = parseInt(data.themeTextColor.slice(5, 7), 16)
				themeTextColor = `rgba(${r}, ${g}, ${b}, 0.3)` // Apply 30% opacity
			} else if (data.themeTextColor.startsWith('rgb')) {
				// rgb or rgba
				themeTextColor = data.themeTextColor
					.replace(/rgb\(([^)]+)\)/, 'rgba($1, 0.3)')
					.replace(/rgba\(([^,]+,\s*[^,]+,\s*[^,]+),[^)]+\)/, 'rgba($1, 0.3)')
			} else {
				themeTextColor = 'rgba(128, 128, 128, 0.3)' // Fallback
			}
		} catch (error) {
			console.warn(
				'Canvas worker: Could not parse theme color, using default.',
				error
			)
			themeTextColor = 'rgba(128, 128, 128, 0.3)' // Fallback
		}
	}

	if (typeof data.isScrolling === 'boolean') {
		const oldIsScrolling = isScrolling // Store previous state
		isScrolling = data.isScrolling

		if (isScrolling) {
			targetSparsity = 0.7 // Skip 70% of characters
			targetSinMultiplier = scrollingSinMultiplier
			// Apply scroll optimizations immediately
			currentSparsity = targetSparsity
			currentSinMultiplier = targetSinMultiplier

			// If scrolling starts on a touch device and animation is running, cancel it.
			// The animate() function will then not schedule new frames.
			if (isTouchDeviceWorker && animationFrameId !== null) {
				clearTimeout(animationFrameId)
				animationFrameId = null
			}
		} else {
			// Not scrolling
			// Targets for smooth restoration to full quality
			targetSparsity = 0
			targetSinMultiplier = sinMultiplier // Restore original full value
			// Lerping will handle the smooth transition back for sparsity/sinMultiplier.

			// If scrolling stopped on a touch device, and animation was paused (animationFrameId is null), restart it.
			if (isTouchDeviceWorker && oldIsScrolling && animationFrameId === null) {
				// canvasInternalTime continues, to not reset the pattern completely.
				animate()
			}
		}
	}
}

// Optional: Handle worker termination if needed, though usually managed by main thread.
// self.onclose = () => {
//   if (animationFrameId) {
//     cancelAnimationFrame(animationFrameId);
//   }
// };

export {} // Make this a module
