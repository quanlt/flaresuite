/** Saves a generated file in the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name safe on every OS, keeping the user's wording. */
export function safeFileName(name: string, extension: string): string {
	const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
	return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

/** Reads a picked file as text (UTF-8). */
export function readFileText(file: File): Promise<string> {
	return file.text();
}

/** Reads a picked image as a data: URL, refusing anything larger than `maxBytes`. */
export function readImageAsDataUrl(file: File, maxBytes = 2 * 1024 * 1024): Promise<string> {
	if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return Promise.reject(new Error("unsupported"));
	if (file.size > maxBytes) return Promise.reject(new Error("too-large"));
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("read"));
		reader.readAsDataURL(file);
	});
}

/** File name without its extension, for naming an imported document. */
export function stripExtension(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}
