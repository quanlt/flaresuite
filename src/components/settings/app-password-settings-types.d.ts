export type AppPassword = {
	id: string;
	name: string;
	createdAt: string;
	lastUsedAt: string | null;
};

export type MailAppServer = { host: string; imapPort: number; smtpPort: number; submissionPort: number };

export type AppPasswordList = { appPasswords: AppPassword[]; mailServer: MailAppServer | null; username: string };

export type CreatedAppPassword = { id: string; name: string; password: string; username: string; mailServer: MailAppServer | null };
