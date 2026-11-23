/**
 * Spreadsheet formulas: tokenizer, parser and a memoized evaluator over a whole workbook.
 * Pure: no React, no DOM, so it runs in tests, in the editor and anywhere else.
 */
import type { Sheet, SpreadsheetContent } from "../types";
import { cellAddress, parseCellRef } from "./address";
import type { CellRef } from "./address";

/* ------------------------------------------------------------------ values */

export type ErrorCode = "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#N/A" | "#NUM!" | "#CYCLE!" | "#ERROR!";

export class FormulaError {
	constructor(readonly code: ErrorCode) {}
	toString() { return this.code; }
}

export type Scalar = number | string | boolean | null | FormulaError;
/** A range argument: rows of values. */
export type Matrix = Scalar[][];
type Value = Scalar | Matrix;

const ERROR_CODES: ErrorCode[] = ["#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#N/A", "#NUM!", "#CYCLE!", "#ERROR!"];
const err = (code: ErrorCode) => new FormulaError(code);
export const isError = (value: unknown): value is FormulaError => value instanceof FormulaError;
const isMatrix = (value: Value): value is Matrix => Array.isArray(value);

/** Thrown inside the evaluator to unwind with an error value. */
class Raise {
	constructor(readonly error: FormulaError) {}
}

/* ------------------------------------------------------------------ tokenizer */

export type TokenType = "number" | "string" | "bool" | "error" | "ref" | "sheet" | "func" | "name" | "op" | "lparen" | "rparen" | "comma" | "colon";
export type Token = { type: TokenType; value: string; start: number; end: number };

const OPERATORS = ["<>", "<=", ">=", "+", "-", "*", "/", "^", "&", "%", "=", "<", ">"];
const REF_TEXT = /^\$?[A-Za-z]{1,3}\$?\d{1,7}$/;

/** Splits a formula body (without the leading "=") into tokens with their source offsets. */
export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < text.length) {
		const char = text[index];
		const start = index;
		if (/\s/.test(char)) { index += 1; continue; }
		if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(text[index + 1] ?? ""))) {
			const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(index))!;
			index += match[0].length;
			tokens.push({ type: "number", value: match[0], start, end: index });
			continue;
		}
		if (char === '"') {
			let value = "";
			index += 1;
			while (index < text.length) {
				if (text[index] === '"') {
					if (text[index + 1] === '"') { value += '"'; index += 2; continue; }
					index += 1;
					break;
				}
				value += text[index];
				index += 1;
			}
			tokens.push({ type: "string", value, start, end: index });
			continue;
		}
		if (char === "'") {
			let value = "";
			index += 1;
			while (index < text.length) {
				if (text[index] === "'") {
					if (text[index + 1] === "'") { value += "'"; index += 2; continue; }
					index += 1;
					break;
				}
				value += text[index];
				index += 1;
			}
			if (text[index] === "!") index += 1;
			tokens.push({ type: "sheet", value, start, end: index });
			continue;
		}
		if (char === "#") {
			const code = ERROR_CODES.find((candidate) => text.slice(index, index + candidate.length).toUpperCase() === candidate);
			if (code) {
				index += code.length;
				tokens.push({ type: "error", value: code, start, end: index });
				continue;
			}
		}
		if (/[A-Za-z_$]/.test(char)) {
			const match = /^[A-Za-z0-9_.$]+/.exec(text.slice(index))!;
			index += match[0].length;
			const word = match[0];
			if (text[index] === "!") {
				index += 1;
				tokens.push({ type: "sheet", value: word, start, end: index });
				continue;
			}
			let look = index;
			while (/\s/.test(text[look] ?? "")) look += 1;
			if (text[look] === "(" && !word.includes("$")) tokens.push({ type: "func", value: word.toUpperCase(), start, end: index });
			else if (REF_TEXT.test(word)) tokens.push({ type: "ref", value: word.toUpperCase(), start, end: index });
			else if (/^(TRUE|FALSE)$/i.test(word)) tokens.push({ type: "bool", value: word.toUpperCase(), start, end: index });
			else tokens.push({ type: "name", value: word, start, end: index });
			continue;
		}
		if (char === "(") { index += 1; tokens.push({ type: "lparen", value: "(", start, end: index }); continue; }
		if (char === ")") { index += 1; tokens.push({ type: "rparen", value: ")", start, end: index }); continue; }
		if (char === "," || char === ";") { index += 1; tokens.push({ type: "comma", value: ",", start, end: index }); continue; }
		if (char === ":") { index += 1; tokens.push({ type: "colon", value: ":", start, end: index }); continue; }
		const operator = OPERATORS.find((candidate) => text.startsWith(candidate, index));
		if (operator) { index += operator.length; tokens.push({ type: "op", value: operator, start, end: index }); continue; }
		throw new Raise(err("#ERROR!"));
	}
	return tokens;
}

/* ------------------------------------------------------------------ parser */

export type Node =
	| { type: "num"; value: number }
	| { type: "str"; value: string }
	| { type: "bool"; value: boolean }
	| { type: "err"; value: ErrorCode }
	| { type: "ref"; sheet: string | null; ref: CellRef }
	| { type: "range"; sheet: string | null; start: CellRef; end: CellRef }
	| { type: "name"; value: string }
	| { type: "unary"; op: string; arg: Node }
	| { type: "postfix"; op: "%"; arg: Node }
	| { type: "binary"; op: string; left: Node; right: Node }
	| { type: "func"; name: string; args: Node[] };

class Parser {
	private position = 0;
	constructor(private readonly tokens: Token[]) {}

	parse(): Node {
		if (!this.tokens.length) throw new Raise(err("#ERROR!"));
		const node = this.comparison();
		if (this.position < this.tokens.length) throw new Raise(err("#ERROR!"));
		return node;
	}

	private peek() { return this.tokens[this.position]; }
	private next() { return this.tokens[this.position++]; }
	private isOp(...ops: string[]) { const token = this.peek(); return token?.type === "op" && ops.includes(token.value); }

	private comparison(): Node {
		let left = this.concat();
		while (this.isOp("=", "<>", "<", ">", "<=", ">=")) {
			const op = this.next().value;
			left = { type: "binary", op, left, right: this.concat() };
		}
		return left;
	}

	private concat(): Node {
		let left = this.additive();
		while (this.isOp("&")) { this.next(); left = { type: "binary", op: "&", left, right: this.additive() }; }
		return left;
	}

	private additive(): Node {
		let left = this.multiplicative();
		while (this.isOp("+", "-")) { const op = this.next().value; left = { type: "binary", op, left, right: this.multiplicative() }; }
		return left;
	}

	private multiplicative(): Node {
		let left = this.power();
		while (this.isOp("*", "/")) { const op = this.next().value; left = { type: "binary", op, left, right: this.power() }; }
		return left;
	}

	private power(): Node {
		let left = this.unary();
		while (this.isOp("^")) { this.next(); left = { type: "binary", op: "^", left, right: this.unary() }; }
		return left;
	}

	private unary(): Node {
		if (this.isOp("-", "+")) { const op = this.next().value; return { type: "unary", op, arg: this.unary() }; }
		return this.postfix();
	}

	private postfix(): Node {
		let node = this.primary();
		while (this.isOp("%")) { this.next(); node = { type: "postfix", op: "%", arg: node }; }
		return node;
	}

	private primary(): Node {
		const token = this.next();
		if (!token) throw new Raise(err("#ERROR!"));
		switch (token.type) {
			case "number": return { type: "num", value: Number(token.value) };
			case "string": return { type: "str", value: token.value };
			case "bool": return { type: "bool", value: token.value === "TRUE" };
			case "error": return { type: "err", value: token.value as ErrorCode };
			case "name": return { type: "name", value: token.value };
			case "sheet": {
				const ref = this.next();
				if (ref?.type !== "ref") throw new Raise(err("#REF!"));
				return this.refOrRange(token.value, ref);
			}
			case "ref": return this.refOrRange(null, token);
			case "lparen": {
				const node = this.comparison();
				if (this.next()?.type !== "rparen") throw new Raise(err("#ERROR!"));
				return node;
			}
			case "func": {
				if (this.next()?.type !== "lparen") throw new Raise(err("#ERROR!"));
				const args: Node[] = [];
				if (this.peek()?.type === "rparen") { this.next(); return { type: "func", name: token.value, args }; }
				for (;;) {
					// An empty argument (e.g. IF(A1,,1)) counts as blank.
					if (this.peek()?.type === "comma" || this.peek()?.type === "rparen") args.push({ type: "str", value: "" });
					else args.push(this.comparison());
					const separator = this.next();
					if (separator?.type === "rparen") break;
					if (separator?.type !== "comma") throw new Raise(err("#ERROR!"));
				}
				return { type: "func", name: token.value, args };
			}
			default: throw new Raise(err("#ERROR!"));
		}
	}

	private refOrRange(sheet: string | null, token: Token): Node {
		const start = parseCellRef(token.value);
		if (!start) throw new Raise(err("#REF!"));
		if (this.peek()?.type === "colon") {
			this.next();
			let endToken = this.next();
			// "Sheet1!A1:Sheet1!B2" is accepted; the second sheet must match.
			if (endToken?.type === "sheet") endToken = this.next();
			const end = endToken?.type === "ref" ? parseCellRef(endToken.value) : null;
			if (!end) throw new Raise(err("#REF!"));
			return { type: "range", sheet, start, end };
		}
		return { type: "ref", sheet, ref: start };
	}
}

const astCache = new Map<string, Node | FormulaError>();

/** Parses a formula (with or without the leading "="). Cached, since the same text is evaluated often. */
export function parseFormula(formula: string): Node | FormulaError {
	const body = formula.startsWith("=") ? formula.slice(1) : formula;
	const cached = astCache.get(body);
	if (cached) return cached;
	let result: Node | FormulaError;
	try { result = new Parser(tokenize(body)).parse(); }
	catch (error) {
		if (error instanceof Raise) result = error.error;
		else throw error;
	}
	if (astCache.size > 5000) astCache.clear();
	astCache.set(body, result);
	return result;
}

export const isFormula = (input: string | undefined | null): input is string => !!input && input.startsWith("=") && input.length > 1;

/* ------------------------------------------------------------------ literals and coercion */

/** What a typed value (not a formula) means: number, percent, boolean or text. A leading ' forces text. */
export function parseLiteral(input: string | undefined | null): Scalar {
	if (input === undefined || input === null || input === "") return null;
	if (input.startsWith("'")) return input.slice(1);
	const trimmed = input.trim();
	if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed);
	if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) return Number(trimmed.replace(/,/g, ""));
	const percent = /^([+-]?(\d+\.?\d*|\.\d+))%$/.exec(trimmed);
	if (percent) return Number(percent[1]) / 100;
	if (/^true$/i.test(trimmed)) return true;
	if (/^false$/i.test(trimmed)) return false;
	return input;
}

function toNumber(value: Scalar): number {
	if (isError(value)) throw new Raise(value);
	if (typeof value === "number") return value;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value === null || value === "") return 0;
	const parsed = parseLiteral(value);
	if (typeof parsed === "number") return parsed;
	throw new Raise(err("#VALUE!"));
}

/** Shortest readable text for a number, like a spreadsheet's General format. */
export function formatGeneralNumber(value: number): string {
	if (!Number.isFinite(value)) return "#NUM!";
	if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
	const abs = Math.abs(value);
	if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return value.toExponential(5).replace(/\.?0+e/, "e");
	return String(Number.parseFloat(value.toPrecision(12)));
}

function toText(value: Scalar): string {
	if (isError(value)) throw new Raise(value);
	if (value === null) return "";
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	if (typeof value === "number") return formatGeneralNumber(value);
	return value;
}

function toBool(value: Scalar): boolean {
	if (isError(value)) throw new Raise(value);
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (value === null || value === "") return false;
	if (/^true$/i.test(value)) return true;
	if (/^false$/i.test(value)) return false;
	throw new Raise(err("#VALUE!"));
}

function scalar(value: Value): Scalar {
	if (!isMatrix(value)) return value;
	// A single-cell range acts as that cell; a larger range in a scalar position is an error.
	if (value.length === 1 && value[0].length === 1) return value[0][0];
	throw new Raise(err("#VALUE!"));
}

function flatten(values: Value[]): { value: Scalar; fromRange: boolean }[] {
	const out: { value: Scalar; fromRange: boolean }[] = [];
	for (const value of values) {
		if (isMatrix(value)) for (const row of value) for (const cell of row) out.push({ value: cell, fromRange: true });
		else out.push({ value, fromRange: false });
	}
	return out;
}

/** Numbers for aggregate functions: ranges contribute only numbers; direct arguments are coerced. */
function numbers(values: Value[]): number[] {
	const out: number[] = [];
	for (const { value, fromRange } of flatten(values)) {
		if (isError(value)) throw new Raise(value);
		if (fromRange) { if (typeof value === "number") out.push(value); }
		else if (value !== null) out.push(toNumber(value));
	}
	return out;
}

function compare(a: Scalar, b: Scalar): number {
	if (isError(a)) throw new Raise(a);
	if (isError(b)) throw new Raise(b);
	const rank = (value: Scalar) => (typeof value === "number" || value === null ? 0 : typeof value === "string" ? 1 : 2);
	const left = a === null ? (typeof b === "string" ? "" : typeof b === "boolean" ? false : 0) : a;
	const right = b === null ? (typeof a === "string" ? "" : typeof a === "boolean" ? false : 0) : b;
	if (rank(left) !== rank(right)) return rank(left) - rank(right);
	if (typeof left === "string" && typeof right === "string") return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0 ? 0 : left.toLowerCase() < right.toLowerCase() ? -1 : 1;
	const x = Number(left);
	const y = Number(right);
	return x === y ? 0 : x < y ? -1 : 1;
}

/** COUNTIF-style criteria: 5, ">5", "<>x", "=abc", "a*", "?b". */
function criteriaMatcher(criteria: Scalar): (value: Scalar) => boolean {
	if (typeof criteria === "number" || typeof criteria === "boolean") return (value) => !isError(value) && value !== null && compare(value, criteria) === 0;
	const text = criteria === null || isError(criteria) ? "" : String(criteria);
	const match = /^(<>|<=|>=|=|<|>)?(.*)$/s.exec(text)!;
	const op = match[1] ?? "=";
	const operand = parseLiteral(match[2]);
	if (typeof operand === "string" && (op === "=" || op === "<>") && /[*?]/.test(operand)) {
		const pattern = new RegExp(`^${operand.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
		return (value) => {
			const hit = typeof value === "string" && pattern.test(value);
			return op === "=" ? hit : !hit;
		};
	}
	return (value) => {
		if (isError(value)) return false;
		if (operand === null) return op === "=" ? value === null || value === "" : value !== null && value !== "";
		if (value === null) return op === "<>";
		if (typeof operand === "number" && typeof value !== "number") return op === "<>";
		if (typeof operand === "string" && typeof value !== "string") return op === "<>";
		const order = compare(value, operand);
		switch (op) {
			case "=": return order === 0;
			case "<>": return order !== 0;
			case "<": return order < 0;
			case ">": return order > 0;
			case "<=": return order <= 0;
			default: return order >= 0;
		}
	};
}

/* ------------------------------------------------------------------ dates (serial numbers, 1899-12-30 epoch) */

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export function dateToSerial(year: number, month: number, day: number): number {
	return Math.round((Date.UTC(year, month - 1, day) - EPOCH) / DAY_MS);
}

export function serialToDate(serial: number): Date {
	return new Date(EPOCH + Math.round(serial * DAY_MS));
}

function todaySerial(now = new Date()): number {
	return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/* ------------------------------------------------------------------ TEXT() */

/** Formats a number with a small subset of spreadsheet format codes. */
export function formatWithPattern(value: number, pattern: string): string {
	const lower = pattern.toLowerCase();
	if (/[ymd]/.test(lower) && !/[0#]/.test(lower)) {
		const date = serialToDate(value);
		const y = date.getUTCFullYear();
		const m = date.getUTCMonth() + 1;
		const d = date.getUTCDate();
		return lower
			.replace(/yyyy/g, String(y))
			.replace(/yy/g, String(y).slice(-2))
			.replace(/mm/g, String(m).padStart(2, "0"))
			.replace(/(^|[^a-z])m(?![a-z])/g, `$1${m}`)
			.replace(/dd/g, String(d).padStart(2, "0"))
			.replace(/(^|[^a-z])d(?![a-z])/g, `$1${d}`);
	}
	const percent = pattern.includes("%");
	const number = percent ? value * 100 : value;
	const decimalPart = /\.([0#]+)/.exec(pattern);
	const decimals = decimalPart ? decimalPart[1].length : 0;
	const grouping = pattern.includes(",");
	const formatted = Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
	const prefix = /^[^0#.,%]*/.exec(pattern)?.[0] ?? "";
	return `${number < 0 ? "-" : ""}${prefix}${formatted}${percent ? "%" : ""}`;
}

/* ------------------------------------------------------------------ functions */

type Fn = (args: Value[], ctx: { now: Date }) => Value;

const numArg = (args: Value[], index: number, fallback?: number) => {
	if (index >= args.length) {
		if (fallback === undefined) throw new Raise(err("#VALUE!"));
		return fallback;
	}
	return toNumber(scalar(args[index]));
};
const textArg = (args: Value[], index: number, fallback?: string) => {
	if (index >= args.length) {
		if (fallback === undefined) throw new Raise(err("#VALUE!"));
		return fallback;
	}
	return toText(scalar(args[index]));
};
const matrixArg = (value: Value): Matrix => (isMatrix(value) ? value : [[value]]);
const roundTo = (value: number, digits: number, mode: "round" | "up" | "down") => {
	const factor = 10 ** digits;
	const scaled = value * factor;
	const rounded = mode === "round" ? Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9) : mode === "up" ? Math.sign(scaled) * Math.ceil(Math.abs(scaled) - 1e-9) : Math.sign(scaled) * Math.floor(Math.abs(scaled) + 1e-9);
	return rounded / factor;
};
const needArgs = (args: Value[], min: number, max = Infinity) => {
	if (args.length < min || args.length > max) throw new Raise(err("#VALUE!"));
};

function lookupIndex(value: Scalar, candidates: Scalar[], exact: boolean): number {
	if (exact) {
		const matches = criteriaMatcher(typeof value === "string" ? `=${value}` : value);
		return candidates.findIndex((candidate) => matches(candidate));
	}
	// Approximate: the last candidate not greater than the value, assuming ascending order.
	let found = -1;
	for (let index = 0; index < candidates.length; index += 1) {
		const candidate = candidates[index];
		if (candidate === null || isError(candidate)) continue;
		if (compare(candidate, value) <= 0) found = index;
		else break;
	}
	return found;
}

const FUNCTIONS: Record<string, Fn> = {
	SUM: (args) => numbers(args).reduce((sum, value) => sum + value, 0),
	PRODUCT: (args) => numbers(args).reduce((product, value) => product * value, 1),
	AVERAGE: (args) => { const list = numbers(args); if (!list.length) throw new Raise(err("#DIV/0!")); return list.reduce((a, b) => a + b, 0) / list.length; },
	MIN: (args) => { const list = numbers(args); return list.length ? Math.min(...list) : 0; },
	MAX: (args) => { const list = numbers(args); return list.length ? Math.max(...list) : 0; },
	MEDIAN: (args) => {
		const list = numbers(args).sort((a, b) => a - b);
		if (!list.length) throw new Raise(err("#NUM!"));
		const middle = Math.floor(list.length / 2);
		return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
	},
	COUNT: (args) => flatten(args).filter(({ value, fromRange }) => typeof value === "number" || (!fromRange && typeof value === "string" && typeof parseLiteral(value) === "number")).length,
	COUNTA: (args) => flatten(args).filter(({ value }) => value !== null && value !== "").length,
	COUNTIF: (args) => { needArgs(args, 2, 2); const matches = criteriaMatcher(scalar(args[1])); return flatten([args[0]]).filter(({ value }) => matches(value)).length; },
	SUMIF: (args) => {
		needArgs(args, 2, 3);
		const range = matrixArg(args[0]);
		const sumRange = args[2] !== undefined ? matrixArg(args[2]) : range;
		const matches = criteriaMatcher(scalar(args[1]));
		let total = 0;
		range.forEach((row, r) => row.forEach((value, c) => { const target = sumRange[r]?.[c]; if (matches(value) && typeof target === "number") total += target; }));
		return total;
	},
	AVERAGEIF: (args) => {
		needArgs(args, 2, 3);
		const range = matrixArg(args[0]);
		const avgRange = args[2] !== undefined ? matrixArg(args[2]) : range;
		const matches = criteriaMatcher(scalar(args[1]));
		const picked: number[] = [];
		range.forEach((row, r) => row.forEach((value, c) => { const target = avgRange[r]?.[c]; if (matches(value) && typeof target === "number") picked.push(target); }));
		if (!picked.length) throw new Raise(err("#DIV/0!"));
		return picked.reduce((a, b) => a + b, 0) / picked.length;
	},
	IF: (args) => { needArgs(args, 1, 3); return toBool(scalar(args[0])) ? (args[1] ?? true) : (args[2] ?? false); },
	IFS: (args) => {
		if (args.length < 2 || args.length % 2) throw new Raise(err("#VALUE!"));
		for (let index = 0; index < args.length; index += 2) if (toBool(scalar(args[index]))) return args[index + 1];
		throw new Raise(err("#N/A"));
	},
	AND: (args) => { const list = flatten(args).filter(({ value }) => value !== null); if (!list.length) throw new Raise(err("#VALUE!")); return list.every(({ value }) => toBool(value)); },
	OR: (args) => { const list = flatten(args).filter(({ value }) => value !== null); if (!list.length) throw new Raise(err("#VALUE!")); return list.some(({ value }) => toBool(value)); },
	NOT: (args) => { needArgs(args, 1, 1); return !toBool(scalar(args[0])); },
	ROUND: (args) => roundTo(numArg(args, 0), numArg(args, 1, 0), "round"),
	ROUNDUP: (args) => roundTo(numArg(args, 0), numArg(args, 1, 0), "up"),
	ROUNDDOWN: (args) => roundTo(numArg(args, 0), numArg(args, 1, 0), "down"),
	ABS: (args) => Math.abs(numArg(args, 0)),
	SQRT: (args) => { const value = numArg(args, 0); if (value < 0) throw new Raise(err("#NUM!")); return Math.sqrt(value); },
	POWER: (args) => numArg(args, 0) ** numArg(args, 1),
	MOD: (args) => { const a = numArg(args, 0); const b = numArg(args, 1); if (b === 0) throw new Raise(err("#DIV/0!")); return a - b * Math.floor(a / b); },
	INT: (args) => Math.floor(numArg(args, 0)),
	CONCAT: (args) => flatten(args).map(({ value }) => toText(value)).join(""),
	CONCATENATE: (args) => flatten(args).map(({ value }) => toText(value)).join(""),
	TEXTJOIN: (args) => {
		needArgs(args, 3);
		const delimiter = textArg(args, 0);
		const ignoreEmpty = toBool(scalar(args[1]));
		return flatten(args.slice(2)).map(({ value }) => toText(value)).filter((text) => !ignoreEmpty || text !== "").join(delimiter);
	},
	LEN: (args) => textArg(args, 0).length,
	LEFT: (args) => textArg(args, 0).slice(0, Math.max(0, numArg(args, 1, 1))),
	RIGHT: (args) => { const text = textArg(args, 0); const count = Math.max(0, numArg(args, 1, 1)); return count ? text.slice(-count) : ""; },
	MID: (args) => { const start = numArg(args, 1); if (start < 1) throw new Raise(err("#VALUE!")); return textArg(args, 0).slice(start - 1, start - 1 + Math.max(0, numArg(args, 2))); },
	UPPER: (args) => textArg(args, 0).toUpperCase(),
	LOWER: (args) => textArg(args, 0).toLowerCase(),
	PROPER: (args) => textArg(args, 0).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase()),
	TRIM: (args) => textArg(args, 0).trim().replace(/ {2,}/g, " "),
	SUBSTITUTE: (args) => {
		const text = textArg(args, 0);
		const search = textArg(args, 1);
		const replacement = textArg(args, 2);
		if (!search) return text;
		if (args.length < 4) return text.split(search).join(replacement);
		const occurrence = numArg(args, 3);
		let seen = 0;
		return text.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), (match) => (++seen === occurrence ? replacement : match));
	},
	FIND: (args) => { const index = textArg(args, 1).indexOf(textArg(args, 0), numArg(args, 2, 1) - 1); if (index < 0) throw new Raise(err("#VALUE!")); return index + 1; },
	VALUE: (args) => toNumber(scalar(args[0] ?? null)),
	TEXT: (args) => formatWithPattern(numArg(args, 0), textArg(args, 1)),
	TODAY: (_args, ctx) => todaySerial(ctx.now),
	NOW: (_args, ctx) => todaySerial(ctx.now) + (ctx.now.getHours() * 3600 + ctx.now.getMinutes() * 60 + ctx.now.getSeconds()) / 86_400,
	DATE: (args) => dateToSerial(numArg(args, 0), numArg(args, 1), numArg(args, 2)),
	YEAR: (args) => serialToDate(numArg(args, 0)).getUTCFullYear(),
	MONTH: (args) => serialToDate(numArg(args, 0)).getUTCMonth() + 1,
	DAY: (args) => serialToDate(numArg(args, 0)).getUTCDate(),
	VLOOKUP: (args) => {
		needArgs(args, 3, 4);
		const table = matrixArg(args[1]);
		const column = numArg(args, 2);
		if (column < 1 || column > (table[0]?.length ?? 0)) throw new Raise(err("#REF!"));
		const exact = args.length > 3 ? !toBool(scalar(args[3])) : false;
		const index = lookupIndex(scalar(args[0]), table.map((row) => row[0]), exact);
		if (index < 0) throw new Raise(err("#N/A"));
		return table[index][column - 1];
	},
	HLOOKUP: (args) => {
		needArgs(args, 3, 4);
		const table = matrixArg(args[1]);
		const row = numArg(args, 2);
		if (row < 1 || row > table.length) throw new Raise(err("#REF!"));
		const exact = args.length > 3 ? !toBool(scalar(args[3])) : false;
		const index = lookupIndex(scalar(args[0]), table[0] ?? [], exact);
		if (index < 0) throw new Raise(err("#N/A"));
		return table[row - 1][index];
	},
	INDEX: (args) => {
		needArgs(args, 2, 3);
		const table = matrixArg(args[0]);
		let row = numArg(args, 1);
		let column = numArg(args, 2, 0);
		// A single row or column takes one index for its only dimension.
		if (args.length === 2 && table.length === 1) { column = row; row = 1; }
		if (row === 0 && column === 0) return table;
		if (row === 0) return table.map((line) => [line[column - 1] ?? null]);
		if (column === 0) {
			if ((table[0]?.length ?? 0) === 1) column = 1;
			else return [table[row - 1] ?? []];
		}
		if (row < 1 || row > table.length || column < 1 || column > (table[0]?.length ?? 0)) throw new Raise(err("#REF!"));
		return table[row - 1][column - 1];
	},
	MATCH: (args) => {
		needArgs(args, 2, 3);
		const table = matrixArg(args[1]);
		const list = table.length === 1 ? table[0] : table.map((row) => row[0]);
		const type = numArg(args, 2, 1);
		const value = scalar(args[0]);
		let index = -1;
		if (type === 0) index = lookupIndex(value, list, true);
		else if (type > 0) index = lookupIndex(value, list, false);
		else {
			// Descending order: the smallest value not less than the lookup value.
			for (let position = 0; position < list.length; position += 1) {
				const candidate = list[position];
				if (candidate === null || isError(candidate)) continue;
				if (compare(candidate, value) >= 0) index = position;
				else break;
			}
		}
		if (index < 0) throw new Raise(err("#N/A"));
		return index + 1;
	},
	IFERROR: () => { throw new Error("handled by the evaluator"); },
	ISBLANK: (args) => scalar(args[0] ?? null) === null,
	ISNUMBER: (args) => typeof scalar(args[0] ?? null) === "number",
	ISTEXT: (args) => typeof scalar(args[0] ?? null) === "string",
	PI: () => Math.PI,
};

/** Every function name the evaluator knows, for autocomplete. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();

/* ------------------------------------------------------------------ evaluator */

export type Workbook = {
	/** The computed value of a cell (a literal or a formula result). */
	getValue(sheetId: string, row: number, col: number): Scalar;
	/** Evaluates a formula as if it were typed into a cell of the sheet. */
	evaluate(sheetId: string, formula: string): Scalar;
};

const MAX_ROWS = 10_000;
const MAX_COLS = 702;

export function evaluateWorkbook(content: SpreadsheetContent, now = new Date()): Workbook {
	const sheetsById = new Map<string, Sheet>(content.sheets.map((sheet) => [sheet.id, sheet]));
	const sheetsByName = new Map<string, Sheet>(content.sheets.map((sheet) => [sheet.name.toLowerCase(), sheet]));
	const memo = new Map<string, Scalar>();
	const evaluating = new Set<string>();
	const ctx = { now };

	function resolveSheet(current: Sheet, name: string | null): Sheet {
		if (name === null) return current;
		const sheet = sheetsByName.get(name.toLowerCase());
		if (!sheet) throw new Raise(err("#REF!"));
		return sheet;
	}

	function cellValue(sheet: Sheet, row: number, col: number): Scalar {
		if (row < 0 || col < 0 || row >= MAX_ROWS || col >= MAX_COLS) return err("#REF!");
		const address = cellAddress(row, col);
		const key = `${sheet.id}!${address}`;
		const known = memo.get(key);
		if (known !== undefined) return known;
		const input = sheet.cells[address]?.input;
		if (!isFormula(input)) {
			const literal = parseLiteral(input);
			memo.set(key, literal);
			return literal;
		}
		if (evaluating.has(key)) return err("#CYCLE!");
		evaluating.add(key);
		let result: Scalar;
		try { result = evaluateFormula(sheet, input); }
		finally { evaluating.delete(key); }
		memo.set(key, result);
		return result;
	}

	function evaluateFormula(sheet: Sheet, formula: string): Scalar {
		const ast = parseFormula(formula);
		if (isError(ast)) return ast;
		try {
			const value = evaluateNode(sheet, ast);
			const single = isMatrix(value) ? (value.length === 1 && value[0].length === 1 ? value[0][0] : err("#VALUE!")) : value;
			if (typeof single === "number" && !Number.isFinite(single)) return err("#NUM!");
			// An empty reference shows as 0, like other spreadsheets.
			return single === null ? 0 : single;
		} catch (error) {
			if (error instanceof Raise) return error.error;
			if (error instanceof RangeError) return err("#CYCLE!");
			throw error;
		}
	}

	function rangeValues(sheet: Sheet, start: CellRef, end: CellRef): Matrix {
		const top = Math.min(start.row, end.row);
		const bottom = Math.max(start.row, end.row);
		const left = Math.min(start.col, end.col);
		const right = Math.max(start.col, end.col);
		// Whole-column style ranges stop at the sheet's own size.
		const lastRow = Math.min(bottom, Math.max(sheet.rowCount, top + 1) - 1, MAX_ROWS - 1);
		const lastCol = Math.min(right, Math.max(sheet.colCount, left + 1) - 1, MAX_COLS - 1);
		const rows: Matrix = [];
		for (let row = top; row <= lastRow; row += 1) {
			const line: Scalar[] = [];
			for (let col = left; col <= lastCol; col += 1) line.push(cellValue(sheet, row, col));
			rows.push(line);
		}
		return rows;
	}

	function evaluateNode(sheet: Sheet, node: Node): Value {
		switch (node.type) {
			case "num": return node.value;
			case "str": return node.value;
			case "bool": return node.value;
			case "err": return err(node.value);
			case "name": throw new Raise(err("#NAME?"));
			case "ref": {
				const value = cellValue(resolveSheet(sheet, node.sheet), node.ref.row, node.ref.col);
				return value;
			}
			case "range": return rangeValues(resolveSheet(sheet, node.sheet), node.start, node.end);
			case "unary": {
				const value = toNumber(scalar(evaluateNode(sheet, node.arg)));
				return node.op === "-" ? -value : value;
			}
			case "postfix": return toNumber(scalar(evaluateNode(sheet, node.arg))) / 100;
			case "binary": {
				const left = scalar(evaluateNode(sheet, node.left));
				const right = scalar(evaluateNode(sheet, node.right));
				if (isError(left)) throw new Raise(left);
				if (isError(right)) throw new Raise(right);
				switch (node.op) {
					case "+": return toNumber(left) + toNumber(right);
					case "-": return toNumber(left) - toNumber(right);
					case "*": return toNumber(left) * toNumber(right);
					case "/": {
						const divisor = toNumber(right);
						if (divisor === 0) throw new Raise(err("#DIV/0!"));
						return toNumber(left) / divisor;
					}
					case "^": return toNumber(left) ** toNumber(right);
					case "&": return toText(left) + toText(right);
					case "=": return compare(left, right) === 0;
					case "<>": return compare(left, right) !== 0;
					case "<": return compare(left, right) < 0;
					case ">": return compare(left, right) > 0;
					case "<=": return compare(left, right) <= 0;
					case ">=": return compare(left, right) >= 0;
					default: throw new Raise(err("#ERROR!"));
				}
			}
			case "func": {
				if (node.name === "IFERROR") {
					if (node.args.length < 1 || node.args.length > 2) throw new Raise(err("#VALUE!"));
					try {
						const value = evaluateNode(sheet, node.args[0]);
						if (isError(value)) return node.args[1] ? evaluateNode(sheet, node.args[1]) : "";
						return value;
					} catch (error) {
						if (error instanceof Raise) return node.args[1] ? evaluateNode(sheet, node.args[1]) : "";
						throw error;
					}
				}
				const fn = FUNCTIONS[node.name];
				if (!fn) throw new Raise(err("#NAME?"));
				// IF only evaluates the branch it takes.
				if (node.name === "IF") {
					if (node.args.length < 1 || node.args.length > 3) throw new Raise(err("#VALUE!"));
					const condition = toBool(scalar(evaluateNode(sheet, node.args[0])));
					const branch = condition ? node.args[1] : node.args[2];
					if (!branch) return condition;
					return evaluateNode(sheet, branch);
				}
				return fn(node.args.map((arg) => evaluateNode(sheet, arg)), ctx);
			}
		}
	}

	// Warm the cache top to bottom so long chains of formulas that point upward never recurse deeply.
	for (const sheet of content.sheets) {
		const addresses = Object.keys(sheet.cells).filter((address) => isFormula(sheet.cells[address]?.input));
		const coords = addresses.map((address) => ({ address, ref: parseCellRef(address) })).filter((entry) => entry.ref);
		coords.sort((a, b) => a.ref!.row - b.ref!.row || a.ref!.col - b.ref!.col);
		for (const { ref } of coords) cellValue(sheet, ref!.row, ref!.col);
	}

	return {
		getValue(sheetId, row, col) {
			const sheet = sheetsById.get(sheetId);
			return sheet ? cellValue(sheet, row, col) : null;
		},
		evaluate(sheetId, formula) {
			const sheet = sheetsById.get(sheetId);
			return sheet ? evaluateFormula(sheet, formula) : err("#REF!");
		},
	};
}

/** Text of a computed value for display without a number format. */
export function valueToText(value: Scalar): string {
	if (isError(value)) return value.code;
	if (value === null) return "";
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	if (typeof value === "number") return formatGeneralNumber(value);
	return value;
}
