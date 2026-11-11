const { TestSuite, assertEqual, assertTrue, assertSuccessResponse, assertErrorResponse } = require("../test-utils");

module.exports = {
	name: "Product",
	async run({ clientA, admin, state }) {
		const suite = new TestSuite("Product");

		suite.test("ListProducts returns a paginated list", async () => {
			const res = await clientA.read("Product", "ListProducts", { limit: 5 });
			const success = assertSuccessResponse(res, "ListProducts");
			assertTrue(Array.isArray(success.items), "items array");
			assertEqual(success.limit, 5, "limit");
			assertTrue(success.items.length <= 5, "page size respected");
			if (success.items.length > 0) state.anyProductId = success.items[0].id;
		});

		suite.test("ListProducts clamps limit to 50", async () => {
			const res = await clientA.read("Product", "ListProducts", { limit: 500 });
			assertEqual(assertSuccessResponse(res).limit, 50, "limit");
		});

		suite.test("GetCategories returns name/count pairs", async () => {
			const success = assertSuccessResponse(await clientA.read("Product", "GetCategories", {}));
			assertTrue(Array.isArray(success), "array");
		});

		suite.test("GetProduct with a malformed id returns 404", async () => {
			assertEqual(assertErrorResponse(await clientA.read("Product", "GetProduct", { id: "abc" })).code, 404, "code");
		});

		suite.test("GetProduct with an unknown id returns 404", async () => {
			const res = await clientA.read("Product", "GetProduct", { id: 99999999 });
			assertEqual(assertErrorResponse(res, "Product not found").code, 404, "code");
		});

		suite.test("CreateProduct by a non-admin returns 403", async () => {
			const res = await clientA.submit("Product", "CreateProduct", { name: "Nope", category: "Test", price: 1 });
			assertEqual(assertErrorResponse(res, "Admin access required").code, 403, "code");
		});

		if (admin) {
			suite.test("Register the admin profile if missing", async () => {
				const me = await admin.read("User", "GetMe", {});
				if (me.error) assertSuccessResponse(await admin.submit("User", "Register", { name: "Admin" }), "Register admin");
			});

			suite.test("CreateProduct validates input", async () => {
				const res = await admin.submit("Product", "CreateProduct", { name: "x", category: "", price: -1, imageUrl: "ftp://x" });
				const err = assertErrorResponse(res, "Validation failed");
				assertTrue(err.details.name && err.details.category && err.details.price && err.details.imageUrl, "all fields reported");
			});

			suite.test("CreateProduct creates a product", async () => {
				const res = await admin.submit("Product", "CreateProduct", {
					name: "Test Kettle",
					description: "Integration test product",
					category: "Test Category",
					price: 25.5,
					imageUrl: "https://example.com/kettle.png",
				});
				const success = assertSuccessResponse(res, "CreateProduct");
				assertEqual(success.price, 25.5, "price");
				assertEqual(success.rating.count, 0, "no reviews");
				state.productId = success.id;
			});

			suite.test("GetProduct returns the distribution", async () => {
				const success = assertSuccessResponse(await clientA.read("Product", "GetProduct", { id: state.productId }));
				assertEqual(success.rating.distribution["5"], 0, "distribution");
			});

			suite.test("UpdateProduct applies a partial update", async () => {
				const res = await admin.submit("Product", "UpdateProduct", { id: state.productId, price: 30 });
				const success = assertSuccessResponse(res, "UpdateProduct");
				assertEqual(success.price, 30, "price");
				assertEqual(success.name, "Test Kettle", "name unchanged");
			});

			suite.test("ListProducts filters by search text and category", async () => {
				const res = await clientA.read("Product", "ListProducts", { q: "kettle", category: "Test Category" });
				const success = assertSuccessResponse(res);
				assertTrue(success.items.some(p => p.id === state.productId), "found");
			});

			suite.test("Create a throwaway product and delete it", async () => {
				const created = assertSuccessResponse(
					await admin.submit("Product", "CreateProduct", { name: "Disposable", category: "Test Category", price: 1 }),
				);
				const del = assertSuccessResponse(await admin.submit("Product", "DeleteProduct", { id: created.id }));
				assertEqual(del.deleted, true, "deleted");
				assertEqual(assertErrorResponse(await clientA.read("Product", "GetProduct", { id: created.id })).code, 404, "gone");
			});
		}

		return suite.run();
	},
};
