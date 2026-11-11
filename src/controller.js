const { ServiceTypes, ResponseCodes } = require("./Constants/constants");
const { HealthController } = require("./Controllers/Health.Controller");
const { UserController } = require("./Controllers/User.Controller");
const { ProductController } = require("./Controllers/Product.Controller");
const { ReviewController } = require("./Controllers/Review.Controller");
const { UpgradeController } = require("./Controllers/Upgrade.Controller");
const { ClusterManagementController } = require("./Controllers/ClusterManagement.Controller");
const ResponseHelper = require("./Utils/Response.Helper");

/**
 * Main request router (replaces the Express app and its /api routers). Determines the
 * service type (HEALTH, USER, PRODUCT, REVIEW, UPGRADE, CLUSTER), delegates to the matching
 * controller and sends exactly one response back to the requesting user, echoing promiseId.
 */
class Controller {
	static normalizeMessage(raw) {
		const Service = raw.Service !== undefined ? raw.Service : raw.service;
		const Action = raw.Action !== undefined ? raw.Action : raw.action;
		let Data = raw.Data !== undefined ? raw.Data : raw.data;
		if (Data === undefined || Data === null || typeof Data !== "object" || Array.isArray(Data)) Data = {};
		return { Service, Action, Data, data: Data, promiseId: raw.promiseId };
	}

	static getUserPubKey(user) {
		const key = user.publicKey !== undefined ? user.publicKey : user.pubKey;
		return key ? String(key).toLowerCase() : "";
	}

	async handleRequest(user, rawMessage, isReadOnly) {
		const message = Controller.normalizeMessage(rawMessage);
		message.userPubKey = Controller.getUserPubKey(user);
		message.isReadOnly = !!isReadOnly;

		console.log(
			`[Controller] ${isReadOnly ? "READ" : "WRITE"} request - Service: ${message.Service}, Action: ${message.Action}`,
		);

		let result;
		try {
			switch (message.Service) {
				case ServiceTypes.HEALTH:
					result = await new HealthController(message).handleRequest();
					break;
				case ServiceTypes.USER:
					result = await new UserController(message).handleRequest();
					break;
				case ServiceTypes.PRODUCT:
					result = await new ProductController(message).handleRequest();
					break;
				case ServiceTypes.REVIEW:
					result = await new ReviewController(message).handleRequest();
					break;
				case ServiceTypes.UPGRADE:
					result = await new UpgradeController(message).handleRequest();
					break;
				case ServiceTypes.CLUSTER:
					result = await new ClusterManagementController(message).handleRequest();
					break;
				default:
					// Equivalent of the Web2 catch-all: 404 "Endpoint not found".
					result = ResponseHelper.error(ResponseCodes.NOT_FOUND, `Endpoint not found: unknown service ${message.Service}`);
			}
		} catch (error) {
			result = ResponseHelper.fromError(error);
		}

		if (!result || typeof result !== "object") {
			result = ResponseHelper.error(ResponseCodes.INTERNAL_SERVER_ERROR, "Empty response.");
		}

		const hasPromiseId = message.promiseId !== undefined && message.promiseId !== null;
		const response = hasPromiseId ? Object.assign({ promiseId: message.promiseId }, result) : result;
		await this.sendOutput(user, response);
	}

	async sendOutput(user, response) {
		await user.send(response);
	}
}

module.exports = { Controller };
