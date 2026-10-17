import type {
	LanguageModelV4,
	LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { rethrowModelError } from "./failure";
import { getUltraRuntime } from "./workflow-runtime";

/**
 * Модель агента «Ультра» для WorkflowAgent. Стандартная сериализация моделей AI SDK
 * теряет несериализуемый `fetch`, а в нём вход по подписке; этот класс пишет в
 * журнал воркфлоу только `modelId`, а настоящую модель создаёт заново внутри шага,
 * читая токены из базы. Методы с `"use step"` не попадают в песочницу воркфлоу
 * (там нет Node), а границу шага проходят данные класса.
 */
export class CodexAgentModel implements LanguageModelV4 {
	readonly specificationVersion = "v4" as const;
	readonly provider = "codex";
	readonly supportedUrls = {};

	constructor(readonly modelId: string) {}

	static [WORKFLOW_SERIALIZE](model: CodexAgentModel) {
		return { modelId: model.modelId };
	}

	static [WORKFLOW_DESERIALIZE](data: { modelId: string }) {
		return new CodexAgentModel(data.modelId);
	}

	async doGenerate(options: LanguageModelV4CallOptions) {
		"use step";
		try {
			return await getUltraRuntime()
				.agentModel(this.modelId)
				.doGenerate(options);
		} catch (error) {
			return rethrowModelError(error);
		}
	}

	async doStream(options: LanguageModelV4CallOptions) {
		"use step";
		try {
			return await getUltraRuntime().agentModel(this.modelId).doStream(options);
		} catch (error) {
			return rethrowModelError(error);
		}
	}
}
