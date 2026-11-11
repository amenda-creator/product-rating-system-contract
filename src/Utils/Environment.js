const fs = require("fs");
const path = require("path");

// Keys that may fall back to process.env when missing from the .env file.
const FALLBACK_KEYS = ["MAINTAINER_PUBKEY", "ADMIN_PUBKEY", "DB_PATH", "SEED_DEMO_DATA"];

function parseEnvFile(content) {
	const env = {};
	const lines = content.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const idx = trimmed.indexOf("=");
		if (idx <= 0) continue;

		const key = trimmed.slice(0, idx).trim();
		let value = trimmed.slice(idx + 1).trim();
		const quoted =
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")));
		if (quoted) value = value.slice(1, -1);

		// Values are kept as strings so hex keys are never mangled by number parsing.
		env[key] = value;
	}
	return env;
}

function loadEnvironment() {
	const env = {};
	const envPath = path.resolve(process.cwd(), ".env");

	try {
		if (fs.existsSync(envPath)) {
			Object.assign(env, parseEnvFile(fs.readFileSync(envPath, "utf8")));
		} else {
			console.warn(`[Environment] No .env file found at ${envPath}.`);
		}
	} catch (error) {
		console.error("[Environment] Failed to read .env file:", error.message);
	}

	for (const key of FALLBACK_KEYS) {
		const missing = env[key] === undefined || env[key] === "";
		if (missing && typeof process.env[key] === "string" && process.env[key] !== "") {
			env[key] = process.env[key];
		}
	}

	return env;
}

module.exports = loadEnvironment();
