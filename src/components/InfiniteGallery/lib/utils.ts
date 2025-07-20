import { getColumnPreviewImageUrls } from './galleryData'
import { GridDimensions } from './types'

export const getIsTouchDevice = (): boolean => {
	if (typeof window === 'undefined') return false
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

const _preloadedFullUrls = new Set<string>()

export const preloadFullImage = (url: string): void => {
	if (!_preloadedFullUrls.has(url)) {
		_preloadedFullUrls.add(url)
		const img = new Image()
		img.src = url
	}
}

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
