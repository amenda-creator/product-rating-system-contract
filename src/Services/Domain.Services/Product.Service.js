const { SqliteDatabase } = require("../Common.Services/dbHandler");
const { SharedService } = require("../Common.Services/SharedService");
const { IdentityService } = require("../Common.Services/Identity.Service");
const { ActivityLogService } = require("../Common.Services/ActivityLog.Service");
const { Tables, ProductSorts, ActivityTypes, ResponseCodes } = require("../../Constants/constants");
const Config = require("../../Constants/Config");
const ResponseHelper = require("../../Utils/Response.Helper");
const { validate, str, idParam, intOr, clamp } = require("../../Utils/Validation.Helper");

const { ContractError } = ResponseHelper;

/**
 * Ranking by raw average lets a product with one 5-star review outrank one with
 * hundreds of 4.8-star reviews. "Top rated" uses a Bayesian average instead:
 *   score = (C * m + sum(ratings)) / (C + n)
 * where m is the global mean rating and C the weight of that prior (Web2 PRIOR_WEIGHT = 5).
 */
const SELECT_PRODUCT = `
	SELECT p.*,
	       COUNT(rv.Id)             AS ReviewCount,
	       ROUND(AVG(rv.Rating), 2) AS AvgRating,
	       (? * ? + COALESCE(SUM(rv.Rating), 0)) * 1.0 / (? + COUNT(rv.Id)) AS Score
	FROM ${Tables.PRODUCTS} p
	LEFT JOIN ${Tables.REVIEWS} rv ON rv.ProductId = p.Id`;

function shape(p) {
	return {
		id: p.Id,
		name: p.Name,
		description: p.Description,
		category: p.Category,
		price: p.PriceCents / 100,
		imageUrl: p.ImageUrl,
		createdAt: p.CreatedOn,
		updatedAt: p.LastUpdatedOn,
		rating: {
			average: p.AvgRating === null || p.AvgRating === undefined ? 0 : p.AvgRating,
			count: p.ReviewCount,
			score: Math.round(p.Score * 100) / 100,
		},
	};
}

function validateProduct(b, partial = false) {
	// A field that is present is always required (a partial update cannot blank the name or category).
	validate({
		name: () => (b.name === undefined && partial ? null : str(b.name, { required: true, min: 2, max: 120, label: "Name" })),
		category: () =>
			b.category === undefined && partial ? null : str(b.category, { required: true, min: 2, max: 40, label: "Category" }),
		description: () => str(b.description, { max: 2000, label: "Description" }),
		price: () =>
			b.price === undefined && partial
				? null
				: typeof b.price === "number" && Number.isFinite(b.price) && b.price >= 0 && b.price <= 1000000
				? null
				: "Price must be a number from 0 to 1,000,000",
		imageUrl: () =>
			b.imageUrl === undefined || b.imageUrl === null || b.imageUrl === ""
				? null
				: typeof b.imageUrl === "string" && /^https?:\/\/\S+$/.test(b.imageUrl) && b.imageUrl.length <= 500
				? null
				: "Image URL must be an http(s) URL",
	});
}

/** Converted from the Web2 /api/products routes. */
class ProductService {
	#message = null;
	#db = null;

	constructor(message) {
		this.#message = message;
		this.#db = new SqliteDatabase(Config.DB_PATH);
	}

	get #data() {
		return this.#message.Data || {};
	}

	async #withDb(fn) {
		this.#db.open();
		try {
			return await fn(this.#db);
		} finally {
			this.#db.close();
		}
	}

	static async globalMean(db) {
		const row = await db.getRecord(`SELECT AVG(Rating) AS m FROM ${Tables.REVIEWS}`);
		return row && row.m !== null && row.m !== undefined ? row.m : Config.RATING.defaultMeanRating;
	}

	static async loadProduct(db, id) {
		const C = Config.RATING.priorWeight;
		const m = await ProductService.globalMean(db);
		const p = await db.getRecord(`${SELECT_PRODUCT} WHERE p.Id = ? GROUP BY p.Id`, [C, m, C, id]);
		if (!p) throw new ContractError(ResponseCodes.NOT_FOUND, "Product not found");
		return p;
	}

	/** GET /api/products?q=&category=&minRating=&sort=&page=&limit= */
	async listProducts() {
		const d = this.#data;
		const q = String(d.q === undefined || d.q === null ? "" : d.q).trim();
		const category = String(d.category === undefined || d.category === null ? "" : d.category).trim();
		const minRating = Number(d.minRating) || 0;
		const sort = typeof d.sort === "string" && Object.prototype.hasOwnProperty.call(ProductSorts, d.sort) ? d.sort : "rating";
		const limit = clamp(intOr(d.limit, Config.RATING.productPageSize), 1, Config.RATING.maxPageSize);
		const page = Math.max(intOr(d.page, 1), 1);

		return this.#withDb(async db => {
			const C = Config.RATING.priorWeight;
			const m = await ProductService.globalMean(db);
			const where = [];
			const params = [C, m, C];
			if (q) {
				where.push("(p.Name LIKE ? OR p.Description LIKE ?)");
				params.push(`%${q}%`, `%${q}%`);
			}
			if (category) {
				where.push("p.Category = ?");
				params.push(category);
			}
			const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
			const havingSql = minRating ? "HAVING AVG(rv.Rating) >= ?" : "";
			if (minRating) params.push(minRating);

			const base = `${SELECT_PRODUCT} ${whereSql} GROUP BY p.Id ${havingSql}`;
			const total = (await db.getRecord(`SELECT COUNT(*) AS n FROM (${base})`, params)).n;
			const rows = await db.runSelectQuery(
				`${base} ORDER BY ${ProductSorts[sort]} LIMIT ? OFFSET ?`,
				params.concat([limit, (page - 1) * limit]),
			);
			return ResponseHelper.success({ items: rows.map(shape), page, limit, total, pages: Math.ceil(total / limit) });
		});
	}

	/** GET /api/products/categories */
	async getCategories() {
		return this.#withDb(async db => {
			const rows = await db.runSelectQuery(
				`SELECT Category AS name, COUNT(*) AS count FROM ${Tables.PRODUCTS} GROUP BY Category ORDER BY Category`,
			);
			return ResponseHelper.success(rows.map(r => ({ name: r.name, count: r.count })));
		});
	}

	/** GET /api/products/:id - includes the 1-5 star distribution for the histogram. */
	async getProduct() {
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			const product = shape(await ProductService.loadProduct(db, id));
			const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			const rows = await db.runSelectQuery(
				`SELECT Rating, COUNT(*) AS n FROM ${Tables.REVIEWS} WHERE ProductId = ? GROUP BY Rating`,
				[id],
			);
			for (const row of rows) dist[row.Rating] = row.n;
			product.rating.distribution = dist;
			return ResponseHelper.success(product);
		});
	}

	/** POST /api/products (admin) */
	async createProduct() {
		IdentityService.requireWrite(this.#message);
		const b = this.#data;
		return this.#withDb(async db => {
			await IdentityService.requireAdmin(db, this.#message.userPubKey);
			validateProduct(b);
			return db.withTransaction(async () => {
				const nowIso = SharedService.getCurrentTimestamp();
				const res = await db.insertValue(Tables.PRODUCTS, {
					Name: b.name.trim(),
					Description: typeof b.description === "string" ? b.description.trim() : "",
					Category: b.category.trim(),
					PriceCents: Math.round(b.price * 100),
					ImageUrl: b.imageUrl || null,
					CreatedBy: this.#message.userPubKey,
					CreatedOn: nowIso,
					LastUpdatedOn: nowIso,
				});
				await ActivityLogService.log(
					db,
					ActivityTypes.PRODUCT_CREATED,
					{ actor: this.#message.userPubKey, productId: res.lastId, payload: { name: b.name.trim() } },
					nowIso,
				);
				const product = shape(await ProductService.loadProduct(db, res.lastId));
				return ResponseHelper.success(Object.assign({ status: ResponseCodes.CREATED }, product));
			});
		});
	}

	/** PUT /api/products/:id (admin, partial update) */
	async updateProduct() {
		IdentityService.requireWrite(this.#message);
		const b = this.#data;
		const id = idParam(b.id);
		return this.#withDb(async db => {
			await IdentityService.requireAdmin(db, this.#message.userPubKey);
			return db.withTransaction(async () => {
				const current = await ProductService.loadProduct(db, id);
				validateProduct(b, true);
				const nowIso = SharedService.getCurrentTimestamp();
				await db.updateValue(
					Tables.PRODUCTS,
					{
						Name: typeof b.name === "string" ? b.name.trim() : current.Name,
						Description: typeof b.description === "string" ? b.description.trim() : current.Description,
						Category: typeof b.category === "string" ? b.category.trim() : current.Category,
						PriceCents: b.price !== undefined ? Math.round(b.price * 100) : current.PriceCents,
						ImageUrl: b.imageUrl !== undefined ? b.imageUrl || null : current.ImageUrl,
						LastUpdatedOn: nowIso,
					},
					{ Id: id },
				);
				const changed = ["name", "description", "category", "price", "imageUrl"].filter(k => b[k] !== undefined);
				await ActivityLogService.log(
					db,
					ActivityTypes.PRODUCT_UPDATED,
					{ actor: this.#message.userPubKey, productId: id, payload: { fields: changed } },
					nowIso,
				);
				return ResponseHelper.success(shape(await ProductService.loadProduct(db, id)));
			});
		});
	}

	/** DELETE /api/products/:id (admin) - also removes the product's reviews and their votes. */
	async deleteProduct() {
		IdentityService.requireWrite(this.#message);
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			await IdentityService.requireAdmin(db, this.#message.userPubKey);
			return db.withTransaction(async () => {
				const product = await db.findById(Tables.PRODUCTS, id);
				if (!product) throw new ContractError(ResponseCodes.NOT_FOUND, "Product not found");
				// Explicit cascade (does not depend on PRAGMA foreign_keys being active).
				await db.runQuery(
					`DELETE FROM ${Tables.REVIEW_VOTES} WHERE ReviewId IN (SELECT Id FROM ${Tables.REVIEWS} WHERE ProductId = ?)`,
					[id],
				);
				const reviews = await db.runQuery(`DELETE FROM ${Tables.REVIEWS} WHERE ProductId = ?`, [id]);
				await db.runQuery(`DELETE FROM ${Tables.PRODUCTS} WHERE Id = ?`, [id]);
				const nowIso = SharedService.getCurrentTimestamp();
				await ActivityLogService.log(
					db,
					ActivityTypes.PRODUCT_DELETED,
					{ actor: this.#message.userPubKey, productId: id, payload: { name: product.Name, reviewsRemoved: reviews.changes } },
					nowIso,
				);
				return ResponseHelper.success({ status: ResponseCodes.NO_CONTENT, deleted: true, id });
			});
		});
	}
}

module.exports = { ProductService, shapeProduct: shape };
