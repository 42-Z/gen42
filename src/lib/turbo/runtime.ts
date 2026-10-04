import { deductCredits, refundCredits } from "../credits";
import { sql } from "../db";
import { describeGenerationError } from "../generation-error";
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
	deductCredits,
	refundCredits,

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

	async recordCompleted(record) {
		await sql`
      INSERT INTO generations
        (id, user_id, prompt, enhanced_prompt, model, width, height, steps,
         image_key, status, duration_ms, llm_model, llm_tokens, enhance_ms,
         style_version, engine, cost, input_images)
      VALUES
        (${record.id}, ${record.userId}, ${record.prompt},
         ${record.enhancedPrompt}, ${CODEX_IMAGE_MODEL}, ${record.width},
         ${record.height}, 0, ${record.imageKey}, 'completed',
         ${record.durationMs}, ${TURBO_AGENT_MODEL}, ${record.agentTokens},
         ${record.durationMs}, ${record.systemVersion}, 'turbo', ${record.cost},
         ${sql.array(record.inputImages)})
    `;
	},

	async recordFailed(record) {
		await sql`
      INSERT INTO generations
        (id, user_id, prompt, enhanced_prompt, model, width, height, steps,
         status, error_message, duration_ms, llm_model, engine, cost,
         input_images)
      VALUES
        (${crypto.randomUUID()}, ${record.userId}, ${record.prompt},
         ${record.enhancedPrompt}, ${CODEX_IMAGE_MODEL}, 1024, 1024, 0,
         'failed', ${describeGenerationError(record.error)},
         ${record.durationMs}, ${TURBO_AGENT_MODEL}, 'turbo', 0,
         ${sql.array(record.inputImages)})
    `;
	},

	async onAuthFailure(error) {
		await recordCodexError(`${error.code}: ${error.message}`);
	},

	now: Date.now,
	newId: () => crypto.randomUUID(),
};
