/**
 * Local development utility: removes the ratings database and any staged upgrade
 * artifacts so the contract starts from a clean state on the next run.
 *
 * Usage: node cleanup.js [contractDirectory]
 * (defaults to the current working directory)
 *
 * Never run this against a live cluster node - it deletes all users, products,
 * reviews and helpful votes.
 */
const fs = require("fs");
const path = require("path");

const targetDir = path.resolve(process.argv[2] || process.cwd());
const files = ["ratings.db", "ratings.db-journal", "ratings.db-wal", "ratings.db-shm", "newContractData.zip", "post_exec.sh"];

let removed = 0;
for (const file of files) {
	const fullPath = path.join(targetDir, file);
	try {
		if (fs.existsSync(fullPath)) {
			fs.unlinkSync(fullPath);
			removed++;
			console.log(`Removed ${fullPath}`);
		}
	} catch (error) {
		console.error(`Failed to remove ${fullPath}: ${error.message}`);
		process.exitCode = 1;
	}
}

console.log(removed > 0 ? `Cleanup complete (${removed} file(s) removed).` : "Nothing to clean up.");
