import { getColumnPreviewImageUrls } from './galleryData'
import { GridDimensions } from './types'

/**
 * Checks if the current environment is a touch-capable device.
 * @returns {boolean} True if it's a touch device, false otherwise.
 */
export const getIsTouchDevice = (): boolean => {
	if (typeof window === 'undefined') return false
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

const _preloadedFullUrls = new Set<string>()
/**
 * Initiates preloading of a full-size image if it hasn't been requested before.
 * @param {string} url - The URL of the full-size image to preload.
 */
export const preloadFullImage = (url: string): void => {
	if (!_preloadedFullUrls.has(url)) {
		_preloadedFullUrls.add(url)
		const img = new Image()
		img.src = url
	}
}

/**
 * Calculates the preview image URLs to preload on initial component load.
 * @param {GridDimensions} dimensions - The current grid dimensions.
 * @param {number} mobileBreakpoint - The pixel width to differentiate mobile.
 * @param {number} desktopBuffer - The number of columns to preload on desktop.
 * @param {number} mobileBuffer - The number of columns to preload on mobile.
 * @returns {string[]} An array of image URLs to preload.
 */
export const getInitialPreloadUrls = (
	dimensions: GridDimensions,
	mobileBreakpoint: number,
	desktopBuffer: number,
	mobileBuffer: number
): string[] => {
	const urls: string[] = []
	if (!dimensions || dimensions.columnTotalWidth <= 0) return urls

	const visibleColsApprox = Math.ceil(
		dimensions.viewportWidth / dimensions.columnTotalWidth
	)
	const preloadBuffer =
		dimensions.viewportWidth <= mobileBreakpoint ? mobileBuffer : desktopBuffer

	for (let i = -preloadBuffer; i < visibleColsApprox + preloadBuffer; i++) {
		urls.push(...getColumnPreviewImageUrls(i))
	}
	return urls
}

/**
 * Calculates the preview image URLs to preload during horizontal scroll.
 * @param {'left' | 'right'} direction - The direction of the scroll.
 * @param {GridDimensions} dimensions - The current grid dimensions.
 * @param {number} currentX - The current horizontal scroll position.
 * @param {number} mobileBreakpoint - The pixel width to differentiate mobile.
 * @param {number} preloadColsDesktop - The number of columns to preload on desktop.
 * @param {number} preloadColsMobile - The number of columns to preload on mobile.
 * @returns {string[]} An array of image URLs to preload.
 */
export const calculateUrlsToPreloadOnScroll = (
	direction: 'left' | 'right',
	dimensions: GridDimensions,
	currentX: number,
	mobileBreakpoint: number,
	preloadColsDesktop: number,
	preloadColsMobile: number
): string[] => {
	const urls: string[] = []
	if (!dimensions || dimensions.columnTotalWidth <= 0) return urls

	const currentWrappedX = dimensions.wrapX(currentX)
	const currentApproxFirstVisibleColIndex = Math.floor(
		-currentWrappedX / dimensions.columnTotalWidth
	)

	const preloadColsCount =
		dimensions.viewportWidth <= mobileBreakpoint
			? preloadColsMobile
			: preloadColsDesktop

	let firstColToPreload: number

	if (direction === 'left') {
		firstColToPreload = currentApproxFirstVisibleColIndex - preloadColsCount
	} else {
		const visibleColsApprox = Math.ceil(
			dimensions.viewportWidth / dimensions.columnTotalWidth
		)
		firstColToPreload = currentApproxFirstVisibleColIndex + visibleColsApprox
	}

	for (let i = 0; i < preloadColsCount; i++) {
		const colIndexToPreload = firstColToPreload + i
		urls.push(...getColumnPreviewImageUrls(colIndexToPreload))
	}

	return urls
}
