const nacl = require("tweetnacl");
const crypto = require("crypto");
const Config = require("../Constants/Config");

function normalizeHex(value) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Converts a HotPocket public key hex ("ed" + 64 hex chars) or a raw 64-char hex
 * Ed25519 key into the 32-byte key expected by tweetnacl.
 */
function toRawEd25519PublicKey(pubKeyHex) {
	let hex = normalizeHex(pubKeyHex);
	if (hex.length === 66 && hex.startsWith("ed")) hex = hex.slice(2);
	if (!/^[0-9a-f]{64}$/.test(hex)) {
		throw new Error("Invalid Ed25519 public key hex.");
	}
	return new Uint8Array(Buffer.from(hex, "hex"));
}

/**
 * Verifies an Ed25519 detached signature (hex) over the given message buffer.
 * Uses tweetnacl only (never crypto.verify with PEM keys).
 */
function verifyDetachedSignature(message, signatureHex, pubKeyHex) {
	const sig = normalizeHex(signatureHex);
	if (!/^[0-9a-f]{128}$/.test(sig)) return false;
	return nacl.sign.detached.verify(
		new Uint8Array(message),
		new Uint8Array(Buffer.from(sig, "hex")),
		toRawEd25519PublicKey(pubKeyHex),
	);
}

/**
 * True only when the given user public key equals the configured MAINTAINER_PUBKEY
 * (case-insensitive). An empty/missing MAINTAINER_PUBKEY never matches.
 */
function isMaintainer(userPubKeyHex) {
	if (!Config.MAINTAINER_PUBKEY || !userPubKeyHex) return false;
	const expected = Config.MAINTAINER_PUBKEY.toLowerCase();
	return String(userPubKeyHex).toLowerCase() === expected;
}

function sha256Hex(data) {
	return crypto.createHash("sha256").update(data).digest("hex");
}

module.exports = {
	normalizeHex,
	toRawEd25519PublicKey,
	verifyDetachedSignature,
	isMaintainer,
	sha256Hex,
};
