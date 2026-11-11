const { UserService } = require("../Services/Domain.Services/User.Service");
const { UserActions, ResponseCodes } = require("../Constants/constants");
const ResponseHelper = require("../Utils/Response.Helper");

class UserController {
	#message = null;
	#service = null;

	constructor(message) {
		this.#message = message;
		this.#service = new UserService(message);
	}

	async handleRequest() {
		const action = this.#message.Action;
		console.log(`[UserController] Dispatching action: ${action}`);
		try {
			switch (action) {
				case UserActions.REGISTER:
					return await this.#service.register();
				case UserActions.GET_ME:
					return await this.#service.getMe();
				case UserActions.UPDATE_PROFILE:
					return await this.#service.updateProfile();
				case UserActions.GET_USERS:
					return await this.#service.getUsers();
				case UserActions.SET_USER_ROLE:
					return await this.#service.setUserRole();
				default:
					throw new ResponseHelper.ContractError(ResponseCodes.NOT_FOUND, `Endpoint not found: invalid User action ${action}`);
			}
		} catch (error) {
			console.error(`[UserController] Action "${action}" failed:`, error.message || error);
			return ResponseHelper.fromError(error);
		}
	}
}

module.exports = { UserController };
