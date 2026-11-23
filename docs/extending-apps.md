# Docs, Sheets, Slides and adding another app

FlareSuite ships Mail, Calendar, Drive, Contacts, Booking, **Docs**, **Sheets**
and **Slides**. The three editors are **Drive-backed apps**: each document is a
Drive item, so it gets ownership, folders, trash, sharing (`drive_shares`,
view/edit roles, inherited from shared folders), public links, storage quotas
and backups for free. The first half of this page describes how they work; the
same recipe applies to any new app.

## How Docs, Sheets and Slides work

| Piece | Where |
| --- | --- |
| Content types, limits, envelope, validation (pure) | `src/lib/office/utils.ts`, `types.d.ts` |
| Read, write and create documents (server) | `src/lib/office/service.ts` |
| List and create: `GET/POST /api/office` | `src/app/api/office/route.ts` |
| Open, save, change check: `GET/PUT /api/office/[id]`, `?meta=1` | `src/app/api/office/[id]/route.ts` |
| Make a copy: `POST /api/office/[id]/copy` | `src/app/api/office/[id]/copy/route.ts` |
| Home pages and editor routes | `src/app/(office)/{docs,sheets,slides}` |
| Shared header, save loop, home, public viewer | `src/components/office/` |
| Editors | `src/components/office/{docs,sheets,slides}/` |
| Spreadsheet engine (formulas, structure, CSV) | `src/lib/office/sheets/` |

- **Storage.** The bucket object of the Drive item holds a JSON envelope
  `{ format: "flaresuite", kind, version: 1, revision, content }`. `size` on
  the row is the envelope's byte length, so documents count toward the Drive
  quota. Documents are at most 8 MB (Slides keep images as data URLs).
- **Saving.** `useOfficeDocument` saves 1.2 s after the last change. `PUT`
  sends `baseRevision`; the server answers 409 when the stored revision moved,
  and the editor offers to load the latest version or keep its own. Idle
  editors poll `?meta=1` every 10 s and pick up other people's saves, role
  changes and revoked access.
- **Permissions.** Every route resolves the role with `getDriveRole` (owner,
  edit, view; shares on any ancestor folder apply). Viewers get the editors in
  read-only mode and `PUT` returns 403. Only the owner manages sharing, in the
  same dialog as Drive, which can notify people by email
  (`src/lib/drive/share-notify.ts`). A public link (`/d/<token>`) opens the
  read-only viewer for anyone.
- **Untrusted HTML.** Rich text from Docs and Slides is sanitized with
  `sanitizeOfficeHtml` (DOMPurify) every time it is put into the page.

## Adding another app

### 1. Register the app

Add an entry to `APPS` in `src/lib/apps/registry.ts`:

```ts
{ id: "forms", href: "/forms", labelKey: "apps.forms", icon: ListChecks, isEnabled: (user) => user?.driveEnabled !== false },
```

- `labelKey` must exist in `src/lib/i18n/en.json`. Add it to the other
  locales in `public/locales/*.json` too (`tests/i18n.test.mjs` checks them).
- Import the icon through `src/components/icons.tsx`, which wraps Hugeicons.
- `tests/apps-registry.test.mjs` checks ids, routes and label keys.

If the app needs its own per-account switch (like `calendar_enabled` and
`drive_enabled` on `users`), add the column with a migration in all three
dialects and extend `AppUserFlags` in `src/lib/apps/registry-types.d.ts`.

### 2. Store documents as Drive items

Use `drive_items` rows with `kind = "file"` and a FlareSuite content type, and
keep the document body in `env.BUCKET` under `r2Key`, exactly like an uploaded
file:

| App    | `contentType`                                   | Body in the bucket                         |
| ------ | ----------------------------------------------- | ------------------------------------------ |
| Docs   | `application/vnd.flaresuite.document+json`      | Editor document JSON (e.g. ProseMirror/Tiptap) |
| Sheets | `application/vnd.flaresuite.spreadsheet+json`   | Sheets, cells, formats and formulas        |
| Slides | `application/vnd.flaresuite.presentation+json`  | Slides, layouts and elements               |

Why this shape:

- `src/lib/drive/access.ts` (`getDriveRole`, `getDriveChain`) already resolves
  who may view or edit an item through folders and shares; reuse it on every
  read and write.
- `src/lib/drive/categories.ts` already files `application/vnd.*` under
  *Documents*, so native documents show up in the Drive type filter.
- Storage quotas (`src/lib/drive/storage.ts`), trash/retention and backups
  keep working without changes.
- Drive's preview (`src/app/(drive)/drive-preview.tsx`) can route these
  content types to the new editor instead of downloading them.

Large assets inside a document (images in Docs or Slides) should be separate
Drive items or bucket objects referenced by id, not inlined base64.

### 3. Routes and API

- UI: a route group such as `src/app/(docs)/docs/` with a list page (a Drive
  query filtered by the content type) and `docs/[id]/page.tsx` for the editor.
- API: `src/app/api/docs/[id]/route.ts` with `GET` (load body) and `PUT`
  (save body). Check the role with `getDriveRole`; `PUT` needs `edit`.
  Save with an optimistic version (compare `updatedAt` or an ETag) so two
  tabs cannot silently overwrite each other.
- Follow the repository conventions in `CLAUDE.md`: `getEnv()` then
  `getDb(env)`, `requireSessionUser` for a clean 401, types in sibling
  `*-types.d.ts` and pure helpers in `*-utils.ts`.

### 4. Real-time collaboration (later)

The `RealtimeHub` Durable Object (`src/lib/realtime/hub.ts`) is keyed per user
today. Live co-editing needs a hub keyed per document (for example a Yjs
document per Durable Object, persisted to the bucket on idle). Add it as a new
Durable Object class with its own migration tag in `wrangler.jsonc`, export it
from `worker.ts`, and route `/api/docs/<id>/live` to it the same way
`/api/realtime` is routed. The self-hosted Node runtime needs a matching
in-process stand-in in `server/runtime/`.

### 5. Import and export

Convert Office formats at the edges, not in storage: import `.docx`, `.xlsx`
and `.pptx` uploads into the native JSON, and export back (or to PDF) on
download. Keep converters in `src/lib/<app>/` and make sure they run on both
Workers and Node (no native modules).

### 6. AI agent and MCP

Expose read/write tools next to the mail and calendar tools in
`src/lib/agent/tools.ts` and `src/lib/mcp/server.ts`, gated by an API key
scope, so assistants can draft documents or fill sheets. Follow the existing
pattern of proposing destructive changes for user review rather than applying
them directly.
