// src/lib/__tests__/sheet-css.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSheetCss, gradient, STOPS_PER_TILE, TILE_PX } from "../sheet/css";
import {
	ALLOWED_ANIMATED,
	animatedProperties,
	bannedTokens,
} from "../sheet/css-lint";

const stopsOf = (g: string): string[] =>
	g
		.slice("linear-gradient(135deg, ".length, -1)
		.split(", ")
		.map((s) => s.replace(/ [\d.]+%$/, ""));

describe("градиент листа", () => {
	test("65 остановок, плитка стыкуется без шва: конец равен началу, период 0,5", () => {
		for (const role of ["dark", "ridge", "spectrum"] as const) {
			const g = gradient(role);
			expect(g.startsWith("linear-gradient(135deg, ")).toBe(true);
			const stops = stopsOf(g);
			expect(stops).toHaveLength(STOPS_PER_TILE + 1);
			expect(stops[0]).toBe(stops[STOPS_PER_TILE]);
			for (let i = 0; i <= STOPS_PER_TILE / 2; i++) {
				expect(stops[i]).toBe(stops[i + STOPS_PER_TILE / 2]);
			}
		}
		expect(TILE_PX).toBe(1600);
	});

	test("первая остановка — опора S0 для хребта, база-смесь для фона", () => {
		expect(stopsOf(gradient("ridge"))[0]).toBe("rgb(108 92 255)");
		expect(stopsOf(gradient("dark"))[0]).not.toBe("rgb(108 92 255)");
	});
});

describe("сгенерированный CSS", () => {
	test("файл совпадает с генератором (токены не расходятся с модулями)", () => {
		const file = readFileSync(
			path.join(import.meta.dir, "../../sheet.generated.css"),
			"utf8",
		);
		expect(file).toBe(buildSheetCss());
	});

	test("содержит все токены", () => {
		const css = buildSheetCss();
		for (const name of [
			"--sheet-tile: 1600px",
			"--sheet-dark: linear-gradient(135deg,",
			"--sheet-ridge: linear-gradient(135deg,",
			"--sheet-spectrum: linear-gradient(135deg,",
			"--edge: rgb(108 92 255)",
			"--text: rgb(242 239 255)",
			"--text-2: rgb(167 159 203)",
			"--error: rgb(255 107 129)",
			"--wave-max: 280ms",
			"--spring-light: linear(",
			"--spring-medium: linear(",
			"--spring-heavy: linear(",
			"--spring-light-ms: 180ms",
			"--spring-medium-ms: 280ms",
			"--spring-heavy-ms: 500ms",
			"--release-heavy-ms: 1100ms",
		]) {
			expect(css).toContain(name);
		}
	});

	test("в сгенерированном CSS нет анимаций и запрещённых свойств", () => {
		const css = buildSheetCss();
		expect(animatedProperties(css).size).toBe(0);
		expect(bannedTokens(css)).toEqual([]);
	});
});

describe("css-lint", () => {
	test("находит свойства в @keyframes и transition", () => {
		const css = `
			@keyframes a { from { transform: none; opacity: 0 } to { translate: 4px 0; background-position: 1px 1px } }
			.x { transition: transform .2s ease, box-shadow .3s; }
			.y { transition-property: scale, width; transition-duration: 1s; }
			.z { transition: all .1s; }
		`;
		const props = animatedProperties(css);
		for (const p of [
			"transform",
			"opacity",
			"translate",
			"background-position",
			"box-shadow",
			"scale",
			"width",
			"all",
		]) {
			expect(props.has(p)).toBe(true);
		}
		expect(props.has("transition-duration")).toBe(false);
	});

	test("разрешённые свойства и запрещённые токены", () => {
		expect([...ALLOWED_ANIMATED].sort()).toEqual([
			"opacity",
			"rotate",
			"scale",
			"transform",
			"translate",
		]);
		expect(
			bannedTokens(
				".a{filter:blur(2px)} .b{backdrop-filter:none} .c{mix-blend-mode:screen} @property --x{}",
			).sort(),
		).toEqual(["@property", "backdrop-filter", "filter", "mix-blend-mode"]);
		expect(bannedTokens(".a{-webkit-backdrop-filter:none}")).toEqual([
			"backdrop-filter",
		]);
		expect(bannedTokens(".a{transform:none}")).toEqual([]);
	});
});
