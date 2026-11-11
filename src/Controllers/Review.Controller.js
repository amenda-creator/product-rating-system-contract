const { ReviewService } = require("../Services/Domain.Services/Review.Service");
const { ReviewActions, ResponseCodes } = require("../Constants/constants");
const ResponseHelper = require("../Utils/Response.Helper");

class ReviewController {
	#message = null;
	#service = null;

	constructor(message) {
		this.#message = message;
		this.#service = new ReviewService(message);
	}

	async handleRequest() {
		const action = this.#message.Action;
		console.log(`[ReviewController] Dispatching action: ${action}`);
		try {
			switch (action) {
				case ReviewActions.LIST_REVIEWS:
					return await this.#service.listReviews();
				case ReviewActions.GET_REVIEW:
					return await this.#service.getReview();
				case ReviewActions.CREATE_REVIEW:
					return await this.#service.createReview();
				case ReviewActions.UPDATE_REVIEW:
					return await this.#service.updateReview();
				case ReviewActions.DELETE_REVIEW:
					return await this.#service.deleteReview();
				case ReviewActions.VOTE_HELPFUL:
					return await this.#service.voteHelpful();
				case ReviewActions.UNVOTE_HELPFUL:
					return await this.#service.unvoteHelpful();
				default:
					throw new ResponseHelper.ContractError(ResponseCodes.NOT_FOUND, `Endpoint not found: invalid Review action ${action}`);
			}
		} catch (error) {
			console.error(`[ReviewController] Action "${action}" failed:`, error.message || error);
			return ResponseHelper.fromError(error);
		}
	}
}

module.exports = { ReviewController };
