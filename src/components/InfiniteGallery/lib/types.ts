import { gsap } from 'gsap'

export type GridDimensions = {
	viewportWidth: number
	viewportHeight: number
	columnWidth: number
	columnGap: number
	columnTotalWidth: number
	itemHeight: number
	rowGap: number
	totalContentLogicalWidth: number
	totalContentHeight: number
	fullWrapperHeight: number
	repeatingWidth: number
	repeatingHeight: number
	wrapX: (value: number) => number
	wrapY: (value: number) => number
	wrapperPaddingTop: number
	wrapperPaddingLeft: number
}

export type MediaAnimData = {
	element: HTMLDivElement | null
	rotX: ReturnType<typeof gsap.quickTo> | null
	rotY: ReturnType<typeof gsap.quickTo> | null
	visualColumnIndex: number
	visualRowIndexInColumn: number
	lastRotX?: number
	lastRotY?: number
}
