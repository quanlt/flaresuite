import createDOMPurify from "dompurify";

let purifier: ReturnType<typeof createDOMPurify> | null = null;

/**
 * Cleans rich text before it is put into the page. Documents are shared between accounts and by public link, so
 * whatever is stored is treated as untrusted: no scripts, event handlers, frames or forms. Inline styles, links,
 * tables and images (https and data: URLs) are kept because the editors produce them.
 */
export function sanitizeOfficeHtml(html: string): string {
	if (typeof window === "undefined") return "";
	purifier ??= createDOMPurify(window);
	return purifier.sanitize(html, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ["script", "style", "iframe", "frame", "object", "embed", "form", "input", "button", "textarea", "select", "meta", "link", "base"],
		FORBID_ATTR: ["srcset"],
		ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp);base64,)/i,
		ADD_ATTR: ["target", "data-checked", "colspan", "rowspan"],
	});
}
