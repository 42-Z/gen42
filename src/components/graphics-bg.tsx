import { cn } from "@/lib/utils";

const colors = {
	indigo: "#6c5cff",
	fuchsia: "#ff5ca8",
	sun: "#ffd54a",
	border: "#2b2652",
} as const;

type Props = { className?: string };

/* 1. Звёздочка 6-конечная */
export function DecoStar6({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 2l4.5 11.5L32 16l-11.5 4.5L16 32l-4.5-11.5L0 16l11.5-4.5z"
				fill={colors.sun}
			/>
		</svg>
	);
}

/* 2. Звёздочка 5-конечная */
export function DecoStar5({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 2l4.4 8.9 9.8 1.4-7.1 6.9 1.7 9.8L16 24.2 7.2 29l1.7-9.8-7.1-6.9 9.8-1.4z"
				fill={colors.sun}
			/>
		</svg>
	);
}

/* 3. Звёздочка 8-конечная */
export function DecoStar8({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 0l2.8 11.2L32 16l-13.2 4.8L16 32l-2.8-11.2L0 16l13.2-4.8z"
				fill={colors.sun}
			/>
		</svg>
	);
}

/* 4. Контурная звёздочка */
export function DecoStarOutline({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 2l4.4 8.9 9.8 1.4-7.1 6.9 1.7 9.8L16 24.2 7.2 29l1.7-9.8-7.1-6.9 9.8-1.4z"
				stroke={colors.sun}
				strokeWidth="2"
			/>
		</svg>
	);
}

/* 5. Сердечко */
export function DecoHeart({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 28s-12-8-12-16c0-4.4 3.6-8 8-8 2.8 0 5.2 1.4 6.6 3.5A7.9 7.9 0 0 1 25 5.2c4.4 0 8 3.6 8 8 0 8-12 16-12 16h-5z"
				fill={colors.fuchsia}
				transform="scale(0.85) translate(2,1)"
			/>
		</svg>
	);
}

/* 6. Контурное сердечко */
export function DecoHeartOutline({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 28s-12-8-12-16c0-4.4 3.6-8 8-8 2.8 0 5.2 1.4 6.6 3.5A7.9 7.9 0 0 1 25 5.2c4.4 0 8 3.6 8 8 0 8-12 16-12 16h-5z"
				stroke={colors.fuchsia}
				strokeWidth="2"
				transform="scale(0.85) translate(2,1)"
			/>
		</svg>
	);
}

/* 7. Ромб */
export function DecoDiamond({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path d="M16 2L30 16L16 30L2 16z" fill={colors.indigo} />
		</svg>
	);
}

/* 8. Контурный ромб */
export function DecoDiamondOutline({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 2L30 16L16 30L2 16z"
				stroke={colors.indigo}
				strokeWidth="2"
			/>
		</svg>
	);
}

/* 9. Кружок */
export function DecoCircle({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="16" cy="16" r="14" fill={colors.fuchsia} opacity="0.6" />
		</svg>
	);
}

/* 10. Контурный кружок */
export function DecoCircleOutline({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="16" cy="16" r="14" stroke={colors.indigo} strokeWidth="2" />
		</svg>
	);
}

/* 11. Кольцо */
export function DecoRing({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="16" cy="16" r="13" stroke={colors.fuchsia} strokeWidth="3" />
			<circle cx="16" cy="16" r="7" stroke={colors.fuchsia} strokeWidth="2" />
		</svg>
	);
}

/* 12. Гексагон */
export function DecoHexagon({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 2l12.1 7v14L16 30 3.9 23V9z"
				fill={colors.indigo}
				opacity="0.5"
			/>
		</svg>
	);
}

/* 13. Треугольник */
export function DecoTriangle({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path d="M16 4L30 28H2z" fill={colors.sun} opacity="0.7" />
		</svg>
	);
}

/* 14. Контурный треугольник */
export function DecoTriangleOutline({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path d="M16 4L30 28H2z" stroke={colors.sun} strokeWidth="2" />
		</svg>
	);
}

/* 15. Плюсик */
export function DecoCross({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"
				fill={colors.fuchsia}
				opacity="0.6"
			/>
		</svg>
	);
}

/* 16. Молния */
export function DecoLightning({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path d="M18 2L6 18h8l-2 12 12-16h-8z" fill={colors.sun} />
		</svg>
	);
}

/* 17. Луна-серп */
export function DecoMoon({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M20 4a12 12 0 1 0 0 24 10 10 0 0 1 0-24z"
				fill={colors.sun}
				opacity="0.7"
			/>
		</svg>
	);
}

/* 18. Облачко */
export function DecoCloud({ className }: Props) {
	return (
		<svg
			viewBox="0 0 40 28"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M10 24h22a8 8 0 0 0 0-16 8 8 0 0 0-8-2 10 10 0 0 0-18 6 6 6 0 0 0 4 12z"
				fill={colors.border}
				opacity="0.5"
			/>
		</svg>
	);
}

/* 19. Волнушка */
export function DecoWave({ className }: Props) {
	return (
		<svg
			viewBox="0 0 48 16"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M0 8c4-6 8-6 12 0s8 6 12 0 8-6 12 0 8 6 12 0"
				stroke={colors.indigo}
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* 20. Зигзаг */
export function DecoZigzag({ className }: Props) {
	return (
		<svg
			viewBox="0 0 48 16"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M0 14l8-12 8 12 8-12 8 12 8-12 8 12"
				stroke={colors.fuchsia}
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* 21. Маленькая спираль */
export function DecoSpiral({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 8c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8m0 4c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4"
				stroke={colors.indigo}
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* 22. Три точки */
export function DecoDots3({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 12"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="6" cy="6" r="3" fill={colors.indigo} />
			<circle cx="16" cy="6" r="3" fill={colors.fuchsia} />
			<circle cx="26" cy="6" r="3" fill={colors.sun} />
		</svg>
	);
}

/* 23. Три полоски */
export function DecoLines3({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 20"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<line
				x1="4"
				y1="4"
				x2="28"
				y2="4"
				stroke={colors.indigo}
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
			<line
				x1="4"
				y1="10"
				x2="28"
				y2="10"
				stroke={colors.fuchsia}
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
			<line
				x1="4"
				y1="16"
				x2="28"
				y2="16"
				stroke={colors.sun}
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* 24. Квадрат */
export function DecoSquare({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<rect
				x="4"
				y="4"
				width="24"
				height="24"
				rx="4"
				fill={colors.indigo}
				opacity="0.4"
			/>
		</svg>
	);
}

/* 25. Овал */
export function DecoOval({ className }: Props) {
	return (
		<svg
			viewBox="0 0 40 24"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<ellipse
				cx="20"
				cy="12"
				rx="18"
				ry="10"
				fill={colors.fuchsia}
				opacity="0.35"
			/>
		</svg>
	);
}

/* 26. Стрелка вверх */
export function DecoArrowUp({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M16 4v20M8 14l8-10 8 10"
				stroke={colors.sun}
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* 27. Цветочек */
export function DecoFlower({ className }: Props) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="16" cy="8" r="5" fill={colors.fuchsia} opacity="0.5" />
			<circle cx="22" cy="14" r="5" fill={colors.fuchsia} opacity="0.5" />
			<circle cx="20" cy="22" r="5" fill={colors.fuchsia} opacity="0.5" />
			<circle cx="12" cy="22" r="5" fill={colors.fuchsia} opacity="0.5" />
			<circle cx="10" cy="14" r="5" fill={colors.fuchsia} opacity="0.5" />
			<circle cx="16" cy="16" r="3.5" fill={colors.sun} />
		</svg>
	);
}

/* 28. Бесконечность */
export function DecoInfinity({ className }: Props) {
	return (
		<svg
			viewBox="0 0 40 20"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M8 10c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8zm16 0c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8z"
				stroke={colors.indigo}
				strokeWidth="2"
				transform="translate(-4,0)"
			/>
		</svg>
	);
}

/* 29. Восклицательный знак */
export function DecoExcl({ className }: Props) {
	return (
		<svg
			viewBox="0 0 20 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<rect x="7" y="2" width="6" height="16" rx="3" fill={colors.fuchsia} />
			<circle cx="10" cy="26" r="3" fill={colors.fuchsia} />
		</svg>
	);
}

/* 30. Вопросительный знак */
export function DecoQuestion({ className }: Props) {
	return (
		<svg
			viewBox="0 0 24 32"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M8 4a10 10 0 0 1 14 8c0 5-6 7-8 9"
				stroke={colors.indigo}
				strokeWidth="3"
				strokeLinecap="round"
				fill="none"
			/>
			<circle cx="14" cy="26" r="3" fill={colors.indigo} />
		</svg>
	);
}
