/**
 * id, который присылает клиент: буквы, цифры, дефис и подчёркивание. Тем же
 * видом пользуется папка вложений: клиент придумывает её заранее, чтобы файлы
 * легли рядом с будущим запуском.
 */
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isClientId(value: unknown): value is string {
	return typeof value === "string" && CLIENT_ID_RE.test(value);
}
