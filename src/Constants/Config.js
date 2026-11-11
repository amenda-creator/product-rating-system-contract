const settings = require("../settings.json").settings;
const env = require("../Utils/Environment");

function normalizeKey(value) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const maintainerPubKey = normalizeKey(env.MAINTAINER_PUBKEY);
// First admin (replaces ADMIN_EMAIL / ADMIN_PASSWORD of the Web2 app). Falls back to the maintainer key.
const adminPubKey = normalizeKey(env.ADMIN_PUBKEY) || maintainerPubKey;

// Mirrors the Web2 constants: PRIOR_WEIGHT = 5, global mean fallback 3, page sizes 12/10, max 50.
const ratingDefaults = {
	priorWeight: 5,
	defaultMeanRating: 3,
	productPageSize: 12,
	reviewPageSize: 10,
	maxPageSize: 50,
};

const seedFlag = typeof env.SEED_DEMO_DATA === "string" ? env.SEED_DEMO_DATA.trim().toLowerCase() : "true";

module.exports = Object.freeze({
	DB_PATH: env.DB_PATH || settings.dbPath,
	DB_SCRIPTS_FOLDER: settings.dbScriptsFolderPath,
	NEW_CONTRACT_ZIP: settings.newContractZipFileName,
	POST_EXEC_SCRIPT: settings.postExecutionScriptName,
	MAINTAINER_PUBKEY: maintainerPubKey,
	ADMIN_PUBKEY: adminPubKey,
	SEED_DEMO_DATA: seedFlag !== "false" && seedFlag !== "0" && seedFlag !== "no",
	RATING: Object.freeze(Object.assign({}, ratingDefaults, settings.rating || {})),
});
