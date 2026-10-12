// src/components/sheet/Sheet.tsx
import { useEffect } from "react";
import { startImpulses } from "@/lib/sheet/impulses";

/** Фон: тёмная полоса листа; абсолютный слой на весь корень экрана (прокручивается со страницей) */
export function Sheet() {
	return (
		<div data-slot="sheet" aria-hidden="true" className="sheet">
			<i />
		</div>
	);
}

/** Слушатели импульсов и реестр окон: один раз на приложение */
export function useSheetRuntime(): void {
	useEffect(() => startImpulses(), []);
}
