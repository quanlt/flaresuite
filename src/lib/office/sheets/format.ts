import type { CellStyle } from "../types";
import { formatGeneralNumber, isError, serialToDate } from "./formula";
import type { Scalar } from "./formula";

export type DisplayValue = { text: string; align: "left" | "center" | "right"; error: boolean };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

function formatDate(value: Scalar): string | null {
	if (typeof value === "number") {
		const date = serialToDate(value);
		const time = value % 1 !== 0;
		const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
		return time ? `${day} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}` : day;
	}
	if (typeof value === "string" && ISO_DATE.test(value)) return value;
	return null;
}

/** "13:05:09" for the time-of-day part of a date serial. */
export function formatTime(value: number): string {
	const fraction = value - Math.floor(value);
	const seconds = Math.round(fraction * 86_400) % 86_400;
	const pad = (part: number) => String(part).padStart(2, "0");
	return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/** The text a cell shows for its computed value and style, and how it lines up by default. */
export function formatCellValue(value: Scalar, style: CellStyle | undefined, locale = "en-US", currency = "USD"): DisplayValue {
	const explicit = style?.align;
	if (isError(value)) return { text: value.code, align: explicit ?? "center", error: true };
	if (value === null) return { text: "", align: explicit ?? "left", error: false };
	if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE", align: explicit ?? "center", error: false };
	const format = style?.format ?? "general";
	if (typeof value === "string") {
		if (format === "date") {
			const date = formatDate(value);
			if (date) return { text: date, align: explicit ?? "right", error: false };
		}
		return { text: value, align: explicit ?? "left", error: false };
	}
	const decimals = Math.max(0, Math.min(10, style?.decimals ?? 2));
	let text: string;
	switch (format) {
		case "text": return { text: formatGeneralNumber(value), align: explicit ?? "left", error: false };
		case "number": text = value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); break;
		case "percent": text = `${(value * 100).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`; break;
		case "currency": text = value.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }); break;
		case "date": text = formatDate(value) ?? formatGeneralNumber(value); break;
		case "time": text = formatTime(value); break;
		default: text = style?.decimals !== undefined
			? value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false })
			: formatGeneralNumber(value);
	}
	return { text, align: explicit ?? "right", error: false };
}
