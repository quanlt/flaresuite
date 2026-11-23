<img src="public/icon-192.png" alt="FlareSuite" width="96" />

# FlareSuite

A self-hosted workspace suite: **custom domain Email**, **Calendar**, **Drive**, **Docs**, **Sheets**, **Slides**, **Contacts**, **Booking** and **built-in AI agents**.

Self-host it on Cloudflare Workers or Docker.

> FlareSuite is a fork of [Mailflare](https://github.com/hieunc229/mailflare) by Hieu Nguyen, licensed under the GNU AGPL-3.0. See [NOTICE](NOTICE) and [LICENSE](LICENSE).

## Features

### Apps

- **Email**: Custom domain mailboxes, personal or shared, with access you control. Send and receive with Cloudflare Email, Resend or Amazon SES.
- **Routing rules**: Store, forward, reject or sort incoming mail.
- **Calendar**: Repeating events with time zones. Attendees get email invitations.
- **Booking**: Share a public link so anyone can book a free time on your calendar.
- **Drive**: Store and share files.
- **Docs, Sheets and Slides**: Write documents, build spreadsheets with formulas and make presentations in the browser. Files live in Drive and share like any Drive file: view or edit access per person (inherited from shared folders), email notifications, and read-only public links. Import and export HTML, Markdown, Word, CSV and Excel formats.
- **Contacts**: Address book fed by the mail you send and receive.
- **AI agents**: Search mail, draft replies and manage events. Connect other AI tools over MCP.

### Roadmap

- Real-time co-editing and comments in Docs, Sheets and Slides (today two people editing at once get a conflict prompt instead of a silent overwrite).
- Docs, Sheets and Slides tools for the AI agent and MCP.

### Technical

- **Databases**: Cloudflare D1 (default), PostgreSQL, MySQL, Turso / libSQL, or a local SQLite file. Set `DATABASE_URL` to switch. See [Databases](docs/databases.md).
- **File storage**: Cloudflare R2, Backblaze B2 or AWS S3.
- **Hosting**: Cloudflare Workers or a single Docker container.
- **Admin**: Users, API keys, webhooks, audit logs and backups.
- **Import**: Bring in mail from IMAP, Gmail Takeout, `.eml` and `.mbox` files.
- **34 languages**, including Tiếng Việt, plus right-to-left Arabic, Urdu and Persian.

## Deploy to Cloudflare

1. Push this repository to your own GitHub account, then connect it to Cloudflare Workers (Workers & Pages → Create → Import a repository), or deploy from your machine with `npm run deploy`.
2. Keep the Worker name `flaresuite`. If you rename it, also change `services[].service` in `wrangler.jsonc` and set `CF_EMAIL_WORKER_NAME`.
3. Create the resources named in `wrangler.jsonc`: D1 database `flaresuite`, R2 bucket `flaresuite-raw`, and queues `flaresuite-inbound`, `flaresuite-outbound` and `flaresuite-agent`.
4. Set the `CF_TOKEN` Worker secret (permissions below).
5. Open the app at `/setup`, create the admin account, then add a domain from the same Cloudflare account and create your first mailbox.

> **`CF_TOKEN` permissions**
>
> - All accounts: Email Sending:Edit, DNS Settings:Edit, Email Routing Addresses:Edit
> - All zones: DNS Settings:Edit, Email Routing Rules:Edit, Zone Settings:Edit, DNS:Edit

More options: [deployment guide](docs/deployment.md).

### Self-host with Docker

Runs as one container on any server, with SQLite and local files.

```bash
cp .env.docker.example .env.docker
docker compose up -d --build
```

See [self-hosting](docs/self-hosting.md).

## FlareSuite-specific configuration

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SOURCE_CODE_URL` | Build-time variable | Public URL of the source code this server runs. Shown in the sidebar as the AGPL source offer. **Set it to your own repository.** |
| `UPDATE_SOURCE_REPOSITORY` | Worker variable and GitHub Actions variable | Your canonical FlareSuite repository (`owner/name`) for the admin self-update. Never point it at upstream Mailflare: the update replaces the whole tree. |
| `PUBLISH_DOCKER_IMAGE` | GitHub Actions variable | Set to `true` to publish a Docker image to GHCR on pushes to `main`. |

Internal identifiers inherited from Mailflare (`MAILFLARE_*` environment variables, `X-Mailflare-*` headers, `mailflare_*` database triggers) are kept on purpose, so existing data stays compatible and upstream fixes can still be merged.

## Local development

```bash
cp .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev
```

Add your Cloudflare credentials to `.dev.vars`, then open [localhost:3000](http://localhost:3000). Run `npm run db:seed` to load sample data.

- `npm run build`: build the Worker
- `npm run deploy`: build and deploy
- `npm run lint`: lint
- `node --test tests/*.test.mjs`: unit tests
- `npx tsc --noEmit`: type check (the build does not)

A schema change needs a migration for each database type. See [Databases](docs/databases.md#migrations).

### Pulling fixes from upstream Mailflare

```bash
git fetch upstream
git merge upstream/main
```

Expect conflicts in user-facing strings (`FlareSuite` vs `Mailflare`) and resource names; keep the FlareSuite side.

## Documentation

- [Deployment and configuration](docs/deployment.md)
- [Databases](docs/databases.md)
- [Sending and receiving providers](docs/providers.md)
- [API and integrations](docs/api.md)
- [Email assistant and MCP](docs/email-assistant-and-mcp.md)
- [Docs, Sheets, Slides and adding an app](docs/extending-apps.md)
- [Adding a language](docs/localization.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). If you run a modified FlareSuite as a network service, you must offer its users the corresponding source code (AGPL section 13).
