// --- Типизация для импортированного модуля изображения ---
type ImageModule = {
	default: string
}

// --- Загрузка И ПРЕВЬЮ, И ПОЛНЫХ изображений с помощью Vite Glob Import ---
const previewImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/preview/*.webp', { eager: true })
const fullImageModules: Record<string, ImageModule | undefined> =
	import.meta.glob('/src/assets/full/*.webp', { eager: true })

// --- Вспомогательная функция для извлечения ID и URL из пути ---
const extractImageData = (
	path: string,
	module: ImageModule | undefined
): { id: number; url: string } | null => {
	// Используем регулярное выражение, которое найдет число перед .webp, игнорируя путь
	const match = /([\w-]+)\/(\d+)\.webp$/.exec(path) // Находит 'preview'/'full' и 'id'
	const id = match ? parseInt(match[2], 10) : -1
	const url = module?.default
	if (id !== -1 && typeof url === 'string') {
		return { id, url }
	}
	return null
}

// --- Обработка и СОПОСТАВЛЕНИЕ URL превью и полных изображений ---
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

// Сортируем превью по ID
previewImages.sort((a, b) => a.id - b.id)

// --- Обновленная типизация для элемента галереи ---
export type GalleryItem = {
	id: number
	previewSrc: string // Превью
	fullSrc: string // Полная версия
	alt: string
}

// --- Константы ---
export const ROWS = 7 // Количество строк в логической сетке
export const COLS = 28 // Количество КОЛОНОК в ЛОГИЧЕСКОЙ сетке (определяет wrap)
export const TOTAL_ITEMS = ROWS * COLS
export const RENDER_ROWS_BUFFER = 4 // Сколько доп. строк рендерить снизу

// --- Генерация данных ---
// Убедимся, что берем ровно TOTAL_ITEMS, если их достаточно
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

// --- Заполняем массив ITEMS до TOTAL_ITEMS, повторяя элементы, если нужно ---
export const ITEMS: GalleryItem[] = []
if (sourceItems.length > 0) {
	for (let i = 0; i < TOTAL_ITEMS; i++) {
		ITEMS.push(sourceItems[i % sourceItems.length])
	}
	// Добавляем предупреждение, если исходных уникальных элементов меньше TOTAL_ITEMS
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

// Проверка, достаточно ли ПОЛНЫХ изображений найдено для каждого превью
if (ITEMS.length < previewImages.slice(0, TOTAL_ITEMS).length) {
	console.warn(
		`[InfiniteGalleryData] Warning: Some full-size images corresponding to preview images (up to ${TOTAL_ITEMS}) were not found in '/src/assets/full/'. Check filenames.`
	)
} else if (ITEMS.length < TOTAL_ITEMS) {
	// Предупреждение, если изначально не хватило превью
	console.warn(
		`[InfiniteGalleryData] Warning: Expected ${TOTAL_ITEMS} preview images, but only found ${previewImages.length} in '/src/assets/preview/'.`
	)
}

// --- НОВЫЕ ЭКСПОРТИРУЕМЫЕ УТИЛИТЫ ДЛЯ ПРЕДЗАГРУЗКИ ---

// Глобальный Set для отслеживания URL превью, которые уже были запрошены
const _preloadedUrls = new Set<string>()

/**
 * Запускает предзагрузку превью-изображения, если оно не было загружено ранее.
 * @param url URL превью-изображения для предзагрузки.
 */
export const preloadImage = (url: string) => {
	if (!_preloadedUrls.has(url)) {
		_preloadedUrls.add(url)
		const img = new Image()
		img.src = url
	}
}

/**
 * Возвращает массив URL превью-изображений для указанной колонки.
 * @param columnIndex Индекс колонки.
 * @returns Массив строк с URL.
 */
export const getColumnPreviewImageUrls = (columnIndex: number): string[] => {
	const urls: string[] = []
	// Обертка индекса для бесконечной прокрутки
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
