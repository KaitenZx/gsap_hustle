import { gsap } from 'gsap'

export type GridDimensions = {
	viewportWidth: number
	viewportHeight: number
	columnWidth: number
	columnGap: number
	columnTotalWidth: number // Ширина колонки + gap
	itemHeight: number
	rowGap: number
	totalContentLogicalWidth: number // Ширина COLS колонок + gap'ы
	totalContentHeight: number // Высота ROWS строк + gap'ы (без padding wrapper'а)
	fullWrapperHeight: number // Полная высота контента с padding'ами wrapper'а
	repeatingWidth: number // Ширина для горизонтального wrap
	repeatingHeight: number // Высота для вертикального wrap
	wrapX: (value: number) => number // Функция Wrap для горизонтали
	wrapY: (value: number) => number // Функция Wrap для вертикали
	wrapperPaddingTop: number // <<< ADDED: Top padding of the content wrapper
	wrapperPaddingLeft: number // <<< ADDED: Left padding of the content wrapper
}

export type MediaAnimData = {
	element: HTMLDivElement | null
	rotX: ReturnType<typeof gsap.quickTo> | null
	rotY: ReturnType<typeof gsap.quickTo> | null
	visualColumnIndex: number // <<< ADDED: Visual index of the column
	visualRowIndexInColumn: number // <<< ADDED: Visual index of the item within its column
	lastRotX?: number // <<< ADDED: Last applied rotationX
	lastRotY?: number // <<< ADDED: Last applied rotationY
}
