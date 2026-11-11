const HotPocket = require("hotpocket-js-client");
const nacl = require("tweetnacl");
const crypto = require("crypto");

function decodeOutput(output) {
	if (typeof output === "string") return JSON.parse(output);
	if (Buffer.isBuffer(output) || output instanceof Uint8Array) {
		return JSON.parse(Buffer.from(output).toString("utf8"));
	}
	return output;
}

/**
 * WebSocket connection to the contract with HotPocket handshake authentication
 * (using the maintainer's key pair) and promise-based responses keyed by promiseId.
 */
class ContractService {
	constructor(servers, privateKeyHex) {
		this.servers = servers;
		this.privateKeyHex = privateKeyHex;
		this.userKeyPair = null;
		this.client = null;
		this.isConnectionSucceeded = false;
		this.promiseMap = new Map();
	}

	async init() {
		if (this.userKeyPair == null) {
			this.userKeyPair = await HotPocket.generateKeys(this.privateKeyHex);
		}
		if (this.client == null) {
			this.client = await HotPocket.createClient(this.servers, this.userKeyPair, {
				protocol: HotPocket.protocols.json,
			});
		}

		this.client.on(HotPocket.events.disconnect, () => {
			console.log("Disconnected");
			this.isConnectionSucceeded = false;
		});

		this.client.on(HotPocket.events.connectionChange, (server, action) => {
			console.log(`${server} ${action}`);
		});

		this.client.on(HotPocket.events.contractOutput, r => {
			r.outputs.forEach(o => {
				let output;
				try {
					output = decodeOutput(o);
				} catch (e) {
					console.error("Could not decode contract output:", e.message);
					return;
				}
				const pId = output && output.promiseId;
				const entry = this.promiseMap.get(pId);
				if (!entry) return;
				if (output.error) entry.rejecter(output.error);
				else entry.resolver(output.success);
				this.promiseMap.delete(pId);
			});
		});

		if (!this.isConnectionSucceeded) {
			if (!(await this.client.connect())) {
				console.log("Connection failed.");
				return false;
			}
			console.log("HotPocket Connected.");
			this.isConnectionSucceeded = true;
		}
		return true;
	}

	/** HotPocket-format public key hex ("ed" + 64 hex) of the connected maintainer. */
	getPublicKeyHex() {
		return Buffer.from(this.userKeyPair.publicKey).toString("hex");
	}

	/**
	 * Ed25519 detached signature (hex) of the given buffer using the maintainer's key.
	 * HotPocket keys carry a 1-byte 0xED prefix which is stripped for tweetnacl.
	 */
	signDetachedHex(buffer) {
		let secretKey = new Uint8Array(this.userKeyPair.privateKey);
		if (secretKey.length === 65) secretKey = secretKey.slice(1);
		if (secretKey.length !== 64) {
			throw new Error("Unexpected Ed25519 private key length.");
		}
		const signature = nacl.sign.detached(new Uint8Array(buffer), secretKey);
		return Buffer.from(signature).toString("hex");
	}

	/**
	 * Submits a contract input (submitContractInput, not submitTransaction) and resolves
	 * with the contract's "success" payload for the same promiseId.
	 */
	submitInputToContract(inp, timeoutMs = 120000) {
		const promiseId = crypto.randomBytes(10).toString("hex");
		const payload = Buffer.from(JSON.stringify(Object.assign({ promiseId }, inp)));

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.promiseMap.delete(promiseId);
				reject(new Error("Timed out waiting for the contract response."));
			}, timeoutMs);

			this.promiseMap.set(promiseId, {
				resolver: value => {
					clearTimeout(timer);
					resolve(value);
				},
				rejecter: reason => {
					clearTimeout(timer);
					reject(reason);
				},
			});

			this.client
				.submitContractInput(payload)
				.then(input => {
					if (input && input.submissionStatus) {
						input.submissionStatus.then(s => {
							if (s.status !== "accepted") {
								clearTimeout(timer);
								this.promiseMap.delete(promiseId);
								reject(new Error(`Ledger_Rejection: ${s.reason}`));
							}
						});
					}
				})
				.catch(err => {
					clearTimeout(timer);
					this.promiseMap.delete(promiseId);
					reject(err);
				});
		});
	}

	async close() {
		if (this.client) await this.client.close();
	}
}

module.exports = ContractService;
