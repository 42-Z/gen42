export interface TurboWorkflowInput {
	id: string;
	userId: string;
	prompt: string;
}

/** Заглушка для проверки сборки; настоящее тело появляется в Задаче 8 */
export async function turboWorkflow(input: TurboWorkflowInput) {
	"use workflow";
	return { ok: true as const, id: input.id };
}
