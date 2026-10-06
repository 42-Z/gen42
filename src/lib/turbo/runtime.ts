import {
	chargeGeneration,
	completeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import { buildTurboSystem } from "../prompts/turbo.system";
import { getImageUrl, listObjects, readObject, uploadImage } from "../storage";
import { runTurbo } from "./agent";
import {
	codexFetch,
	codexLanguageModel,
	createCodexAuth,
	recordCodexError,
} from "./codex-auth";
import { CODEX_IMAGE_MODEL, editImage } from "./codex-images";
import { TURBO_AGENT_MODEL } from "./constants";
import { Library } from "./library";
import type { TurboServiceDeps } from "./service";

/** Библиотека читается из бакета с префиксом library/; кэш дерева живёт минуту */
const library = new Library({ list: listObjects, read: readObject });

/** Боевые зависимости сервиса Турбо: вход подписки, S3 и запись в `generations` */
export const turboDeps: TurboServiceDeps = {
	async chargeCredits(params) {
		await chargeGeneration(params);
	},

	async run(prompt) {
		// новый менеджер входа на запуск: токены читаются из базы, а не из памяти экземпляра
		const auth = createCodexAuth();
		const authenticatedFetch = codexFetch(auth);
		return runTurbo(prompt, {
			model: codexLanguageModel(auth, TURBO_AGENT_MODEL),
			library,
			buildSystem: buildTurboSystem,
			edit: ({ prompt: finalPrompt, images, signal }) =>
				editImage({
					fetch: authenticatedFetch,
					prompt: finalPrompt,
					images,
					...(signal ? { signal } : {}),
				}),
		});
	},

	async storeImage(userId, png) {
		const key = `generations/${userId}/${Date.now()}.png`;
		await uploadImage(key, Buffer.from(png), "image/png");
		return { key, url: await getImageUrl(key) };
	},

	async startRecord(record) {
		return startGeneration({
			...(record.id ? { id: record.id } : {}),
			userId: record.userId,
			prompt: record.prompt,
			engine: "turbo",
			model: CODEX_IMAGE_MODEL,
			width: 1024,
			height: 1024,
			steps: 0,
		});
	},

	async recordCompleted(record) {
		await completeGeneration({
			id: record.id,
			imageKey: record.imageKey,
			seed: null,
			width: record.width,
			height: record.height,
			enhancedPrompt: record.enhancedPrompt,
			durationMs: record.durationMs,
			llmModel: TURBO_AGENT_MODEL,
			llmTokens: record.agentTokens,
			enhanceMs: record.durationMs,
			styleVersion: record.systemVersion,
			inputImages: record.inputImages,
		});
	},

	async recordFailed(record) {
		await failGeneration({
			id: record.id,
			error: record.error,
			enhancedPrompt: record.enhancedPrompt,
			durationMs: record.durationMs,
			llmModel: TURBO_AGENT_MODEL,
			inputImages: record.inputImages,
		});
	},

	async onAuthFailure(error) {
		await recordCodexError(`${error.code}: ${error.message}`);
	},

	now: Date.now,
};
