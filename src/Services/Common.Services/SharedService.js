const EventEmitter = require("events");

/**
 * Holds the HotPocket context for the current round and deterministic helpers.
 * All time values come from ctx.timestamp (consensus time), never the wall clock,
 * so every node produces identical state.
 */
class SharedService {
	static context = null;
	static nplEventEmitter = new EventEmitter();

	static getContextTimestamp() {
		if (!this.context || this.context.timestamp === undefined || this.context.timestamp === null) {
			throw new Error("HotPocket context timestamp is not available.");
		}
		return Number(this.context.timestamp);
	}

	/**
	 * Consensus time in unix seconds - the equivalent of Solidity's block.timestamp.
	 */
	static nowSeconds() {
		return Math.floor(this.getContextTimestamp() / 1000);
	}

	/**
	 * Convert unix milliseconds to ISO8601 (eg: '2023-10-04T05:59:42.384Z').
	 */
	static getUtcISOStringFromUnixTimestamp(milliseconds) {
		return new Date(milliseconds).toISOString();
	}

	/**
	 * Current consensus timestamp in ISO format.
	 */
	static getCurrentTimestamp() {
		return this.getUtcISOStringFromUnixTimestamp(this.getContextTimestamp());
	}

	/**
	 * Deterministic concurrency key derived from the consensus timestamp: "0x" + 16 hex chars.
	 */
	static generateConcurrencyKey() {
		const ts = Math.floor(this.getContextTimestamp());
		const hex = ts.toString(16).toUpperCase().padStart(16, "0").slice(-16);
		return `0x${hex}`;
	}
}

module.exports = { SharedService };
