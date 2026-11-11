const { ProductService } = require("../Services/Domain.Services/Product.Service");
const { ProductActions, ResponseCodes } = require("../Constants/constants");
const ResponseHelper = require("../Utils/Response.Helper");

class ProductController {
	#message = null;
	#service = null;

	constructor(message) {
		this.#message = message;
		this.#service = new ProductService(message);
	}

	async handleRequest() {
		const action = this.#message.Action;
		console.log(`[ProductController] Dispatching action: ${action}`);
		try {
			switch (action) {
				case ProductActions.LIST_PRODUCTS:
					return await this.#service.listProducts();
				case ProductActions.GET_CATEGORIES:
					return await this.#service.getCategories();
				case ProductActions.GET_PRODUCT:
					return await this.#service.getProduct();
				case ProductActions.CREATE_PRODUCT:
					return await this.#service.createProduct();
				case ProductActions.UPDATE_PRODUCT:
					return await this.#service.updateProduct();
				case ProductActions.DELETE_PRODUCT:
					return await this.#service.deleteProduct();
				default:
					throw new ResponseHelper.ContractError(ResponseCodes.NOT_FOUND, `Endpoint not found: invalid Product action ${action}`);
			}
		} catch (error) {
			console.error(`[ProductController] Action "${action}" failed:`, error.message || error);
			return ResponseHelper.fromError(error);
		}
	}
}

module.exports = { ProductController };
