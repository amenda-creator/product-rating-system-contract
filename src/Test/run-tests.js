const { TestClient } = require("./test-utils");

const testCases = [
	require("./TestCases/HealthTest"),
	require("./TestCases/UserTest"),
	require("./TestCases/ProductTest"),
	require("./TestCases/ReviewTest"),
	require("./TestCases/ClusterManagementTest"),
];

async function main() {
	// clientA and clientB are ordinary reviewers (fresh keys every run).
	const clientA = await new TestClient().connect();
	const clientB = await new TestClient().connect();
	console.log(`Client A: ${clientA.publicKeyHex}`);
	console.log(`Client B: ${clientB.publicKeyHex}`);

	// Optional admin client: the private key matching ADMIN_PUBKEY (or MAINTAINER_PUBKEY).
	let admin = null;
	if (process.env.TEST_ADMIN_PRIVATE_KEY) {
		admin = await new TestClient(undefined, process.env.TEST_ADMIN_PRIVATE_KEY).connect();
		console.log(`Admin:    ${admin.publicKeyHex}`);
	} else {
		console.log("TEST_ADMIN_PRIVATE_KEY not set - admin-only tests will be skipped.");
	}

	const state = {};
	let passed = 0;
	let failed = 0;
	try {
		for (const testCase of testCases) {
			const result = await testCase.run({ clientA, clientB, admin, state });
			passed += result.passed;
			failed += result.failed;
		}
	} finally {
		await clientA.close();
		await clientB.close();
		if (admin) await admin.close();
	}

	console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
	console.error("Test run failed:", error);
	process.exit(1);
});
