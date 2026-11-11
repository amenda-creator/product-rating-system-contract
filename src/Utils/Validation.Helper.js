const { ContractError } = require("./Response.Helper");
const { ResponseCodes } = require("../Constants/constants");

/**
 * Port of the Web2 src/errors.js helpers.
 * validate() collects every field problem and throws one 400 "Validation failed" with details.
 */
function validate(rules) {
	const errors = {};
	for (const field of Object.keys(rules)) {
		const msg = rules[field]();
		if (msg) errors[field] = msg;
	}
	if (Object.keys(errors).length > 0) {
		throw new ContractError(ResponseCodes.BAD_REQUEST, "Validation failed", errors);
	}
}

function str(v, { min = 0, max, required = false, label }) {
	if (v === undefined || v === null || v === "") return required ? `${label} is required` : null;
	if (typeof v !== "string") return `${label} must be text`;
	const len = v.trim().length;
	if (len < min) return `${label} must be at least ${min} characters`;
	if (max && len > max) return `${label} must be at most ${max} characters`;
	return null;
}

function int(v, { min, max, label }) {
	return Number.isInteger(v) && v >= min && v <= max ? null : `${label} must be a whole number from ${min} to ${max}`;
}

/** Parses an id, throwing 404 "Not found" for anything that isn't a positive integer (route :id). */
function idParam(raw) {
	const id = typeof raw === "string" && raw.trim() === "" ? NaN : Number(raw);
	if (!Number.isSafeInteger(id) || id < 1) {
		throw new ContractError(ResponseCodes.NOT_FOUND, "Not found");
	}
	return id;
}

/** Integer parsing that mirrors parseInt(x, 10) || fallback from the Web2 query handling. */
function intOr(raw, fallback) {
	const n = parseInt(raw, 10);
	return Number.isNaN(n) || n === 0 ? fallback : n;
}

function clamp(n, min, max) {
	return Math.min(Math.max(n, min), max);
}

function trimOr(value, fallback) {
	return typeof value === "string" ? value.trim() : fallback;
}

module.exports = { validate, str, int, idParam, intOr, clamp, trimOr };
