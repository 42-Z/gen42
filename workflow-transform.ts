import { transform } from "@swc/core";
import type { BunPlugin } from "bun";

/**
 * Преобразование кода приложения для Workflow SDK (режим step): воркфлоу получают
 * идентификатор для `start()`, шаги и классы с сериализацией регистрируются.
 * Схема: «Framework Integrations» из документации Workflow SDK (пример для Bun).
 * Отличия от примера:
 * - фильтр не трогает node_modules (onLoad для CommonJS-зависимостей ломает их
 *   загрузку: «Missing 'default' export in module»);
 * - `@swc/core` закреплён на 1.15.3 (под эту версию собран плагин SWC);
 * - параметры SWC те же, что у сборщика Workflow (`apply-swc-transform.js`):
 *   `target: "es2022"`, разбор по расширению файла. Без цели ES2022 SWC понижает
 *   классы до функций и переименовывает их, из-за чего регистрация класса
 *   `CodexAgentModel` ссылается на несуществующее имя.
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

				const typescript = /\.tsx?$/.test(args.path);
				const jsx = args.path.endsWith("x");
				const result = await transform(source, {
					filename: args.path,
					swcrc: false,
					jsc: {
						parser: typescript
							? { syntax: "typescript", tsx: jsx }
							: { syntax: "ecmascript", jsx },
						target: "es2022",
						experimental: {
							keepImportAttributes: true,
							plugins: [
								[require.resolve("@workflow/swc-plugin"), { mode: "step" }],
							],
						},
						transform: { react: { runtime: "preserve" } },
					},
				});

				const loader = typescript ? (jsx ? "tsx" : "ts") : jsx ? "jsx" : "js";
				return { contents: result.code, loader };
			},
		);
	},
};
