import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
	MemoryTokenStore,
	OpenAIOAuth,
	type OpenAIOAuthTokens,
} from "openai-oauth-ai-provider/core";
import {
	CODEX_CLIENT_VERSION,
	checkCodex,
	codexLoginStream,
	DbTokenStore,
	getCodexStatus,
	isTurboAvailable,
	parseCodexUsage,
} from "../turbo/codex-auth";

const TOKENS: OpenAIOAuthTokens = {
	accessToken: "access",
	idToken: "id",
	refreshToken: "refresh",
	accountId: "acc-1",
	planType: "plus",
	updatedAt: Date.now(),
};

function fakeSql(responses: Record<string, unknown[]> = {}) {
	const queries: { text: string; values: unknown[] }[] = [];
	const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
		const text = strings.join("?");
		queries.push({ text, values });
		for (const [pattern, rows] of Object.entries(responses)) {
			if (text.includes(pattern)) return Promise.resolve(rows);
		}
		return Promise.resolve([]);
	};
	fn.json = (value: unknown) => ({ json: value });
	fn.begin = async (callback: (tx: typeof fn) => unknown) => callback(fn);
	return { sql: fn as never, queries };
}

describe("DbTokenStore", () => {
	test("save: одна строка, токены как json, ошибка сбрасывается", async () => {
		const { sql, queries } = fakeSql();
		await new DbTokenStore(sql).save(TOKENS);
		const query = queries[0]!;
		expect(query.text).toContain("INSERT INTO codex_auth");
		expect(query.text).toContain("ON CONFLICT (id) DO UPDATE");
		expect(query.text).toContain("last_error = NULL");
		expect(query.values).toContain("acc-1");
		expect(query.values).toContain("plus");
		expect(query.values).toContainEqual({ json: TOKENS });
	});

	test("load: возвращает токены, пустую таблицу и мусор — как отсутствие входа", async () => {
		const present = fakeSql({ "SELECT tokens": [{ tokens: TOKENS }] });
		expect(await new DbTokenStore(present.sql).load()).toEqual(TOKENS);
		expect(await new DbTokenStore(fakeSql().sql).load()).toBeUndefined();
		const broken = fakeSql({
			"SELECT tokens": [{ tokens: { accessToken: 1 } }],
		});
		expect(await new DbTokenStore(broken.sql).load()).toBeUndefined();
	});

	test("clear удаляет строку", async () => {
		const { sql, queries } = fakeSql();
		await new DbTokenStore(sql).clear();
		expect(queries[0]!.text).toContain("DELETE FROM codex_auth");
	});

	test("withLock берёт advisory-блокировку до операции и отдаёт её результат", async () => {
		const { sql, queries } = fakeSql();
		const order: string[] = [];
		const store = new DbTokenStore(sql);
		const result = await store.withLock(async () => {
			order.push(`операция после ${queries.length} запросов`);
			return 42;
		});
		expect(result).toBe(42);
		expect(queries[0]!.text).toContain("pg_advisory_xact_lock");
		expect(order).toEqual(["операция после 1 запросов"]);
	});
});

describe("состояние входа", () => {
	test("getCodexStatus: нет строки — не вошли", async () => {
		expect(await getCodexStatus(fakeSql().sql)).toEqual({
			loggedIn: false,
			planType: null,
			updatedAt: null,
			lastError: null,
		});
	});

	test("getCodexStatus: тариф, время и ошибка", async () => {
		const { sql } = fakeSql({
			"FROM codex_auth": [
				{
					plan_type: "plus",
					last_error: "refresh_failed",
					updated_at: new Date("2026-10-05T10:00:00Z"),
					logged_in: true,
				},
			],
		});
		expect(await getCodexStatus(sql)).toEqual({
			loggedIn: true,
			planType: "plus",
			updatedAt: "2026-10-05T10:00:00.000Z",
			lastError: "refresh_failed",
		});
	});

	test("isTurboAvailable: нужен вход без пометки об ошибке", async () => {
		const yes = fakeSql({ "FROM codex_auth": [{ "?column?": 1 }] });
		expect(await isTurboAvailable(yes.sql)).toBe(true);
		expect(yes.queries[0]!.text).toContain("last_error IS NULL");
		expect(await isTurboAvailable(fakeSql().sql)).toBe(false);
	});
});

describe("parseCodexUsage", () => {
	test("оба окна: остаток считается от использованного, сброс — из unix-времени", () => {
		const usage = parseCodexUsage({
			plan_type: "plus",
			rate_limit: {
				primary_window: {
					used_percent: 28,
					limit_window_seconds: 18000,
					reset_at: 1_791_225_886,
				},
				secondary_window: {
					used_percent: 53,
					limit_window_seconds: 604800,
					reset_at: 1_791_617_388,
				},
			},
		});
		expect(usage).toEqual({
			windows: [
				{
					windowSeconds: 18000,
					remainingPercent: 72,
					resetAt: new Date(1_791_225_886 * 1000).toISOString(),
				},
				{
					windowSeconds: 604800,
					remainingPercent: 47,
					resetAt: new Date(1_791_617_388 * 1000).toISOString(),
				},
			],
		});
	});

	test("остаток не выходит за 0–100", () => {
		const usage = parseCodexUsage({
			rate_limit: {
				primary_window: {
					used_percent: 0,
					limit_window_seconds: 18000,
					reset_at: 1,
				},
				secondary_window: {
					used_percent: 130,
					limit_window_seconds: 604800,
					reset_at: 2,
				},
			},
		});
		expect(usage?.windows.map((w) => w.remainingPercent)).toEqual([100, 0]);
	});

	test("сломанное окно пропускается, полный мусор — null", () => {
		const partial = parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: "много" },
				secondary_window: {
					used_percent: 10,
					limit_window_seconds: 604800,
					reset_at: 2,
				},
			},
		});
		expect(partial?.windows).toHaveLength(1);
		expect(partial?.windows[0]?.remainingPercent).toBe(90);
		expect(parseCodexUsage(null)).toBeNull();
		expect(parseCodexUsage({})).toBeNull();
		expect(parseCodexUsage({ rate_limit: null })).toBeNull();
		expect(parseCodexUsage({ rate_limit: { primary_window: {} } })).toBeNull();
	});
});

describe("codexLoginStream", () => {
	async function readEvents(stream: ReadableStream<Uint8Array>) {
		const text = await new Response(stream).text();
		return text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	}

	test("код и ссылка, затем итог", async () => {
		const stream = codexLoginStream({
			loginWithDeviceCode: async ({ onVerification }) => {
				await onVerification?.({
					userCode: "ABCD-1234",
					verificationUrl: "https://auth.openai.com/codex/device",
					expiresAt: 123,
				});
				return TOKENS;
			},
		});
		expect(await readEvents(stream)).toEqual([
			{
				type: "code",
				userCode: "ABCD-1234",
				verificationUrl: "https://auth.openai.com/codex/device",
				expiresAt: 123,
			},
			{ type: "done", planType: "plus" },
		]);
	});

	test("ошибка входа — событие error, поток закрывается", async () => {
		const stream = codexLoginStream({
			loginWithDeviceCode: async () => {
				throw new Error("device_authorization_timeout");
			},
		});
		expect(await readEvents(stream)).toEqual([
			{ type: "error", message: "device_authorization_timeout" },
		]);
	});

	test("пока админ вводит код, поток шлёт ping, чтобы соединение не закрылось", async () => {
		const stream = codexLoginStream(
			{
				loginWithDeviceCode: async () => {
					await Bun.sleep(80);
					return TOKENS;
				},
			},
			undefined,
			10,
		);
		const events = await readEvents(stream);
		expect(
			events.filter((event) => event.type === "ping").length,
		).toBeGreaterThan(1);
		expect(events.at(-1)).toEqual({ type: "done", planType: "plus" });
	});

	test("клиент ушёл — таймер ping останавливается, вход прерывается без исключений", async () => {
		const clear = spyOn(globalThis, "clearInterval");
		let loginSettled = false;
		const controller = new AbortController();
		const stream = codexLoginStream(
			{
				loginWithDeviceCode: ({ signal }) =>
					new Promise((_, reject) => {
						signal?.addEventListener("abort", () => {
							loginSettled = true;
							reject(new Error("aborted"));
						});
					}),
			},
			controller.signal,
			10,
		);
		const reader = stream.getReader();
		await reader.read();
		await reader.cancel();
		expect(clear).toHaveBeenCalledTimes(1);
		controller.abort();
		await Bun.sleep(40);
		expect(loginSettled).toBe(true);
		// после отмены finally не пытается закрыть поток и не вызывает clearInterval заново
		expect(clear).toHaveBeenCalledTimes(2);
		clear.mockRestore();
	});
});

describe("checkCodex", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function authWithTokens() {
		return new OpenAIOAuth({ tokenStore: new MemoryTokenStore(TOKENS) });
	}

	test("модель агента есть — ошибка сбрасывается", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ models: [{ slug: "gpt-6-luna" }, { slug: "gpt-5.4" }] }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result).toEqual({ ok: true, models: ["gpt-6-luna", "gpt-5.4"] });
		expect(queries[0]!.text).toContain("last_error = NULL");
	});

	test("модели агента нет — ошибка записывается, Турбо скроется", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ models: [{ slug: "gpt-5.4" }] }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result.ok).toBe(false);
		expect(queries[0]!.text).toContain("SET last_error =");
		expect(String(queries[0]!.values[0])).toContain("gpt-6-luna");
	});

	test("запрос моделей упал — ошибка записывается", async () => {
		globalThis.fetch = mock(
			async () => new Response("no", { status: 403 }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result.ok).toBe(false);
		expect(queries[0]!.text).toContain("SET last_error =");
	});

	test("список моделей запрашивается с версией клиента: с версией пакета (0.1.0) бэкенд отдаёт пустой список", async () => {
		const urls: string[] = [];
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			urls.push(String(input));
			return Response.json({ models: [{ slug: "gpt-6-luna" }] });
		}) as never;
		await checkCodex(authWithTokens(), fakeSql().sql);
		expect(new URL(urls[0]!).searchParams.get("client_version")).toBe(
			CODEX_CLIENT_VERSION,
		);
		expect(CODEX_CLIENT_VERSION).not.toBe("0.1.0");
	});
});
