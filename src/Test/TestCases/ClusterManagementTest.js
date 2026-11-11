const { TestSuite, assertTrue, assertSuccessResponse, assertErrorResponse } = require("../test-utils");

module.exports = {
	name: "ClusterManagement",
	async run({ clientA }) {
		const suite = new TestSuite("ClusterManagement");

		suite.test("GetContractVersion returns an integer version", async () => {
			const res = await clientA.read("Cluster", "GetContractVersion", {});
			const success = assertSuccessResponse(res, "GetContractVersion");
			assertTrue(Number.isInteger(Number(success.version)), "version is an integer");
		});

		suite.test("GetClusterUnl returns the UNL list", async () => {
			const res = await clientA.submit("Cluster", "GetClusterUnl", {});
			const success = assertSuccessResponse(res, "GetClusterUnl");
			assertTrue(Array.isArray(success.unl), "unl is an array");
		});

		suite.test("Upgrade from a non-maintainer key is rejected", async () => {
			const res = await clientA.submit("Upgrade", "UpgradeContract", {
				zipBase64: Buffer.from("not-a-real-zip").toString("base64"),
				zipSignatureHex: "00".repeat(64),
				version: 2,
				description: "unauthorised attempt",
			});
			assertErrorResponse(res, "Unauthorized");
		});

		return suite.run();
	},
};
