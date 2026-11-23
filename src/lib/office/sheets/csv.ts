/** RFC 4180 CSV and the tab-separated text spreadsheets put on the clipboard. */

export function parseDelimited(text: string, delimiter = ","): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	let index = 0;
	// A byte order mark is not data.
	if (text.charCodeAt(0) === 0xfeff) index = 1;
	for (; index < text.length; index += 1) {
		const char = text[index];
		if (quoted) {
			if (char === '"') {
				if (text[index + 1] === '"') { field += '"'; index += 1; }
				else quoted = false;
			} else field += char;
			continue;
		}
		if (char === '"' && field === "") { quoted = true; continue; }
		if (char === delimiter) { row.push(field); field = ""; continue; }
		if (char === "\r" || char === "\n") {
			if (char === "\r" && text[index + 1] === "\n") index += 1;
			row.push(field); rows.push(row); row = []; field = "";
			continue;
		}
		field += char;
	}
	if (field !== "" || row.length) { row.push(field); rows.push(row); }
	return rows;
}

export const parseCsv = (text: string) => parseDelimited(text, ",");
export const parseTsv = (text: string) => parseDelimited(text, "\t");

function quoteField(value: string, delimiter: string): string {
	return value.includes(delimiter) || /["\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeDelimited(rows: string[][], delimiter = ","): string {
	return rows.map((row) => row.map((value) => quoteField(value, delimiter)).join(delimiter)).join("\r\n");
}

export const serializeCsv = (rows: string[][]) => serializeDelimited(rows, ",");
export const serializeTsv = (rows: string[][]) => serializeDelimited(rows, "\t");

/** Guesses tab or comma for pasted or imported text. */
export function detectDelimiter(text: string): "," | "\t" {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
	return firstLine.includes("\t") ? "\t" : ",";
}
