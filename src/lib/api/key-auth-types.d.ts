import type { users } from "@/db/schema";

export type ApiAuthResult = {
	/** The API key (or app password) that authenticated. */
	keyId: string;
	keyKind: "legacy" | "mcp" | "app_password";
	userId: string;
	email: string;
	scopes: string[];
	mailboxIds: string[] | null;
	user: typeof users.$inferSelect;
};
