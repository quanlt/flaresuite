import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
		trace: "retain-on-failure",
	},
	// PLAYWRIGHT_CHANNEL=chrome runs against an installed Google Chrome instead of the downloaded Chromium.
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: "npm run dev -- --strictPort",
				url: "http://localhost:3000/login",
				// Use PLAYWRIGHT_BASE_URL explicitly when targeting an existing dev server.
				reuseExistingServer: false,
				timeout: 180_000,
			},
});
