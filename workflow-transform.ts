import { transform } from "@swc/core";
import type { BunPlugin } from "bun";

/**
 * Преобразование кода приложения для Workflow SDK (режим step): воркфлоу получают
 * идентификатор для `start()`, шаги регистрируются. Схема: «Framework
 * Integrations» из документации Workflow SDK (пример для Bun). Отличия от примера:
 * фильтр не трогает node_modules (onLoad для CommonJS-зависимостей ломает их
 * загрузку: «Missing 'default' export in module»), а `@swc/core` закреплён на
 * 1.15.3 (под эту версию собран плагин SWC).
 */
export const workflowTransform: BunPlugin = {
	name: "workflow-transform",
	setup(build) {
		build.onLoad(
			{ filter: /^(?!.*[\\/]node_modules[\\/]).*\.(ts|tsx|js|jsx)$/ },
			async (args) => {
				const source = await Bun.file(args.path).text();
				if (!source.match(/(use step|use workflow)/)) {
					return { contents: source };
				}

				const result = await transform(source, {
					filename: args.path,
					jsc: {
						experimental: {
							plugins: [
								[require.resolve("@workflow/swc-plugin"), { mode: "step" }],
							],
						},
					},
				});

				return { contents: result.code, loader: "ts" };
			},
		);
	},
};
