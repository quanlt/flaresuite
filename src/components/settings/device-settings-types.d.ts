export type MobileDevice = {
	id: string;
	name: string;
	createdAt: string;
	lastUsedAt: string | null;
	pushEnabled: boolean;
};

export type MailAppServer = { host: string; imapPort: number; smtpPort: number; submissionPort: number };

export type DeviceList = { devices: MobileDevice[]; mailServer: MailAppServer | null; username: string };

export type CreatedAppPassword = { id: string; name: string; password: string; username: string; mailServer: MailAppServer | null };
