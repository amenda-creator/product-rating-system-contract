const { ResponseCodes } = require("../Constants/constants");

/**
 * Error type carrying a response code (the Web2 HttpError status) and optional
 * per-field details. Converted into { error: { code, message, details? } } by fromError().
 */
class ContractError extends Error {
	constructor(code, message, details) {
		super(message);
		this.name = "ContractError";
		this.code = code;
		this.details = details;
	}
}

function success(data) {
	return { success: data === undefined ? null : data };
}

function error(code, message, details) {
	const body = { code: code, message: message };
	if (details && typeof details === "object" && Object.keys(details).length > 0) body.details = details;
	return { error: body };
}

function fromError(err) {
	if (err instanceof ContractError) {
		return error(err.code, err.message, err.details);
	}
	if (err && typeof err === "object" && typeof err.code === "number" && err.message) {
		return error(err.code, String(err.message), err.details);
	}
	// Like the Web2 error handler: internal details are logged, never returned.
	console.error("[Response] Internal error:", err && err.message ? err.message : err);
	return error(ResponseCodes.INTERNAL_SERVER_ERROR, "Internal server error");
}

const badRequest = (message, details) => new ContractError(ResponseCodes.BAD_REQUEST, message, details);
const unauthorized = message => new ContractError(ResponseCodes.UNAUTHORIZED, message);
const forbidden = message => new ContractError(ResponseCodes.FORBIDDEN, message);
const notFound = message => new ContractError(ResponseCodes.NOT_FOUND, message);
const conflict = message => new ContractError(ResponseCodes.CONFLICT, message);

module.exports = {
	ContractError,
	success,
	error,
	fromError,
	badRequest,
	unauthorized,
	forbidden,
	notFound,
	conflict,
};
