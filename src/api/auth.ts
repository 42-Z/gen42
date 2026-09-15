import { auth } from "../lib/auth";

export const authRoutes = {
	"/api/auth/*": async (req: Request) => {
		return auth.handler(req);
	},
};
