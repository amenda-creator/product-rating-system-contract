// Contract upgrade CLI.
// Run as:
//   node index.js <contractUrl> <zipFilePath> <privateKey> <version> <description>
//
//   contractUrl  e.g. wss://localhost:8081
//   zipFilePath  zip of the new contract build (the contents of dist/)
//   privateKey   maintainer Ed25519 private key hex (HotPocket format "ed" + 128 hex, or raw 128 hex)
//   version      integer, must be greater than the deployed version (e.g. 2)
//   description  free text
//
// The public key printed on start-up must equal MAINTAINER_PUBKEY in the contract's .env.

const fs = require("fs");
const path = require("path");
const ContractService = require("./contract-service");

function normalizePrivateKey(hex) {
	const value = String(hex || "").trim().toLowerCase();
	if (/^ed[0-9a-f]{128}$/.test(value)) return value;
	if (/^[0-9a-f]{128}$/.test(value)) return `ed${value}`;
	throw new Error("privateKey must be an Ed25519 private key hex (128 hex chars, optionally prefixed with 'ed').");
}

async function clientApp(contractUrl, filepath, privateKey, version, description = "") {
	if (!contractUrl || !filepath || !privateKey || !version) {
		console.log("Usage: node index.js <contractUrl> <zipFilePath> <privateKey> <version> <description>");
		process.exit(1);
	}
	if (!/^\d+$/.test(String(version))) {
		throw new Error("version must be a positive integer (e.g. 2).");
	}
	const versionNumber = parseInt(version, 10);
	if (versionNumber < 1) throw new Error("version must be a positive integer (e.g. 2).");

	const fileContent = fs.readFileSync(filepath);
	const fileName = path.basename(filepath);
	const sizeKB = Math.round(fileContent.length / 1024);

	const contractService = new ContractService([contractUrl], normalizePrivateKey(privateKey));
	if (!(await contractService.init())) {
		throw new Error(`Could not connect to ${contractUrl}`);
	}
	console.log(`Maintainer public key: ${contractService.getPublicKeyHex()}`);

	const zipSignatureHex = contractService.signDetachedHex(fileContent);

	const submitData = {
		Service: "Upgrade",
		Action: "UpgradeContract",
		Data: {
			zipBase64: fileContent.toString("base64"),
			zipSignatureHex,
			version: versionNumber,
			description,
		},
	};

	console.log(`Uploading the file ${fileName} ${sizeKB}KB as version ${versionNumber}`);

	try {
		const result = await contractService.submitInputToContract(submitData);
		console.log("Contract update submission successful.", result);
	} catch (reason) {
		console.log("Contract update submission failed.", reason);
		process.exitCode = 1;
	} finally {
		await contractService.close();
		process.exit();
	}
}

clientApp(process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6] || "").catch(
	error => {
		console.error(error.message || error);
		process.exit(1);
	},
);
