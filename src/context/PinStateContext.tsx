import React, { createContext, useState, useContext, ReactNode, useMemo } from 'react';

type PinStateContextType = {
	isAboutMePinned: boolean;
	setIsAboutMePinned: (isPinned: boolean) => void;
	isGalleryPinned: boolean;
	setIsGalleryPinned: (isPinned: boolean) => void;
	isOverlayActive: boolean; // Derived state
};

const PinStateContext = createContext<PinStateContextType | undefined>(undefined);

export const PinStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [isAboutMePinned, setIsAboutMePinned] = useState(false);
	const [isGalleryPinned, setIsGalleryPinned] = useState(false);

	// Overlay is active if NEITHER component is pinned
	const isOverlayActive = useMemo(() => !isAboutMePinned && !isGalleryPinned, [isAboutMePinned, isGalleryPinned]);

	const contextValue = useMemo(() => ({
		isAboutMePinned,
		setIsAboutMePinned,
		isGalleryPinned,
		setIsGalleryPinned,
		isOverlayActive
	}), [isAboutMePinned, isGalleryPinned, isOverlayActive]);

	return (
		<PinStateContext.Provider value={contextValue}>
			{children}
		</PinStateContext.Provider>
	);
};

export const usePinState = (): PinStateContextType => {
	const context = useContext(PinStateContext);
	if (!context) {
		throw new Error('usePinState must be used within a PinStateProvider');
	}
	return context;
}; 