// --- STATE ---
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let canvasLogicalWidth = 0
let canvasLogicalHeight = 0
let dpr = 1

// Animation loop state
let animationFrameId: number | null = null
const TARGET_FPS = 10
const frameInterval = 1000 / TARGET_FPS

// --- DRAWING LOGIC ---
const GLITCH_COLORS = [
	'rgba(255, 0, 0, 0.3)', // Red
	'rgba(0, 255, 0, 0.3)', // Green
	'rgba(0, 0, 255, 0.3)', // Blue
	'rgba(255, 0, 255, 0.3)', // Magenta
	'rgba(0, 255, 255, 0.3)', // Cyan
	'rgba(255, 255, 0, 0.3)', // Yellow
]

const getRandomColor = () =>
	GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)]

const drawGlitch = (
	context: OffscreenCanvasRenderingContext2D,
	width: number,
	height: number
) => {
	context.clearRect(0, 0, width, height)

	if (Math.random() < 0.5) {
		return
	}

	const glitchType = Math.random()

	if (glitchType < 0.3) {
		const numBlocks = Math.floor(Math.random() * 3) + 1
		for (let i = 0; i < numBlocks; i++) {
			const x = Math.floor(Math.random() * width)
			const y = Math.floor(Math.random() * height)
			const w = Math.floor(Math.random() * (width / 12) + 5)
			const h = Math.floor(Math.random() * (height / 30) + 3)
			const shiftX = Math.floor((Math.random() - 0.5) * 10)
			const shiftY = Math.floor((Math.random() - 0.5) * 3)

			context.fillStyle = getRandomColor()
			context.fillRect(x + shiftX, y + shiftY, w, h)
		}
	} else if (glitchType < 0.6) {
		const numLines = Math.floor(Math.random() * 4) + 2
		for (let i = 0; i < numLines; i++) {
			const y = Math.floor(Math.random() * height)
			const h = Math.floor(Math.random() * 1.0 + 0.25)
			const offsetX = Math.floor((Math.random() - 0.5) * (width / 6))
			const lineWidth = Math.floor(Math.random() * (width / 4) + width / 6)
			context.fillStyle =
				Math.random() < 0.6 ? 'rgba(200, 200, 200, 0.03)' : getRandomColor()
			context.fillRect(
				offsetX + Math.floor((Math.random() * width) / 5),
				y,
				lineWidth,
				h
			)
		}
	} else if (glitchType < 0.85) {
		const blockSize = Math.floor(Math.random() * 15) + 5
		const numBlocksX = Math.ceil(width / blockSize)
		const numBlocksY = Math.ceil(height / blockSize)
		for (let i = 0; i < numBlocksX; i++) {
			for (let j = 0; j < numBlocksY; j++) {
				if (Math.random() < 0.07) {
					context.fillStyle = getRandomColor()
					context.fillRect(i * blockSize, j * blockSize, blockSize, blockSize)
				}
			}
		}
	} else {
		context.font = `${Math.floor(Math.random() * 7 + 6)}px monospace`
		context.fillStyle = getRandomColor()
		if (Math.random() < 0.07) {
			context.fillText(
				'!ERR!',
				Math.floor(Math.random() * width),
				Math.floor(Math.random() * height)
			)
		}

		const shiftX = Math.floor((Math.random() - 0.5) * 5)
		const shiftY = Math.floor((Math.random() - 0.5) * 5)
		context.globalAlpha = 0.3
		if (Math.random() < 0.2) {
			context.fillStyle = 'rgba(100, 100, 100, 0.01)'
			for (let k = 0; k < 2; k++) {
				context.fillRect(
					Math.floor(Math.random() * width + shiftX),
					Math.floor(Math.random() * height + shiftY),
					Math.floor((Math.random() * width) / 4),
					Math.floor((Math.random() * height) / 4)
				)
			}
		}
		context.globalAlpha = 1.0
	}
}

// --- ANIMATION LOOP ---
const renderLoop = () => {
	animationFrameId = self.setTimeout(renderLoop, frameInterval)

	if (ctx) {
		drawGlitch(ctx, canvasLogicalWidth, canvasLogicalHeight)
	}
}

const start = () => {
	if (!animationFrameId) {
		renderLoop()
	}
}

const stop = () => {
	if (animationFrameId) {
		self.clearTimeout(animationFrameId)
		animationFrameId = null
	}
	if (ctx) {
		ctx.clearRect(0, 0, canvasLogicalWidth, canvasLogicalHeight)
	}
}

// --- MESSAGE HANDLER TYPES ---
type InitPayload = {
	canvas: OffscreenCanvas
	logicalWidth: number
	logicalHeight: number
	dpr: number
}

type ResizePayload = {
	logicalWidth: number
	logicalHeight: number
}

type WorkerMessage =
	| { type: 'init'; payload: InitPayload }
	| { type: 'start'; payload?: never }
	| { type: 'stop'; payload?: never }
	| { type: 'resize'; payload: ResizePayload }

// --- MESSAGE HANDLER ---
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
	const { type, payload } = e.data

	switch (type) {
		case 'init': {
			canvas = payload.canvas
			canvasLogicalWidth = payload.logicalWidth
			canvasLogicalHeight = payload.logicalHeight
			dpr = payload.dpr
			ctx = canvas.getContext('2d')
			if (ctx) {
				ctx.scale(dpr, dpr)
			}
			break
		}
		case 'start': {
			start()
			break
		}
		case 'stop': {
			stop()
			break
		}
		case 'resize': {
			if (!canvas || !ctx) break

			canvasLogicalWidth = payload.logicalWidth
			canvasLogicalHeight = payload.logicalHeight

			canvas.width = canvasLogicalWidth * dpr
			canvas.height = canvasLogicalHeight * dpr

			ctx.scale(dpr, dpr)

			// If the animation is running, draw one frame immediately
			// to prevent a blank canvas during resize.
			if (animationFrameId) {
				drawGlitch(ctx, canvasLogicalWidth, canvasLogicalHeight)
			}
			break
		}
	}
}
