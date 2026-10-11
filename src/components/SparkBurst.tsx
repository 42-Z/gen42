const COLORS = ["#6c5cff", "#ff5ca8", "#ffd54a"] as const;
const COUNT = 18;

/**
 * Разовый салют из искр при появлении результата.
 * Позиции детерминированы (без Math.random), чтобы рендер был стабильным.
 */
export function SparkBurst() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-10"
		>
			{Array.from({ length: COUNT }, (_, i) => (
				<span
					key={i}
					className="pop-spark"
					style={
						{
							"--a": `${(360 / COUNT) * i}deg`,
							"--d": `${150 + (i % 3) * 60}px`,
							background: COLORS[i % COLORS.length],
							animationDelay: `${(i % 4) * 40}ms`,
						} as React.CSSProperties
					}
				/>
			))}
		</div>
	);
}
