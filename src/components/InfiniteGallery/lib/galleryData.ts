type ImageModule = {
	default: string
}

// Load both preview and full-resolution images using Vite's glob import feature.
const previewImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/preview/*.webp', { eager: true })
const fullImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/full/*.webp', { eager: true })

const extractImageData = (
	path: string,
	module: ImageModule | undefined
): { id: number; url: string } | null => {
	// Regex to extract the numeric ID from the filename (e.g., '123' from '.../123.webp').
	const match = /([\w-]+)\/(\d+)\.webp$/.exec(path)
	const id = match ? parseInt(match[2], 10) : -1
	const url = module?.default
	if (id !== -1 && typeof url === 'string') {
		return { id, url }
	}
	return null
}

const previewImages = Object.entries(previewImageModules)
	.map(([path, module]) => extractImageData(path, module))
	.filter((item): item is { id: number; url: string } => item !== null)

const fullImageUrlsById: Map<number, string> = new Map<number, string>()
Object.entries(fullImageModules).forEach(([path, module]) => {
	const imageData = extractImageData(path, module)
	if (imageData) {
		fullImageUrlsById.set(imageData.id, imageData.url)
	}
})

export type GalleryItem = {
	id: number
	previewSrc: string
	fullSrc: string
	alt: string
}

// --- Grid Configuration ---
export const ROWS = 7
export const COLS = 28
export const TOTAL_ITEMS = ROWS * COLS
export const RENDER_ROWS_BUFFER = 4

// --- Data Generation ---
const sourceItems = previewImages
	.map((previewItem) => {
		const fullSrc = fullImageUrlsById.get(previewItem.id)
		return fullSrc
			? {
					id: previewItem.id,
					previewSrc: previewItem.url,
					fullSrc: fullSrc,
					alt: `Gallery image ${previewItem.id}`,
			  }
			: null
	})
	.filter((item): item is GalleryItem => item !== null)

export const ITEMS: GalleryItem[] = []
if (sourceItems.length > 0) {
	for (let i = 0; i < TOTAL_ITEMS; i++) {
		ITEMS.push(sourceItems[i % sourceItems.length])
	}
	if (sourceItems.length < TOTAL_ITEMS) {
		console.warn(
			`[InfiniteGalleryData] Warning: Only found ${sourceItems.length} unique valid image pairs, but TOTAL_ITEMS is ${TOTAL_ITEMS}. Repeating items to fill the grid.`
		)
	}
} else {
	console.error(
		'[InfiniteGalleryData] Error: No valid image pairs found. Gallery will be empty.'
	)
}

if (ITEMS.length < previewImages.slice(0, TOTAL_ITEMS).length) {
	console.warn(
		`[InfiniteGalleryData] Warning: Some full-size images corresponding to preview images (up to ${TOTAL_ITEMS}) were not found in '/src/assets/full/'. Check filenames.`
	)
} else if (ITEMS.length < TOTAL_ITEMS) {
	console.warn(
		`[InfiniteGalleryData] Warning: Expected ${TOTAL_ITEMS} preview images, but only found ${previewImages.length} in '/src/assets/preview/'.`
	)
}

const _preloadedUrls = new Set<string>()

export const preloadImage = (url: string) => {
	if (!_preloadedUrls.has(url)) {
		_preloadedUrls.add(url)
		const img = new Image()
		img.src = url
	}
}

export const getColumnPreviewImageUrls = (columnIndex: number): string[] => {
	const urls: string[] = []
	// Wrap the index to create an infinite loop effect.
	const wrappedIndex = ((columnIndex % COLS) + COLS) % COLS
	const baseItemIndex = wrappedIndex * ROWS
	for (let i = 0; i < ROWS; i++) {
		const itemIndex = baseItemIndex + i
		if (itemIndex < ITEMS.length) {
			urls.push(ITEMS[itemIndex].previewSrc)
		}
	}
	return urls
}
