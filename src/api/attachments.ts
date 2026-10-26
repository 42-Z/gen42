import { auth } from "../lib/auth";
import { TOO_MANY_REQUESTS_ERROR } from "../lib/generation-limits";
import { checkRateLimit } from "../lib/rate-limit";
import {
	deleteImage,
	listObjects,
	presignUpload,
	readObject,
} from "../lib/storage";
import {
	completeAttachment,
	signAttachment,
} from "../lib/ultra/attachment-upload";

function attachmentStorage() {
	return {
		list: listObjects,
		read: readObject,
		delete: deleteImage,
		presignUpload,
	};
}

async function jsonBody(req: Request): Promise<Record<string, unknown> | null> {
	try {
		const body = await req.json();
		return body && typeof body === "object"
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function unauthorized() {
	return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function tooMany() {
	return Response.json({ error: TOO_MANY_REQUESTS_ERROR }, { status: 429 });
}

function badRequest(error: string) {
	return Response.json({ error }, { status: 400 });
}

export const attachmentRoutes = {
	"/api/attachments/sign": {
		POST: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) return unauthorized();
			if (!checkRateLimit(`attachments:${session.user.id}`, 30, 60_000)) {
				return tooMany();
			}
			const body = await jsonBody(req);
			if (!body) return badRequest("Некорректный запрос");
			const { scope, name, size } = body;
			if (
				typeof scope !== "string" ||
				typeof name !== "string" ||
				typeof size !== "number"
			) {
				return badRequest("Некорректный запрос");
			}
			const result = await signAttachment(attachmentStorage(), {
				userId: session.user.id,
				scope,
				name,
				size,
			});
			return result.ok
				? Response.json({
						key: result.key,
						name: result.name,
						url: result.url,
					})
				: Response.json({ error: result.error }, { status: result.status });
		},
	},

	"/api/attachments/complete": {
		POST: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) return unauthorized();
			if (!checkRateLimit(`attachments:${session.user.id}`, 30, 60_000)) {
				return tooMany();
			}
			const body = await jsonBody(req);
			if (!body) return badRequest("Некорректный запрос");
			const { scope, key } = body;
			if (typeof scope !== "string" || typeof key !== "string") {
				return badRequest("Некорректный запрос");
			}
			const result = await completeAttachment(attachmentStorage(), {
				userId: session.user.id,
				scope,
				key,
			});
			return result.ok
				? Response.json({ ok: true, file: result.file })
				: Response.json({ error: result.error }, { status: result.status });
		},
	},
};
