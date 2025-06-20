import { useLayoutEffect, useCallback } from 'react'

import { gsap } from 'gsap'
import { debounce } from 'lodash'

import { COLS, ROWS } from '../galleryData'
import { GridDimensions } from '../types'

const DEBOUNCE_RESIZE_MS = 150
const RENDER_COLS_BUFFER = 4

interface UseGridDimensionsProps {
	containerRef: React.RefObject<HTMLDivElement | null>
	contentWrapperRef: React.RefObject<HTMLDivElement | null>
	columnRef: React.RefObject<HTMLDivElement | null>
	itemRef: React.RefObject<HTMLDivElement | null>
	onResize: (newDims: GridDimensions) => void
	currentRenderCols: number
	setRenderColsCount: (count: number) => void
}

// This hook provides calculation functions and sets up the resize observer
export const useGridDimensions = ({
	containerRef,
	contentWrapperRef,
	columnRef,
	itemRef,
	onResize,
	currentRenderCols,
	setRenderColsCount,
}: UseGridDimensionsProps) => {
	const calculateDimensions = useCallback((): GridDimensions | null => {
		const firstColumn = columnRef.current
		const firstItemContainer = itemRef.current
		const wrapperElement = contentWrapperRef.current
		const containerElement = containerRef.current

		if (
			!firstColumn ||
			!firstItemContainer ||
			!wrapperElement ||
			!containerElement
		) {
			console.warn('IFG: Refs not available for measurement yet.')
			return null
		}

		const computedStyleColumn = window.getComputedStyle(firstColumn)
		const computedStyleWrapper = window.getComputedStyle(wrapperElement)
		const viewportWidth = containerElement.clientWidth
		const viewportHeight = containerElement.clientHeight
		const colRect = firstColumn.getBoundingClientRect()
		const itemContainerRect = firstItemContainer.getBoundingClientRect()
		const columnWidth = colRect.width
		const itemHeight = itemContainerRect.height
		const columnGap = parseFloat(computedStyleWrapper.columnGap) || 0
		const rowGap = parseFloat(computedStyleColumn.rowGap) || 0
		const wrapperPaddingTop = parseFloat(computedStyleWrapper.paddingTop) || 0
		const wrapperPaddingBottom =
			parseFloat(computedStyleWrapper.paddingBottom) || 0
		const wrapperPaddingLeft = parseFloat(computedStyleWrapper.paddingLeft) || 0

		if (
			!viewportWidth ||
			!viewportHeight ||
			!columnWidth ||
			!itemHeight ||
			!Number.isFinite(columnWidth) ||
			!Number.isFinite(itemHeight) ||
			itemHeight <= 0
		) {
			console.error('IFG: Failed to get valid base dimensions.', {
				viewportWidth,
				viewportHeight,
				columnWidth,
				itemHeight,
			})
			return null
		}

		const columnTotalWidth = columnWidth + columnGap
		const gridContentHeight = ROWS * itemHeight + Math.max(0, ROWS - 1) * rowGap
		const fullWrapperHeight =
			gridContentHeight + wrapperPaddingTop + wrapperPaddingBottom
		const totalContentLogicalWidth =
			COLS * columnWidth + Math.max(0, COLS - 1) * columnGap
		const repeatingWidth = COLS * columnTotalWidth
		const repeatingHeight = gridContentHeight

		if (
			columnTotalWidth <= 0 ||
			repeatingHeight <= 0 ||
			!Number.isFinite(totalContentLogicalWidth) ||
			!Number.isFinite(repeatingWidth) ||
			!Number.isFinite(repeatingHeight)
		) {
			console.error('IFG: Invalid calculated widths/heights.', {
				columnTotalWidth,
				totalContentLogicalWidth,
				repeatingWidth,
				repeatingHeight,
			})
			return null
		}

		const wrapX = gsap.utils.wrap(-repeatingWidth, 0)
		const wrapY = gsap.utils.wrap(-repeatingHeight, 0)

		const newDimensions: GridDimensions = {
			viewportWidth,
			viewportHeight,
			columnWidth,
			itemHeight,
			rowGap,
			columnGap,
			columnTotalWidth,
			totalContentLogicalWidth,
			totalContentHeight: gridContentHeight,
			fullWrapperHeight,
			repeatingWidth,
			repeatingHeight,
			wrapX,
			wrapY,
			wrapperPaddingTop,
			wrapperPaddingLeft,
		}

		return newDimensions
	}, [columnRef, itemRef, contentWrapperRef, containerRef])

	const calculateRenderCols = useCallback((dims: GridDimensions): number => {
		if (!dims || dims.columnTotalWidth <= 0) {
			console.warn(
				'IFG: Cannot calculate render cols, invalid dimensions. Falling back to COLS.'
			)
			return COLS
		}
		const requiredCols = Math.ceil(
			(dims.totalContentLogicalWidth + dims.viewportWidth) /
				dims.columnTotalWidth
		)
		const count = requiredCols + RENDER_COLS_BUFFER
		return count
	}, [])

	useLayoutEffect(() => {
		const containerElement = containerRef.current
		if (!containerElement) return

		const debouncedResizeHandler = debounce(() => {
			const newDims = calculateDimensions()
			if (newDims) {
				const newRenderCols = calculateRenderCols(newDims)
				if (newRenderCols !== currentRenderCols) {
					setRenderColsCount(newRenderCols)
				}
				onResize(newDims)
			}
		}, DEBOUNCE_RESIZE_MS)

		const resizeObserver = new ResizeObserver(debouncedResizeHandler)
		resizeObserver.observe(containerElement)

		return () => {
			resizeObserver.disconnect()
			debouncedResizeHandler.cancel()
		}
	}, [
		calculateDimensions,
		calculateRenderCols,
		onResize,
		containerRef,
		currentRenderCols,
		setRenderColsCount,
	])

	return { calculateDimensions, calculateRenderCols }
}
