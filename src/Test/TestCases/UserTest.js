const { TestSuite, assertEqual, assertSuccessResponse, assertErrorResponse } = require("../test-utils");

module.exports = {
	name: "User",
	async run({ clientA, clientB, admin }) {
		const suite = new TestSuite("User");

		suite.test("GetMe before registering returns 401", async () => {
			const res = await clientA.read("User", "GetMe", {});
			assertEqual(assertErrorResponse(res).code, 401, "code");
		});

		suite.test("Register rejects a too-short name", async () => {
			const res = await clientA.submit("User", "Register", { name: "A" });
			const err = assertErrorResponse(res, "Validation failed");
			assertEqual(err.code, 400, "code");
			assertEqual(typeof err.details.name, "string", "details.name");
		});

		suite.test("Register creates a profile for the caller's key", async () => {
			const res = await clientA.submit("User", "Register", { name: "Alice Tester" });
			const success = assertSuccessResponse(res, "Register");
			assertEqual(success.user.name, "Alice Tester", "name");
			assertEqual(success.user.role, "user", "role");
			assertEqual(success.user.publicKey, clientA.publicKeyHex.toLowerCase(), "publicKey");
		});

		suite.test("Register twice with the same key returns 409", async () => {
			const res = await clientA.submit("User", "Register", { name: "Alice Again" });
			assertEqual(assertErrorResponse(res, "already exists").code, 409, "code");
		});

		suite.test("Register client B", async () => {
			assertSuccessResponse(await clientB.submit("User", "Register", { name: "Bob Tester" }), "Register B");
		});

		suite.test("GetMe returns the profile (read request)", async () => {
			const res = await clientA.read("User", "GetMe", {});
			assertEqual(assertSuccessResponse(res).name, "Alice Tester", "name");
		});

		suite.test("UpdateProfile changes the display name", async () => {
			const res = await clientA.submit("User", "UpdateProfile", { name: "Alice T." });
			assertEqual(assertSuccessResponse(res).name, "Alice T.", "name");
		});

		suite.test("Register as a read request is rejected", async () => {
			const res = await clientB.read("User", "Register", { name: "Read only" });
			assertErrorResponse(res, "ReadOnlyRequest");
		});

		suite.test("GetUsers requires admin", async () => {
			const res = await clientA.read("User", "GetUsers", {});
			assertEqual(assertErrorResponse(res, "Admin access required").code, 403, "code");
		});

		if (admin) {
			suite.test("Admin can list users", async () => {
				const res = await admin.read("User", "GetUsers", { role: "admin" });
				const success = assertSuccessResponse(res, "GetUsers");
				assertEqual(success.items.length > 0, true, "has admins");
			});
		}

		return suite.run();
	},
};
