const { FileService } = require("./FileService");
const { SharedService } = require("./SharedService");
const { SqliteDatabase } = require("./dbHandler");
const { Tables, ResponseCodes } = require("../../Constants/constants");
const Config = require("../../Constants/Config");
const ResponseHelper = require("../../Utils/Response.Helper");

const { ContractError } = ResponseHelper;

function buildPostExecScript(zipFileName) {
	return [
		"#!/bin/bash",
		"",
		'echo "Running post_exec.sh for the product rating system contract upgrade"',
		"",
		"! command -v unzip &>/dev/null && apt-get update && apt-get install --no-install-recommends -y unzip",
		"",
		`zip_file="${zipFileName}"`,
		"",
		"# Unzip the new contract over the current directory, overwriting existing files",
		'unzip -o -d ./ "$zip_file" >>/dev/null',
		"",
		"echo \"Zip file '$zip_file' has been unzipped into the contract directory.\"",
		"",
		"# Delete the zip file",
		'rm "$zip_file" >>/dev/null',
		"",
	].join("\n");
}

class UpgradeService {
	#message = null;
	#dbContext = null;

	constructor(message) {
		this.#message = message;
		this.#dbContext = new SqliteDatabase(Config.DB_PATH);
	}

	/**
	 * Stages a contract upgrade: validates the version (must be strictly greater than the
	 * current one), writes newContractData.zip and post_exec.sh, and records the version.
	 */
	async upgradeContract({ zipBuffer, version, description }) {
		const versionText = String(version === undefined || version === null ? "" : version).trim();
		const incomingVersion = parseInt(versionText, 10);
		if (!Number.isSafeInteger(incomingVersion) || incomingVersion < 1 || versionText !== String(incomingVersion)) {
			throw new ContractError(
				ResponseCodes.BAD_REQUEST,
				"Version must be a positive integer (e.g. 2).",
			);
		}

		this.#dbContext.open();
		try {
			const rows = await this.#dbContext.runSelectQuery(
				`SELECT Version FROM ${Tables.ContractVersion} ORDER BY Id DESC LIMIT 1`,
			);
			const currentVersion = rows.length > 0 ? parseInt(String(rows[0].Version), 10) : 1;

			if (!(incomingVersion > currentVersion)) {
				throw new ContractError(
					ResponseCodes.FORBIDDEN,
					`Upgrade rejected: incoming version ${incomingVersion} must be greater than the current version ${currentVersion}.`,
				);
			}

			FileService.writeFile(Config.NEW_CONTRACT_ZIP, zipBuffer);
			FileService.writeFile(Config.POST_EXEC_SCRIPT, buildPostExecScript(Config.NEW_CONTRACT_ZIP));
			FileService.changeMode(Config.POST_EXEC_SCRIPT, 0o777);
			console.log(`[Upgrade] "${Config.POST_EXEC_SCRIPT}" created for version ${incomingVersion}.`);

			const nowIso = SharedService.getCurrentTimestamp();
			const res = await this.#dbContext.insertValue(Tables.ContractVersion, {
				Version: incomingVersion,
				Description: description || "",
				CreatedOn: nowIso,
				LastUpdatedOn: nowIso,
			});

			return ResponseHelper.success({
				message: "Contract upgrade staged. It is applied by post_exec.sh after this round.",
				previousVersion: currentVersion,
				version: incomingVersion,
				recordId: res.lastId,
			});
		} finally {
			this.#dbContext.close();
		}
	}
}

module.exports = { UpgradeService };
