// src/lib/__tests__/ui-css.test.ts
import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	ALLOWED_ANIMATED,
	animatedProperties,
	bannedTokens,
} from "../sheet/css-lint";

const SRC = path.join(import.meta.dir, "../..");
const files = [...new Bun.Glob("**/*.css").scanSync({ cwd: SRC })].filter(
	(f) => !f.endsWith("sheet.generated.css"),
);

describe("CSS приложения", () => {
	test("найдены файлы", () => {
		expect(files).toContain("index.css");
		expect(files).toContain("sheet.css");
	});

	for (const file of files) {
		const css = Bun.file(path.join(SRC, file)).text();
		test(`${file}: анимируются только transform, translate, scale, rotate, opacity`, async () => {
			const bad = [...animatedProperties(await css)].filter(
				(p) => !ALLOWED_ANIMATED.has(p),
			);
			expect(bad).toEqual([]);
		});
		test(`${file}: нет filter, backdrop-filter, mix-blend-mode, @property, теней`, async () => {
			const text = await css;
			expect(bannedTokens(text)).toEqual([]);
			expect(text).not.toMatch(/(box|text)-shadow|drop-shadow|feTurbulence/);
		});
	}
});
