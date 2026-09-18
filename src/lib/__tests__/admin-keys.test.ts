import { describe, expect, test } from "bun:test";
import { isValidKeyForProvider, keyPrefixFor } from "../keys";

describe("валидация ключей по провайдеру", () => {
	test("hf_-ключ только для huggingface", () => {
		expect(isValidKeyForProvider("huggingface", "hf_abc")).toBe(true);
		expect(isValidKeyForProvider("poolside", "hf_abc")).toBe(false);
	});

	test("sky_-ключ только для poolside", () => {
		expect(isValidKeyForProvider("poolside", "sky_abc.def")).toBe(true);
		expect(isValidKeyForProvider("huggingface", "sky_abc")).toBe(false);
	});

	test("неизвестный провайдер отклоняется", () => {
		expect(keyPrefixFor("openai")).toBeNull();
		expect(isValidKeyForProvider("openai", "sk_abc")).toBe(false);
	});

	test("inception-ключ — любой непустой", () => {
		expect(isValidKeyForProvider("inception", "sk-inception-abc123")).toBe(
			true,
		);
		expect(isValidKeyForProvider("inception", "")).toBe(false);
		expect(isValidKeyForProvider("inception", "   ")).toBe(false);
		expect(isValidKeyForProvider("huggingface", "sk-inception-abc")).toBe(
			false,
		);
		expect(isValidKeyForProvider("poolside", "sk-inception-abc")).toBe(false);
	});
});
