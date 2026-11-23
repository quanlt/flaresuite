import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * Docs, Sheets and Slides end to end: creating, editing, saving, Drive integration, sharing with view and edit
 * roles, revoking, public links and save conflicts.
 *
 * Needs a disposable dev server with the demo seed (see README.md); the seed also creates member@example.com,
 * the second account the sharing tests use.
 */

const ADMIN = { email: "admin@example.com", password: "demo-password-change-me" };

type Cookies = Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>;
// Sign-in is rate limited (20 a minute), so each account signs in once and later pages reuse its cookies.
const sessions = new Map<string, Cookies>();

async function signIn(page: Page, email: string, password: string) {
	const cached = sessions.get(email);
	if (cached) { await page.context().addCookies(cached); return; }
	// Through the API: the login form is covered by its own tests and this keeps every case fast.
	const response = await page.request.post("/api/auth/login", { data: { email, password }, headers: { Origin: baseUrl() } });
	expect(response.ok(), `login ${email}: ${response.status()}`).toBe(true);
	sessions.set(email, await page.context().cookies());
}

function baseUrl(): string {
	return process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
}

async function prepare(request: APIRequestContext) {
	const prepared = await request.post("/api/setup/prepare");
	if (![200, 403, 503].includes(prepared.status())) throw new Error(`prepare: ${prepared.status()}`);
	const seeded = await request.post("/api/seed");
	expect(seeded.ok(), `seed: ${seeded.status()}`).toBe(true);
}

/** The second account `POST /api/seed` creates for sharing tests. */
const MEMBER = { email: "member@example.com", password: ADMIN.password };

async function newSignedInPage(browser: Browser, email: string, password: string): Promise<Page> {
	const context = await browser.newContext({ baseURL: baseUrl() });
	const page = await context.newPage();
	await page.goto("/login");
	await signIn(page, email, password);
	return page;
}

async function createFromHome(page: Page, path: string, tile: string): Promise<string> {
	await page.goto(path);
	await page.getByRole("button", { name: tile, exact: true }).click();
	await page.waitForURL(new RegExp(`${path}/drv_`));
	return page.url().split("/").pop()!;
}

async function expectSaved(page: Page) {
	await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });
}

async function apiShare(page: Page, id: string, email: string, role: "view" | "edit") {
	const response = await page.request.post(`/api/drive/items/${id}/shares`, { data: { email, role, notify: false }, headers: { Origin: baseUrl() } });
	expect(response.ok()).toBe(true);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
	await prepare(request);
});

test.beforeEach(async ({ page }) => {
	await page.goto("/login");
	await signIn(page, ADMIN.email, ADMIN.password);
});

test.describe("Docs", () => {
	test("writes, formats, saves and reopens a document", async ({ page }) => {
		const id = await createFromHome(page, "/docs", "Blank document");
		const body = page.locator("[contenteditable=true]").first();
		await body.click();
		await page.keyboard.type("Launch plan");
		await page.keyboard.press("Enter");
		await page.keyboard.press("ControlOrMeta+b");
		await page.keyboard.type("Goal:");
		await page.keyboard.press("ControlOrMeta+b");
		await page.keyboard.type(" ship it");
		await expectSaved(page);
		await expect(page.getByText(/Words: 5/)).toBeVisible();

		await page.reload();
		await expect(page.locator("[contenteditable=true]").first()).toContainText("Launch plan");
		await expect(page.locator("[contenteditable=true] b, [contenteditable=true] strong").first()).toHaveText("Goal:");

		const opened = await (await page.request.get(`/api/office/${id}`)).json();
		expect(opened.content.html).toContain("ship it");
	});

	test("renames from the title and lists the file on the Docs home", async ({ page }) => {
		await createFromHome(page, "/docs", "Blank document");
		const title = page.getByLabel("File name");
		await title.click();
		await title.fill("Renamed by e2e");
		await title.press("Enter");
		await expect(title).toHaveValue("Renamed by e2e");
		await page.goto("/docs");
		await expect(page.getByRole("link", { name: /Renamed by e2e/ }).first()).toBeVisible();
	});

	test("creates from a template", async ({ page }) => {
		await createFromHome(page, "/docs", "Meeting notes");
		await expect(page.getByLabel("File name")).toHaveValue("Meeting notes");
		await expect(page.locator("[contenteditable=true]").first()).not.toBeEmpty();
	});

	test("escapes script in stored HTML when rendering", async ({ page }) => {
		const created = await page.request.post("/api/office", { data: { kind: "document", name: "XSS probe", content: { html: `<p>safe</p><img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>` } }, headers: { Origin: baseUrl() } });
		const { item } = await created.json();
		await page.goto(`/docs/${item.id}`);
		await expect(page.locator("[contenteditable=true]").first()).toContainText("safe");
		expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
	});
});

test.describe("Sheets", () => {
	test("calculates formulas, saves and reopens", async ({ page }) => {
		const id = await createFromHome(page, "/sheets", "Blank spreadsheet");
		const nameBox = page.getByLabel("Cell or range");
		await nameBox.fill("A1");
		await nameBox.press("Enter");
		await page.keyboard.type("10");
		await page.keyboard.press("Enter");
		await page.keyboard.type("32");
		await page.keyboard.press("Enter");
		await page.keyboard.type("=SUM(A1:A2)*2");
		await page.keyboard.press("Enter");
		await expect(page.locator('[role=gridcell][aria-rowindex="3"][aria-colindex="1"]')).toHaveText("84");
		await expectSaved(page);

		await page.reload();
		await expect(page.locator('[role=gridcell][aria-rowindex="3"][aria-colindex="1"]')).toHaveText("84");
		const opened = await (await page.request.get(`/api/office/${id}`)).json();
		expect(opened.content.sheets[0].cells.A3.input).toBe("=SUM(A1:A2)*2");
	});

	test("adds a sheet and references it from the first", async ({ page }) => {
		await createFromHome(page, "/sheets", "Blank spreadsheet");
		await page.getByRole("button", { name: "Add sheet" }).click();
		const nameBox = page.getByLabel("Cell or range");
		await nameBox.fill("B2");
		await nameBox.press("Enter");
		await page.keyboard.type("7");
		await page.keyboard.press("Enter");
		await page.getByText("Sheet1", { exact: true }).click();
		await nameBox.fill("A1");
		await nameBox.press("Enter");
		await page.keyboard.type("=Sheet2!B2*6");
		await page.keyboard.press("Enter");
		await expect(page.locator('[role=gridcell][aria-rowindex="1"][aria-colindex="1"]')).toHaveText("42");
		await expectSaved(page);
	});

	test("opens the Budget template with working totals", async ({ page }) => {
		await createFromHome(page, "/sheets", "Budget");
		await expect(page.getByLabel("File name")).toHaveValue("Budget");
		await expect(page.locator("[role=gridcell]").filter({ hasText: /#(REF|NAME|VALUE|ERROR|CYCLE)/ })).toHaveCount(0);
	});
});

test.describe("Slides", () => {
	test("adds slides and a text box, saves and presents", async ({ page }) => {
		const id = await createFromHome(page, "/slides", "Blank presentation");
		await expect(page.getByLabel("Slide 1")).toBeVisible();
		await page.getByRole("button", { name: "New slide" }).first().click();
		await page.getByRole("menuitem", { name: /Title and body/ }).click();
		await expect(page.getByLabel("Slide 2")).toBeVisible();
		await page.getByRole("button", { name: "Text box" }).click();
		await page.keyboard.type("Hello from e2e");
		await page.keyboard.press("Escape");
		await expectSaved(page);

		const opened = await (await page.request.get(`/api/office/${id}`)).json();
		expect(opened.content.slides).toHaveLength(2);
		expect(JSON.stringify(opened.content.slides[1])).toContain("Hello from e2e");

		await page.getByRole("button", { name: "Present", exact: true }).click();
		await expect(page.getByText(/2 of 2|1 of 2/)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("button", { name: "Present", exact: true })).toBeVisible();
	});

	test("opens the Pitch deck template with several slides", async ({ page }) => {
		await createFromHome(page, "/slides", "Pitch deck");
		await expect(page.getByLabel("Slide 6")).toBeVisible();
	});
});

test.describe("Drive", () => {
	test("New > Docs in Drive creates a document and Drive opens it in the editor", async ({ page }) => {
		await page.goto("/drive");
		await page.getByRole("button", { name: "New", exact: true }).first().click();
		await page.getByRole("menuitem", { name: "Docs" }).click();
		await page.waitForURL(/\/docs\/drv_/);
		const id = page.url().split("/").pop()!;
		await page.goto("/drive");
		await page.getByRole("button", { name: "Untitled document" }).first().click();
		await page.waitForURL(/\/docs\/drv_/);
		expect(page.url()).toContain("/docs/");
		expect(id).toMatch(/^drv_/);
	});
});

test.describe("Sharing", () => {
	test("viewer, editor, revoke and public link", async ({ page, browser }) => {
		const sharedName = `Shared e2e ${Date.now()}`;
		const bob = MEMBER.email;

		const created = await page.request.post("/api/office", { data: { kind: "document", name: sharedName, content: { html: "<p>Owner text</p>" } }, headers: { Origin: baseUrl() } });
		const { item } = await created.json();

		// The owner shares through the dialog.
		await page.goto(`/docs/${item.id}`);
		await page.getByRole("button", { name: "Share", exact: true }).click();
		await page.getByLabel("Email address").or(page.getByPlaceholder(/email/i)).first().fill(bob);
		await page.getByLabel("Notify people by email").uncheck();
		await page.getByRole("button", { name: /^(Add|Share|Invite)$/ }).click();
		await expect(page.getByRole("dialog").getByText(bob)).toBeVisible();
		await page.keyboard.press("Escape");

		// Bob can view but not edit.
		const bobPage = await newSignedInPage(browser, MEMBER.email, MEMBER.password);
		await bobPage.goto(`/docs/${item.id}`);
		await expect(bobPage.getByText("View only").first()).toBeVisible();
		await expect(bobPage.locator("[contenteditable=true]")).toHaveCount(0);
		await expect(bobPage.getByText("Owner text")).toBeVisible();
		const forbidden = await bobPage.request.put(`/api/office/${item.id}`, { data: { content: { html: "<p>x</p>" }, baseRevision: 1 }, headers: { Origin: baseUrl() } });
		expect(forbidden.status()).toBe(403);
		await bobPage.goto("/docs");
		await bobPage.getByRole("radio", { name: "Shared with me" }).click();
		await expect(bobPage.getByRole("link", { name: new RegExp(sharedName) })).toBeVisible();

		// Upgraded to editor, the open page becomes editable without a reload.
		await bobPage.goto(`/docs/${item.id}`);
		await apiShare(page, item.id, bob, "edit");
		await expect(bobPage.locator("[contenteditable=true]").first()).toBeVisible({ timeout: 25_000 });
		await bobPage.locator("[contenteditable=true]").first().click();
		await bobPage.keyboard.press("End");
		await bobPage.keyboard.type(" and Bob");
		await expect.poll(async () => (await (await page.request.get(`/api/office/${item.id}`)).json()).content.html, { timeout: 15_000 }).toContain("and Bob");

		// Revoked, the open page says so.
		const shares = await (await page.request.get(`/api/drive/items/${item.id}/shares`)).json() as { shares: { id: string; email: string }[] };
		const share = shares.shares.find((entry) => entry.email === bob)!;
		await page.request.delete(`/api/drive/items/${item.id}/shares?shareId=${share.id}`, { headers: { Origin: baseUrl() } });
		await expect(bobPage.getByText(/don't have access/)).toBeVisible({ timeout: 25_000 });

		// Public link: anyone can read, nobody can edit.
		const link = await (await page.request.post(`/api/drive/items/${item.id}/link`, { data: { enabled: true }, headers: { Origin: baseUrl() } })).json() as { linkToken: string };
		const anonymous = await (await browser.newContext({ baseURL: baseUrl() })).newPage();
		await anonymous.goto(`/d/${link.linkToken}`);
		await expect(anonymous.getByText("and Bob")).toBeVisible();
		await expect(anonymous.locator("[contenteditable=true]")).toHaveCount(0);
		await page.request.post(`/api/drive/items/${item.id}/link`, { data: { enabled: false }, headers: { Origin: baseUrl() } });
		await anonymous.reload();
		await expect(anonymous.getByText(/link is not available/i)).toBeVisible();
	});

	test("two editors saving at once get a conflict prompt, not a silent overwrite", async ({ page, browser }) => {
		const created = await page.request.post("/api/office", { data: { kind: "document", name: "Conflict e2e", content: { html: "<p>Base</p>" } }, headers: { Origin: baseUrl() } });
		const { item } = await created.json();
		await page.goto(`/docs/${item.id}`);
		await expect(page.locator("[contenteditable=true]").first()).toContainText("Base");

		// Another tab of the same owner saves first.
		const other = await newSignedInPage(browser, ADMIN.email, ADMIN.password);
		const saved = await other.request.put(`/api/office/${item.id}`, { data: { content: { html: "<p>From the other tab</p>" }, baseRevision: 1 }, headers: { Origin: baseUrl() } });
		expect(saved.ok()).toBe(true);

		await page.locator("[contenteditable=true]").first().click();
		await page.keyboard.type(" local edit");
		await expect(page.getByRole("alert").getByText(/Someone else saved changes/)).toBeVisible({ timeout: 15_000 });
		await page.getByRole("button", { name: "Load latest version" }).click();
		await expect(page.locator("[contenteditable=true]").first()).toContainText("From the other tab");
	});
});
