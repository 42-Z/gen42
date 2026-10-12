// src/lib/__tests__/sheet-proto-css.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	ALLOWED_ANIMATED,
	animatedProperties,
	bannedTokens,
} from "../sheet/css-lint";

const css = readFileSync(
	path.join(import.meta.dir, "../../../scripts/sheet-proto/proto.css"),
	"utf8",
);

describe("CSS прототипа", () => {
	test("анимируются только transform, translate, scale, rotate, opacity", () => {
		const bad = [...animatedProperties(css)].filter(
			(p) => !ALLOWED_ANIMATED.has(p),
		);
		expect(bad).toEqual([]);
	});

	test("нет filter, backdrop-filter, mix-blend-mode, @property", () => {
		expect(bannedTokens(css)).toEqual([]);
	});

	test("теней нет", () => {
		expect(css).not.toMatch(/(box|text)-shadow|drop-shadow/);
	});

	test("подключает сгенерированные токены листа", () => {
		expect(css).toContain('@import "../../src/sheet.generated.css"');
	});

	test("при reduced-motion отключены дрейф и переходы окон", () => {
		const block = css.slice(css.indexOf("prefers-reduced-motion"));
		expect(block).toContain(".sheet > i");
		expect(block).toContain("animation: none");
	});
});
