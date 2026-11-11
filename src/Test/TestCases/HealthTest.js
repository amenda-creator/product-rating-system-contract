const { TestSuite, assertEqual, assertSuccessResponse } = require("../test-utils");

module.exports = {
	name: "Health",
	async run({ clientA }) {
		const suite = new TestSuite("Health");

		suite.test("HealthCheck returns healthy and echoes promiseId", async () => {
			const res = await clientA.submit("Health", "HealthCheck", {});
			const success = assertSuccessResponse(res, "HealthCheck");
			assertEqual(success.status, "healthy", "status");
			assertEqual(typeof res.promiseId, "string", "promiseId echoed");
		});

		return suite.run();
	},
};
