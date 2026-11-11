const { HealthActions, ResponseCodes } = require("../Constants/constants");
const ResponseHelper = require("../Utils/Response.Helper");

/**
 * Answers { "Service": "Health", "Action": "HealthCheck" } with { success: { status: "healthy" } }.
 * Deterministic and side-effect free: no DB access, no clock, no randomness, no auth.
 * The router echoes the request's promiseId back unchanged.
 */
class HealthController {
	#message = null;

	constructor(message) {
		this.#message = message;
	}

	async handleRequest() {
		if (this.#message.Action === HealthActions.HEALTH_CHECK) {
			return { success: { status: "healthy" } };
		}
		return ResponseHelper.error(
			ResponseCodes.BAD_REQUEST,
			`Invalid Health action: ${this.#message.Action}`,
		);
	}
}

module.exports = { HealthController };
