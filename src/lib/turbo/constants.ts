/** Модель агента Турбо в подписке ChatGPT (проверяется кнопкой «Проверить» в админке) */
export const TURBO_AGENT_MODEL = "gpt-6-luna";
/** Верхняя граница ходов агента; обычный прогон — 2–4 раунда */
export const TURBO_MAX_STEPS = 12;
/** Бюджет агента: абсолютный дедлайн на вызовы модели внутри воркфлоу (обычно 40–110 с) */
export const TURBO_AGENT_TIMEOUT_MS = 180_000;
/**
 * Бюджет рисования: запрос к Codex обрывается сам раньше, чем платформа убьёт
 * функцию на лимите 300 с (остаётся время на загрузку картинки в хранилище)
 */
export const TURBO_DRAW_TIMEOUT_MS = 280_000;
/** Копия изображения для агента: длинная сторона в пикселях и качество WebP */
export const TURBO_PREVIEW_SIZE = 1024;
export const TURBO_PREVIEW_QUALITY = 80;
/** Сколько отказов проверки generateImage подряд допускается: первый вызов и два исправления */
export const TURBO_MAX_REJECTED_CHECKS = 3;
