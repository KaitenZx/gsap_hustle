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

// --- Animation Settings  ---
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
	const currentCtx = ctx
	if (!currentCtx || !canvas || cols <= 0 || rows <= 0) return

	const currentWidth = canvas.width / devicePixelRatio
	const currentHeight = canvas.height / devicePixelRatio

	const t = time * timeFactor
	const cellWidth = currentWidth / cols
	const cellHeight = currentHeight / rows
	const centerCol = cols / 2
	const centerRow = rows / 2

	currentCtx.clearRect(0, 0, currentWidth, currentHeight)
	currentCtx.fillStyle = themeTextColor

	if (weights.length === 0) return

	const charsToDraw: Record<number, { char: string; x: number; y: number }[]> =
		{}
	weights.forEach((_, i) => (charsToDraw[i] = []))

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const c_index_for_style = (Math.floor(x * 0.5) + Math.floor(y * 0.5)) % 2

			if (sparsity > 0 && Math.random() < sparsity) {
				continue
			}

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

			if (charsToDraw[c_index_for_style]) {
				charsToDraw[c_index_for_style].push({ char, x: drawX, y: drawY })
			}
		}
	}

	weights.forEach((weight, index) => {
		const itemsToDraw = charsToDraw[index]
		if (itemsToDraw && itemsToDraw.length > 0) {
			currentCtx.font = `${weight} ${fontSize}px 'Alpha Lyrae', monospace`
			itemsToDraw.forEach((item) => {
				currentCtx.fillText(item.char, item.x, item.y)
			})
		}
	})
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
				animate()
			} else if (animationFrameId && (data.width === 0 || data.height === 0)) {
				if (animationFrameId) {
					clearTimeout(animationFrameId)
					animationFrameId = null
				}
			}
		}
	}

	if (data.themeTextColor) {
		try {
			if (/^#([0-9A-F]{3}){1,2}$/i.test(data.themeTextColor)) {
				const r = parseInt(data.themeTextColor.slice(1, 3), 16)
				const g = parseInt(data.themeTextColor.slice(3, 5), 16)
				const b = parseInt(data.themeTextColor.slice(5, 7), 16)
				themeTextColor = `rgba(${r}, ${g}, ${b}, 0.3)` // Apply 30% opacity
			} else if (data.themeTextColor.startsWith('rgb')) {
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
			currentSparsity = targetSparsity
			currentSinMultiplier = targetSinMultiplier

			if (isTouchDeviceWorker && animationFrameId !== null) {
				clearTimeout(animationFrameId)
				animationFrameId = null
			}
		} else {
			targetSparsity = 0
			targetSinMultiplier = sinMultiplier

			if (isTouchDeviceWorker && oldIsScrolling && animationFrameId === null) {
				// canvasInternalTime continues, to not reset the pattern completely.
				animate()
			}
		}
	}
}

export {}
