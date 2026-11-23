/** Server settings mail apps need to connect through the IMAP/SMTP gateway, or null when none is configured. */
export function mailAppServer(env: { MAIL_GATEWAY_HOST?: string }): { host: string; imapPort: number; smtpPort: number; submissionPort: number } | null {
	const host = env.MAIL_GATEWAY_HOST?.trim().toLowerCase();
	if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
	return { host, imapPort: 993, smtpPort: 465, submissionPort: 587 };
}
