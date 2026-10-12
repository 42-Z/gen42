import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { useFlip } from "@/components/sheet/use-flip";
import { impulse } from "@/lib/sheet/impulses";
import type { Mass } from "@/lib/sheet/springs";
import { cn } from "@/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	// у корня Radix нет роли slider: имя и текстовое значение читает скринридер у
	// ползунка, поэтому они уходят на него, а не в `props` корня
	"aria-label": ariaLabel,
	"aria-valuetext": ariaValueText,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min, max],
		[value, defaultValue, min, max],
	);

	const thumbRef = React.useRef<HTMLSpanElement>(null);
	const rangeRef = React.useRef<HTMLSpanElement>(null);
	const level = _values[0] ?? min;
	const index = (level - min) / (max - min || 1);
	// у каждого уровня своя масса: нижний лёгкий, верхний тяжёлый
	const mass: Mass = index <= 0 ? "light" : index >= 1 ? "heavy" : "medium";
	useFlip(thumbRef, level, { mass, origin: "center" });
	useFlip(rangeRef, level, { mass, origin: "left" });
	const prevLevel = React.useRef(level);
	React.useLayoutEffect(() => {
		if (prevLevel.current === level) return;
		const source = thumbRef.current;
		if (source) {
			impulse({
				source,
				sign: level > prevLevel.current ? 1 : -1,
				weight: 0.2 + 0.4 * index,
				mass,
			});
		}
		prevLevel.current = level;
	}, [level, index, mass]);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				data-sheet="dark"
				className={cn(
					"relative grow overflow-hidden rounded-full border border-border data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
				)}
			>
				<SheetLayer />
				<SliderPrimitive.Range
					ref={rangeRef}
					data-slot="slider-range"
					data-sheet="spectrum"
					className={cn(
						"absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
					)}
				>
					<SheetLayer />
				</SliderPrimitive.Range>
			</SliderPrimitive.Track>
			{Array.from({ length: _values.length }, (_, i) => (
				<SliderPrimitive.Thumb
					ref={i === 0 ? thumbRef : undefined}
					data-slot="slider-thumb"
					data-sheet="ridge"
					key={i}
					// без значения атрибут не передаётся: явный undefined затёр бы подписи
					// «Minimum»/«Maximum», которые Radix строит сам у диапазона
					{...(ariaLabel ? { "aria-label": ariaLabel } : {})}
					{...(ariaValueText ? { "aria-valuetext": ariaValueText } : {})}
					className="block h-[30px] w-[46px] shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					<SheetLayer />
				</SliderPrimitive.Thumb>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
