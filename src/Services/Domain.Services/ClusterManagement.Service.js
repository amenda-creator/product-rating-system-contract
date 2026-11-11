const fsp = require("fs/promises");
const { exec } = require("child_process");
const { promisify } = require("util");

const { SharedService } = require("../Common.Services/SharedService");
const { SqliteDatabase } = require("../Common.Services/dbHandler");
const { Tables, ResponseCodes } = require("../../Constants/constants");
const Config = require("../../Constants/Config");
const ResponseHelper = require("../../Utils/Response.Helper");

const { ContractError } = ResponseHelper;
const execAsync = promisify(exec);

/**
 * Manages the HotPocket cluster: UNL config, peer mesh updates and contract version lookup.
 */
class ClusterManagementService {
	#message = null;
	#dbContext = null;

	constructor(message) {
		this.#message = message;
		this.#dbContext = new SqliteDatabase(Config.DB_PATH);
	}

	get context() {
		return SharedService.context;
	}

	get #data() {
		const data = this.#message.Data;
		return data && typeof data === "object" ? data : {};
	}

	#requireWriteContext() {
		if (!this.context) {
			throw new ContractError(ResponseCodes.INTERNAL_SERVER_ERROR, "Cluster context is not available.");
		}
		if (this.context.readonly) {
			throw new ContractError(
				ResponseCodes.BAD_REQUEST,
				"This cluster action must be submitted as a contract input, not a read request.",
			);
		}
	}

	async updateClusterConfig() {
		this.#requireWriteContext();
		const data = this.#data;
		console.log("[ClusterManagement] Updating cluster configuration...", data);

		if (typeof data.publicKey !== "string" || !data.publicKey) {
			throw new ContractError(ResponseCodes.BAD_REQUEST, "publicKey is required.");
		}

		const hpConfig = await this.context.getConfig();
		let unl = Array.isArray(hpConfig.unl) ? hpConfig.unl.slice() : [];

		if (data.action === "add") {
			if (unl.includes(data.publicKey)) {
				throw new ContractError(ResponseCodes.CONFLICT, "UNL already exists in the cluster configuration.");
			}
			unl.push(data.publicKey);
		} else if (data.action === "remove") {
			if (!unl.includes(data.publicKey)) {
				throw new ContractError(ResponseCodes.NOT_FOUND, "UNL does not exist in the cluster configuration.");
			}
			unl = unl.filter(key => key !== data.publicKey);
		} else {
			throw new ContractError(ResponseCodes.BAD_REQUEST, "Invalid action. Use 'add' or 'remove'.");
		}

		hpConfig.unl = unl;
		const result = await this.context.updateConfig(hpConfig);
		return ResponseHelper.success(result === undefined ? { unl } : result);
	}

	async getClusterUnl() {
		if (!this.context) {
			throw new ContractError(ResponseCodes.INTERNAL_SERVER_ERROR, "Cluster context is not available.");
		}
		const hpConfig = await this.context.getConfig();
		return ResponseHelper.success({ unl: hpConfig.unl });
	}

	async getContractVersion() {
		this.#dbContext.open();
		try {
			const rows = await this.#dbContext.runSelectQuery(
				`SELECT Version FROM ${Tables.CONTRACTVERSION} ORDER BY Id DESC LIMIT 1`,
			);
			if (rows.length === 0) {
				throw new ContractError(ResponseCodes.NOT_FOUND, "Contract version not found.");
			}
			console.log(`[ClusterManagement] Contract version: ${rows[0].Version}`);
			return ResponseHelper.success({ version: rows[0].Version });
		} finally {
			this.#dbContext.close();
		}
	}

	async updateClusterDetails() {
		this.#requireWriteContext();
		const data = this.#data;
		console.log("[ClusterManagement] Updating cluster details...", data);

		const hpCfgPath = "../../../../cfg/hp.cfg";
		const readConfigCommand =
			process.platform === "win32" ? `type "${hpCfgPath}"` : `cat "${hpCfgPath}"`;
		const { stdout, stderr } = await execAsync(readConfigCommand);
		if (stderr) console.warn("[ClusterManagement] hp.cfg read warning:", stderr);

		const hpCfgJson = JSON.parse(stdout);
		const nodePublicKey = hpCfgJson && hpCfgJson.node ? hpCfgJson.node.public_key : undefined;

		const clusterDetails = data.clusterDetails;
		if (!Array.isArray(clusterDetails) || clusterDetails.length === 0) {
			throw new ContractError(
				ResponseCodes.BAD_REQUEST,
				"clusterDetails is required and must be a non-empty array.",
			);
		}

		const peers = [
			...new Set(
				clusterDetails
					.map(item => {
						const domain = item && item.domain;
						const peerPort = item && item.peer_port;
						const clusterPubKey = item && item.pubkey;
						if (!domain || !peerPort) return null;
						if (nodePublicKey && clusterPubKey === nodePublicKey) return null;
						return `${domain}:${peerPort}`;
					})
					.filter(Boolean),
			),
		];

		if (peers.length === 0) {
			throw new ContractError(
				ResponseCodes.BAD_REQUEST,
				"No valid peers could be extracted from clusterDetails.",
			);
		}

		hpCfgJson.mesh = hpCfgJson.mesh || {};
		hpCfgJson.mesh.known_peers = peers;
		hpCfgJson.mesh.peer_discovery = { enabled: false };

		await fsp.writeFile(hpCfgPath, `${JSON.stringify(hpCfgJson, null, 2)}\n`, "utf8");
		console.log("[ClusterManagement] hp.cfg updated with peers:", peers);
		return ResponseHelper.success({ peers });
	}
}

module.exports = { ClusterManagementService };
