// src/components/sheet/use-field-fx.ts
import type { Ref, RefCallback } from "react";
import { caretOf } from "@/lib/sheet/caret";
import { impulse } from "@/lib/sheet/impulses";
import { isEraseInput, showTail } from "@/lib/sheet/tail";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Поле отвечает на ввод: каждая буква — лёгкий импульс вперёд (стирание — назад)
 * не чаще раза в 140 мс, за кареткой тянется хвост листа; фокус — слабый импульс.
 */
export function fieldFx(el: Field): () => void {
	let last = 0;
	const onInput = (e: Event) => {
		const erase = isEraseInput((e as InputEvent).inputType);
		const point = caretOf(el);
		if (point) showTail(point, erase ? -1 : 1);
		const now = performance.now();
		if (now - last > 140) {
			last = now;
			impulse({
				source: el,
				sign: erase ? -1 : 1,
				weight: 0.15,
				mass: "light",
			});
		}
	};
	const onFocus = () =>
		impulse({ source: el, sign: 1, weight: 0.1, mass: "light" });
	el.addEventListener("input", onInput);
	el.addEventListener("focus", onFocus);
	return () => {
		el.removeEventListener("input", onInput);
		el.removeEventListener("focus", onFocus);
	};
}

/** Ref-колбэк для `input`/`textarea`; внешний ref пользователя сохраняется */
export function useFieldFx<T extends Field>(external?: Ref<T>): RefCallback<T> {
	return (el) => {
		const stop = el ? fieldFx(el) : undefined;
		let back: (() => void) | undefined;
		if (typeof external === "function") {
			const r = external(el);
			back = typeof r === "function" ? r : undefined;
		} else if (external) (external as { current: T | null }).current = el;
		return () => {
			stop?.();
			if (back) back();
			else if (typeof external === "function") external(null);
			else if (external) (external as { current: T | null }).current = null;
		};
	};
}
