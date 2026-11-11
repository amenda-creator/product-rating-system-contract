const { UpgradeService } = require("../Services/Common.Services/Upgrade.Service");
const { UpgradeActions, ResponseCodes } = require("../Constants/constants");
const Config = require("../Constants/Config");
const CryptoHelper = require("../Utils/Crypto.Helper");
const ResponseHelper = require("../Utils/Response.Helper");

const { ContractError } = ResponseHelper;

/**
 * Handshake authentication: the connected user's public key must equal MAINTAINER_PUBKEY.
 */
function isMaintainer(userPubKeyHex) {
	if (!Config.MAINTAINER_PUBKEY || !userPubKeyHex) return false;
	const expected = Config.MAINTAINER_PUBKEY.toLowerCase();
	return String(userPubKeyHex).toLowerCase() === expected;
}

/**
 * Dual authentication for contract upgrades:
 *  1. handshake: user.publicKey === MAINTAINER_PUBKEY
 *  2. content: Ed25519 detached signature of the zip verified against MAINTAINER_PUBKEY
 * Only when both pass is the request handed to Upgrade.Service.
 */
class UpgradeController {
	#message = null;
	#service = null;

	constructor(message) {
		this.#message = message;
		this.#service = new UpgradeService(message);
	}

	async handleRequest() {
		try {
			if (this.#message.Action !== UpgradeActions.UPGRADE_CONTRACT) {
				throw new ContractError(
					ResponseCodes.BAD_REQUEST,
					`Invalid Upgrade action: ${this.#message.Action}`,
				);
			}
			if (this.#message.isReadOnly) {
				throw new ContractError(
					ResponseCodes.BAD_REQUEST,
					"UpgradeContract must be submitted as a contract input, not a read request.",
				);
			}
			if (!Config.MAINTAINER_PUBKEY) {
				throw new ContractError(
					ResponseCodes.INTERNAL_SERVER_ERROR,
					"MAINTAINER_PUBKEY is not configured; contract upgrades are disabled.",
				);
			}
			if (!isMaintainer(this.#message.userPubKey)) {
				throw new ContractError(
					ResponseCodes.UNAUTHORIZED,
					"Unauthorized: only the configured maintainer can upgrade this contract.",
				);
			}

			const data = this.#message.Data || {};
			if (typeof data.zipBase64 !== "string" || data.zipBase64.length === 0) {
				throw new ContractError(ResponseCodes.BAD_REQUEST, "zipBase64 is required.");
			}
			if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data.zipBase64)) {
				throw new ContractError(ResponseCodes.BAD_REQUEST, "zipBase64 is not valid base64.");
			}
			const zipBuffer = Buffer.from(data.zipBase64, "base64");
			if (zipBuffer.length === 0) {
				throw new ContractError(ResponseCodes.BAD_REQUEST, "The uploaded zip is empty.");
			}
			if (typeof data.zipSignatureHex !== "string" || !/^[0-9a-fA-F]{128}$/.test(data.zipSignatureHex)) {
				throw new ContractError(
					ResponseCodes.BAD_REQUEST,
					"zipSignatureHex must be a 128-character hex Ed25519 detached signature.",
				);
			}

			let signatureValid = false;
			try {
				signatureValid = CryptoHelper.verifyDetachedSignature(
					zipBuffer,
					data.zipSignatureHex,
					Config.MAINTAINER_PUBKEY,
				);
			} catch (verifyError) {
				console.error("[UpgradeController] Signature verification error:", verifyError.message);
				signatureValid = false;
			}
			if (!signatureValid) {
				throw new ContractError(
					ResponseCodes.UNAUTHORIZED,
					"Unauthorized: zip signature verification failed.",
				);
			}

			const description =
				typeof data.description === "string" ? data.description.slice(0, 500) : "";
			console.log(
				`[UpgradeController] Verified upgrade package (sha256 ${CryptoHelper.sha256Hex(zipBuffer)}).`,
			);

			return await this.#service.upgradeContract({
				zipBuffer,
				version: data.version,
				description,
			});
		} catch (error) {
			console.error("[UpgradeController] Upgrade request rejected:", error.message || error);
			return ResponseHelper.fromError(error);
		}
	}
}

module.exports = { UpgradeController, isMaintainer };
