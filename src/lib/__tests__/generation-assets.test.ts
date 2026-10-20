import { describe, expect, test } from "bun:test";
import { generationAsset } from "../../api/generation-assets";

function fixture(
	over: {
		user?: string | null;
		status?: string;
		owner?: string;
		missing?: boolean;
	} = {},
) {
	let reads = 0;
	return {
		deps: {
			userId: async () => (over.user === undefined ? "u1" : over.user),
			record: async (userId: string, id: string) =>
				userId === (over.owner ?? "u1") && id === "g1"
					? { status: over.status ?? "completed", imageKey: "original.png" }
					: null,
			load: async () => {
				reads++;
				return over.missing
					? null
					: new Response(new Uint8Array([1, 2, 3]), {
							headers: { "Content-Type": "image/webp" },
						});
			},
		},
		reads: () => reads,
	};
}

describe("защищённая выдача изображения", () => {
	test("гость не читает хранилище и не получает кешируемый отказ", async () => {
		const f = fixture({ user: null });
		const response = await generationAsset(
			new Request("http://local/"),
			"g1",
			f.deps,
		);
		expect(response.status).toBe(401);
		expect(f.reads()).toBe(0);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
	test("чужая запись и незавершённая генерация не отдают изображение", async () => {
		for (const over of [{ owner: "another" }, { status: "running" }]) {
			const f = fixture(over);
			const response = await generationAsset(
				new Request("http://local/"),
				"g1",
				f.deps,
			);
			expect(response.status).toBe(404);
			expect(f.reads()).toBe(0);
		}
	});
	test("копия отдаётся владельцу с частным кешем и типом изображения", async () => {
		const f = fixture();
		const response = await generationAsset(
			new Request("http://local/"),
			"g1",
			f.deps,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/webp");
		expect(response.headers.get("Cache-Control")).toBe(
			"private, max-age=31536000, immutable",
		);
		expect(response.headers.get("Vary")).toBe("Cookie");
		expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
			1, 2, 3,
		]);
	});
	test("отсутствующий файл не кешируется", async () => {
		const f = fixture({ missing: true });
		const response = await generationAsset(
			new Request("http://local/"),
			"g1",
			f.deps,
		);
		expect(response.status).toBe(404);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});
