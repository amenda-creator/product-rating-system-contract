const HotPocket = require("hotpocket-js-client");

const DEFAULT_URL = process.env.CONTRACT_URL || "wss://localhost:8081";

function decodeOutput(output) {
	if (output === null || output === undefined) return output;
	if (typeof output === "string") {
		try {
			return JSON.parse(output);
		} catch (e) {
			return output;
		}
	}
	if (Buffer.isBuffer(output) || output instanceof Uint8Array) {
		const text = Buffer.from(output).toString("utf8");
		try {
			return JSON.parse(text);
		} catch (e) {
			return text;
		}
	}
	return output;
}

/**
 * Authenticated HotPocket test client (fresh Ed25519 key pair, or the given private key).
 */
class TestClient {
	constructor(url = DEFAULT_URL, privateKeyHex = null) {
		this.url = url;
		this.privateKeyHex = privateKeyHex;
		this.client = null;
		this.keys = null;
		this.pending = new Map();
		this.counter = 0;
	}

	async connect() {
		this.keys = this.privateKeyHex ? await HotPocket.generateKeys(this.privateKeyHex) : await HotPocket.generateKeys();
		this.client = await HotPocket.createClient([this.url], this.keys, {
			protocol: HotPocket.protocols.json,
		});

		this.client.on(HotPocket.events.contractOutput, r => {
			for (const raw of r.outputs) {
				const out = decodeOutput(raw);
				if (out && out.promiseId && this.pending.has(out.promiseId)) {
					const entry = this.pending.get(out.promiseId);
					this.pending.delete(out.promiseId);
					clearTimeout(entry.timer);
					entry.resolve(out);
				}
			}
		});

		if (!(await this.client.connect())) {
			throw new Error(`Could not connect to ${this.url}`);
		}
		return this;
	}

	get publicKeyHex() {
		return Buffer.from(this.keys.publicKey).toString("hex");
	}

	/** Submits a contract input (consensus write) and resolves with the matching output. */
	submit(service, action, data = {}, timeoutMs = 30000) {
		const promiseId = `t${Date.now().toString(36)}${(this.counter++).toString(36)}${Math.random()
			.toString(36)
			.slice(2, 8)}`;
		const payload = Buffer.from(
			JSON.stringify({ Service: service, Action: action, Data: data, promiseId }),
		);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(promiseId);
				reject(new Error(`Timed out waiting for ${service}.${action}`));
			}, timeoutMs);
			this.pending.set(promiseId, { resolve, reject, timer });

			this.client
				.submitContractInput(payload)
				.then(input => {
					if (input && input.submissionStatus) {
						input.submissionStatus.then(s => {
							if (s.status !== "accepted") {
								clearTimeout(timer);
								this.pending.delete(promiseId);
								reject(new Error(`Input rejected: ${s.reason}`));
							}
						});
					}
				})
				.catch(err => {
					clearTimeout(timer);
					this.pending.delete(promiseId);
					reject(err);
				});
		});
	}

	/** Sends a read-only request (not part of consensus). */
	async read(service, action, data = {}) {
		const out = await this.client.submitContractReadRequest(
			Buffer.from(JSON.stringify({ Service: service, Action: action, Data: data })),
		);
		return decodeOutput(out);
	}

	async close() {
		if (this.client) await this.client.close();
	}
}

/* --------------------------------- assertions --------------------------------- */

class AssertionError extends Error {}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new AssertionError(
			`${message || "assertEqual"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
}

function assertTrue(condition, message) {
	if (!condition) throw new AssertionError(message || "assertTrue failed");
}

function assertSuccessResponse(response, message) {
	if (!response || response.error || response.success === undefined) {
		throw new AssertionError(
			`${message || "Expected success response"}: ${JSON.stringify(response)}`,
		);
	}
	return response.success;
}

function assertErrorResponse(response, expectedMessagePart, message) {
	if (!response || !response.error) {
		throw new AssertionError(
			`${message || "Expected error response"}: ${JSON.stringify(response)}`,
		);
	}
	const text = String(response.error.message || response.error);
	if (expectedMessagePart && !text.includes(expectedMessagePart)) {
		throw new AssertionError(
			`${message || "Unexpected error message"}: expected to contain "${expectedMessagePart}", got "${text}"`,
		);
	}
	return response.error;
}

/* --------------------------------- test suite --------------------------------- */

class TestSuite {
	constructor(name) {
		this.name = name;
		this.tests = [];
	}

	test(name, fn) {
		this.tests.push({ name, fn });
	}

	async run() {
		let passed = 0;
		let failed = 0;
		console.log(`\n=== ${this.name} ===`);
		for (const t of this.tests) {
			try {
				await t.fn();
				passed++;
				console.log(`  PASS  ${t.name}`);
			} catch (error) {
				failed++;
				console.log(`  FAIL  ${t.name}\n        ${error.message}`);
			}
		}
		return { passed, failed };
	}
}

module.exports = {
	TestClient,
	TestSuite,
	decodeOutput,
	assertEqual,
	assertTrue,
	assertSuccessResponse,
	assertErrorResponse,
};
