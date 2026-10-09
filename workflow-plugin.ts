import { plugin } from "bun";
import { workflowTransform } from "./workflow-transform";

// Подключается через `preload` в bunfig.toml: dev-сервер, скрипты и `bun run` получают
// преобразование Workflow SDK. Сборка для Vercel использует тот же плагин в build.ts
plugin(workflowTransform);
