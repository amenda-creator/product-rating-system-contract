const { TestSuite, assertEqual, assertTrue, assertSuccessResponse, assertErrorResponse } = require("../test-utils");

module.exports = {
	name: "Review",
	async run({ clientA, clientB, admin, state }) {
		const suite = new TestSuite("Review");
		const productId = () => state.productId || state.anyProductId;

		suite.test("A product is available to review", async () => {
			assertTrue(Number.isInteger(productId()), "productId available (seeded or created)");
		});

		suite.test("CreateReview rejects ratings outside 1-5", async () => {
			for (const rating of [0, 6, 3.5, "5"]) {
				const res = await clientA.submit("Review", "CreateReview", { productId: productId(), rating });
				assertEqual(assertErrorResponse(res, "Validation failed").code, 400, `rating ${rating}`);
			}
		});

		suite.test("CreateReview creates the caller's review", async () => {
			const res = await clientA.submit("Review", "CreateReview", {
				productId: productId(),
				rating: 4,
				title: "Pretty good",
				body: "Works as described.",
			});
			const success = assertSuccessResponse(res, "CreateReview");
			assertEqual(success.isMine, true, "isMine");
			state.reviewId = success.id;
		});

		suite.test("A second review of the same product returns 409", async () => {
			const res = await clientA.submit("Review", "CreateReview", { productId: productId(), rating: 5 });
			assertEqual(assertErrorResponse(res, "already reviewed").code, 409, "code");
		});

		suite.test("ListReviews includes the caller's review as mine", async () => {
			const res = await clientA.read("Review", "ListReviews", { productId: productId(), sort: "newest" });
			const success = assertSuccessResponse(res, "ListReviews");
			assertEqual(success.mine.id, state.reviewId, "mine");
		});

		suite.test("ListReviews filters by star rating", async () => {
			const success = assertSuccessResponse(await clientB.read("Review", "ListReviews", { productId: productId(), rating: 4 }));
			assertTrue(success.items.every(r => r.rating === 4), "only 4-star reviews");
		});

		suite.test("Only the author can edit", async () => {
			const res = await clientB.submit("Review", "UpdateReview", { id: state.reviewId, rating: 1 });
			assertEqual(assertErrorResponse(res, "only edit your own").code, 403, "code");
		});

		suite.test("Author edits the review", async () => {
			const res = await clientA.submit("Review", "UpdateReview", { id: state.reviewId, rating: 5, title: "Great" });
			const success = assertSuccessResponse(res, "UpdateReview");
			assertEqual(success.rating, 5, "rating");
			assertTrue(!!success.updatedAt, "updatedAt set");
		});

		suite.test("Author cannot vote on their own review", async () => {
			const res = await clientA.submit("Review", "VoteHelpful", { id: state.reviewId });
			assertEqual(assertErrorResponse(res, "cannot vote").code, 400, "code");
		});

		suite.test("Another user votes helpful once", async () => {
			const first = assertSuccessResponse(await clientB.submit("Review", "VoteHelpful", { id: state.reviewId }));
			const second = assertSuccessResponse(await clientB.submit("Review", "VoteHelpful", { id: state.reviewId }));
			assertEqual(first.helpfulCount, second.helpfulCount, "idempotent");
			assertEqual(second.votedHelpful, true, "votedHelpful");
		});

		suite.test("UnvoteHelpful removes the vote", async () => {
			const success = assertSuccessResponse(await clientB.submit("Review", "UnvoteHelpful", { id: state.reviewId }));
			assertEqual(success.votedHelpful, false, "votedHelpful");
		});

		suite.test("Another user cannot delete the review", async () => {
			const res = await clientB.submit("Review", "DeleteReview", { id: state.reviewId });
			assertEqual(assertErrorResponse(res, "only delete your own").code, 403, "code");
		});

		if (admin) {
			suite.test("Admin can moderate (delete) any review", async () => {
				const res = await admin.submit("Review", "DeleteReview", { id: state.reviewId });
				assertEqual(assertSuccessResponse(res).deleted, true, "deleted");
			});
		} else {
			suite.test("Author deletes their own review", async () => {
				const res = await clientA.submit("Review", "DeleteReview", { id: state.reviewId });
				assertEqual(assertSuccessResponse(res).deleted, true, "deleted");
			});
		}

		suite.test("Deleted review returns 404", async () => {
			const res = await clientA.read("Review", "GetReview", { id: state.reviewId });
			assertEqual(assertErrorResponse(res, "Review not found").code, 404, "code");
		});

		return suite.run();
	},
};
