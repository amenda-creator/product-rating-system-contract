const { ClusterManagementService } = require("../Services/Domain.Services/ClusterManagement.Service");
const { ClusterActions, ResponseCodes } = require("../Constants/constants");
const ResponseHelper = require("../Utils/Response.Helper");

class ClusterManagementController {
	#message = null;
	#service = null;

	constructor(message) {
		this.#message = message;
		this.#service = new ClusterManagementService(message);
	}

	async handleRequest() {
		console.log(`[ClusterManagementController] Handling action: ${this.#message.Action}`);
		try {
			switch (this.#message.Action) {
				case ClusterActions.UPDATE_CLUSTER_CONFIG:
					return await this.#service.updateClusterConfig();
				case ClusterActions.GET_CLUSTER_UNL:
					return await this.#service.getClusterUnl();
				case ClusterActions.GET_CONTRACT_VERSION:
					return await this.#service.getContractVersion();
				case ClusterActions.UPDATE_CLUSTER_DETAILS:
					return await this.#service.updateClusterDetails();
				default:
					throw new ResponseHelper.ContractError(
						ResponseCodes.BAD_REQUEST,
						`Invalid Cluster action: ${this.#message.Action}`,
					);
			}
		} catch (error) {
			console.error("[ClusterManagementController] Error:", error.message || error);
			return ResponseHelper.fromError(error);
		}
	}
}

module.exports = { ClusterManagementController };
