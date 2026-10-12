// src/lib/__tests__/sheet-doodles.test.ts
import { describe, expect, test } from "bun:test";
import {
	DOODLE_MS,
	DOODLES,
	FIRST_DELAY_MS,
	GAP_MS,
	isDoodleKind,
	nextDelay,
	pickDoodle,
} from "../sheet/doodles";

describe("дудлы: выбор вида", () => {
	test("не повторяет только что показанный вид", () => {
		for (const last of DOODLES) {
			for (let i = 0; i <= 20; i++) {
				expect(pickDoodle(last, () => i / 20)).not.toBe(last);
			}
		}
	});

	test("первый показ может быть любым видом, и по краям случайного числа выбор остаётся в списке", () => {
		expect(DOODLES).toContain(pickDoodle(null, () => 0));
		expect(DOODLES).toContain(pickDoodle(null, () => 0.999999));
		expect(pickDoodle(null, () => 0)).toBe(DOODLES[0]);
		expect(pickDoodle(null, () => 0.999999)).toBe(DOODLES.at(-1)!);
	});

	test("за много показов встречаются все виды", () => {
		const seen = new Set<string>();
		let last: (typeof DOODLES)[number] | null = null;
		for (let i = 0; i < 200; i++) {
			last = pickDoodle(last);
			seen.add(last);
		}
		expect(seen.size).toBe(DOODLES.length);
	});

	test("isDoodleKind узнаёт только свои виды", () => {
		expect(isDoodleKind("pug")).toBe(true);
		expect(isDoodleKind("cat")).toBe(false);
		expect(isDoodleKind(undefined)).toBe(false);
	});
});

describe("дудлы: паузы", () => {
	test("первая пауза и паузы между показами лежат в своих границах", () => {
		expect(nextDelay(true, () => 0)).toBe(FIRST_DELAY_MS[0]);
		expect(nextDelay(true, () => 0.999999)).toBeLessThanOrEqual(
			FIRST_DELAY_MS[1],
		);
		expect(nextDelay(false, () => 0)).toBe(GAP_MS[0]);
		expect(nextDelay(false, () => 0.999999)).toBeLessThanOrEqual(GAP_MS[1]);
	});

	test("между показами проходит заметно больше времени, чем идёт сам показ", () => {
		expect(GAP_MS[0]).toBeGreaterThan(DOODLE_MS * 5);
	});
});
