const HotPocket = require("hotpocket-nodejs-contract");
const bson = require("bson");
const { Controller } = require("./controller");
const { DBInitializer } = require("./Data.Deploy/initDB");
const { SharedService } = require("./Services/Common.Services/SharedService");
const ResponseHelper = require("./Utils/Response.Helper");
const { ResponseCodes } = require("./Constants/constants");

/**
 * Inputs are JSON (UTF-8). BSON is accepted as a fallback for older clients.
 * Returns null when the input cannot be decoded into an object
 * (the Web2 "Malformed JSON body" case).
 */
function parseInput(buf) {
	const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
	try {
		const parsed = JSON.parse(buffer.toString("utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
	} catch (jsonError) {
		try {
			return bson.deserialize(buffer);
		} catch (bsonError) {
			return null;
		}
	}
}

function comparePubKeys(a, b) {
	const ka = String(a.publicKey || "");
	const kb = String(b.publicKey || "");
	if (ka < kb) return -1;
	if (ka > kb) return 1;
	return 0;
}

const productRatingContract = async ctx => {
	SharedService.context = ctx;
	const isReadOnly = ctx.readonly;
	console.log(`Product rating system contract is running (${isReadOnly ? "read-only" : "consensus"} mode).`);

	if (!isReadOnly) {
		// Route NPL messages by their "type" field.
		ctx.unl.onMessage((node, msg) => {
			try {
				const obj = JSON.parse(msg.toString());
				if (obj && obj.type) {
					SharedService.nplEventEmitter.emit(obj.type, node, msg);
				} else {
					console.error("Received an NPL message without a type.");
				}
			} catch (e) {
				console.error("Received a malformed NPL message.");
			}
		});

		// Schema creation and first-run seeding are writes, so they only run in consensus rounds.
		try {
			await DBInitializer.init();
		} catch (e) {
			console.error("[Startup] Database initialisation failed:", e);
		}
	}

	const controller = new Controller();

	// Deterministic processing order across nodes: users sorted by public key,
	// inputs in the consensus order supplied by HotPocket. Each input is handled
	// to completion (in its own DB transaction) before the next one starts.
	const users = ctx.users.list().slice().sort(comparePubKeys);

	for (const user of users) {
		for (const input of user.inputs) {
			let message = null;
			try {
				const buf = await ctx.users.read(input);
				message = parseInput(buf);
			} catch (e) {
				console.error("[Startup] Failed to read user input:", e);
			}

			if (!message) {
				await controller.sendOutput(
					user,
					ResponseHelper.error(ResponseCodes.BAD_REQUEST, "Malformed JSON body: expected a JSON object."),
				);
				continue;
			}

			await controller.handleRequest(user, message, isReadOnly);
		}
	}
};

const hpc = new HotPocket.Contract();
hpc.init(productRatingContract, HotPocket.clientProtocols.JSON, true);
