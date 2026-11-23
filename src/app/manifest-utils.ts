import type { MetadataRoute } from "next";

// The installed app carries the workspace's own name and icon (white label); the bundled icons are the
// fallback for installs without custom branding.
export function buildManifest(branding: { appName: string; hasCustomIcon: boolean }): MetadataRoute.Manifest {
	return {
		name: branding.appName,
		short_name: branding.appName,
		description: "Email, calendar and files for your team.",
		id: "/",
		scope: "/",
		start_url: "/inbox",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#f6f8fc",
		icons: branding.hasCustomIcon
			? [{ src: "/api/branding/icon", sizes: "any" }]
			: [
					{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
					{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
				],
	};
}
