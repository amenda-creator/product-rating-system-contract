const { SqliteDatabase } = require("../Common.Services/dbHandler");
const { SharedService } = require("../Common.Services/SharedService");
const { IdentityService } = require("../Common.Services/Identity.Service");
const { ActivityLogService } = require("../Common.Services/ActivityLog.Service");
const { Tables, Roles, ReviewSorts, ActivityTypes, ResponseCodes } = require("../../Constants/constants");
const Config = require("../../Constants/Config");
const ResponseHelper = require("../../Utils/Response.Helper");
const { validate, str, int, idParam, intOr, clamp } = require("../../Utils/Validation.Helper");

const { ContractError } = ResponseHelper;

// "me" is bound twice: once for the voted flag, once where needed by the caller.
const SELECT_REVIEW = `
	SELECT rv.*, u.Name AS Author,
	       (SELECT COUNT(*) FROM ${Tables.REVIEW_VOTES} v WHERE v.ReviewId = rv.Id) AS HelpfulCount,
	       EXISTS (SELECT 1 FROM ${Tables.REVIEW_VOTES} v WHERE v.ReviewId = rv.Id AND v.UserId = ?) AS Voted
	FROM ${Tables.REVIEWS} rv JOIN ${Tables.USERS} u ON u.Id = rv.UserId`;

function shape(rv, me) {
	return {
		id: rv.Id,
		productId: rv.ProductId,
		author: rv.Author,
		rating: rv.Rating,
		title: rv.Title,
		body: rv.Body,
		createdAt: rv.CreatedOn,
		updatedAt: rv.UpdatedOn,
		helpfulCount: rv.HelpfulCount,
		votedHelpful: Boolean(rv.Voted),
		isMine: me !== null && me !== undefined && rv.UserId === me,
	};
}

function validateReview(b, partial = false) {
	validate({
		rating: () => (b.rating === undefined && partial ? null : int(b.rating, { min: 1, max: 5, label: "Rating" })),
		title: () => str(b.title, { max: 120, label: "Title" }),
		body: () => str(b.body, { max: 2000, label: "Review" }),
	});
}

/** Converted from the Web2 /api/products/:id/reviews and /api/reviews routes. */
class ReviewService {
	#message = null;
	#db = null;

	constructor(message) {
		this.#message = message;
		this.#db = new SqliteDatabase(Config.DB_PATH);
	}

	get #data() {
		return this.#message.Data || {};
	}

	get #caller() {
		return this.#message.userPubKey;
	}

	async #withDb(fn) {
		this.#db.open();
		try {
			return await fn(this.#db);
		} finally {
			this.#db.close();
		}
	}

	static async loadReview(db, id, me = null) {
		const rv = await db.getRecord(`${SELECT_REVIEW} WHERE rv.Id = ?`, [me, id]);
		if (!rv) throw new ContractError(ResponseCodes.NOT_FOUND, "Review not found");
		return rv;
	}

	static async requireProduct(db, id) {
		if (!(await db.getRecord(`SELECT 1 AS ok FROM ${Tables.PRODUCTS} WHERE Id = ?`, [id]))) {
			throw new ContractError(ResponseCodes.NOT_FOUND, "Product not found");
		}
	}

	/** GET /api/products/:id/reviews?sort=&rating=&page=&limit= (includes the caller's own review as "mine"). */
	async listReviews() {
		const d = this.#data;
		const productId = idParam(d.productId);
		const sort = typeof d.sort === "string" && Object.prototype.hasOwnProperty.call(ReviewSorts, d.sort) ? d.sort : "newest";
		const rating = Number(d.rating);
		const limit = clamp(intOr(d.limit, Config.RATING.reviewPageSize), 1, Config.RATING.maxPageSize);
		const page = Math.max(intOr(d.page, 1), 1);

		return this.#withDb(async db => {
			await ReviewService.requireProduct(db, productId);
			const caller = await IdentityService.findCaller(db, this.#caller);
			const me = caller ? caller.Id : null;

			let where = "WHERE rv.ProductId = ?";
			const params = [productId];
			if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
				where += " AND rv.Rating = ?";
				params.push(rating);
			}

			const total = (await db.getRecord(`SELECT COUNT(*) AS n FROM ${Tables.REVIEWS} rv ${where}`, params)).n;
			const rows = await db.runSelectQuery(
				`${SELECT_REVIEW} ${where} ORDER BY ${ReviewSorts[sort]} LIMIT ? OFFSET ?`,
				[me].concat(params, [limit, (page - 1) * limit]),
			);
			const mine = me
				? await db.getRecord(`${SELECT_REVIEW} WHERE rv.ProductId = ? AND rv.UserId = ?`, [me, productId, me])
				: null;

			return ResponseHelper.success({
				items: rows.map(rv => shape(rv, me)),
				mine: mine ? shape(mine, me) : null,
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			});
		});
	}

	/** Single review lookup (used by clients after a vote/edit; not a separate Web2 route). */
	async getReview() {
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			const caller = await IdentityService.findCaller(db, this.#caller);
			const me = caller ? caller.Id : null;
			return ResponseHelper.success(shape(await ReviewService.loadReview(db, id, me), me));
		});
	}

	/** POST /api/products/:id/reviews - one review per user per product. */
	async createReview() {
		IdentityService.requireWrite(this.#message);
		const b = this.#data;
		const productId = idParam(b.productId);
		return this.#withDb(async db => {
			const user = await IdentityService.requireUser(db, this.#caller);
			await ReviewService.requireProduct(db, productId);
			validateReview(b);

			return db.withTransaction(async () => {
				const existing = await db.getRecord(
					`SELECT Id FROM ${Tables.REVIEWS} WHERE ProductId = ? AND UserId = ?`,
					[productId, user.Id],
				);
				if (existing) {
					throw new ContractError(
						ResponseCodes.CONFLICT,
						"You have already reviewed this product - edit your existing review instead",
					);
				}
				const nowIso = SharedService.getCurrentTimestamp();
				const res = await db.insertValue(Tables.REVIEWS, {
					ProductId: productId,
					UserId: user.Id,
					Rating: b.rating,
					Title: typeof b.title === "string" ? b.title.trim() : "",
					Body: typeof b.body === "string" ? b.body.trim() : "",
					CreatedOn: nowIso,
					UpdatedOn: null,
				});
				await ActivityLogService.log(
					db,
					ActivityTypes.REVIEW_CREATED,
					{ actor: this.#caller, productId, reviewId: res.lastId, payload: { rating: b.rating } },
					nowIso,
				);
				const review = shape(await ReviewService.loadReview(db, res.lastId, user.Id), user.Id);
				return ResponseHelper.success(Object.assign({ status: ResponseCodes.CREATED }, review));
			});
		});
	}

	/** PUT /api/reviews/:id - only the author can edit. */
	async updateReview() {
		IdentityService.requireWrite(this.#message);
		const b = this.#data;
		const id = idParam(b.id);
		return this.#withDb(async db => {
			const user = await IdentityService.requireUser(db, this.#caller);
			return db.withTransaction(async () => {
				const rv = await ReviewService.loadReview(db, id, user.Id);
				if (rv.UserId !== user.Id) {
					throw new ContractError(ResponseCodes.FORBIDDEN, "You can only edit your own review");
				}
				validateReview(b, true);
				const nowIso = SharedService.getCurrentTimestamp();
				const newRating = b.rating !== undefined && b.rating !== null ? b.rating : rv.Rating;
				await db.updateValue(
					Tables.REVIEWS,
					{
						Rating: newRating,
						Title: typeof b.title === "string" ? b.title.trim() : rv.Title,
						Body: typeof b.body === "string" ? b.body.trim() : rv.Body,
						UpdatedOn: nowIso,
					},
					{ Id: id },
				);
				await ActivityLogService.log(
					db,
					ActivityTypes.REVIEW_UPDATED,
					{ actor: this.#caller, productId: rv.ProductId, reviewId: id, payload: { from: rv.Rating, to: newRating } },
					nowIso,
				);
				return ResponseHelper.success(shape(await ReviewService.loadReview(db, id, user.Id), user.Id));
			});
		});
	}

	/** DELETE /api/reviews/:id - owners delete their own review; admins can moderate any review. */
	async deleteReview() {
		IdentityService.requireWrite(this.#message);
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			const user = await IdentityService.requireUser(db, this.#caller);
			return db.withTransaction(async () => {
				const rv = await ReviewService.loadReview(db, id);
				if (rv.UserId !== user.Id && user.Role !== Roles.ADMIN) {
					throw new ContractError(ResponseCodes.FORBIDDEN, "You can only delete your own review");
				}
				await db.runQuery(`DELETE FROM ${Tables.REVIEW_VOTES} WHERE ReviewId = ?`, [id]);
				await db.runQuery(`DELETE FROM ${Tables.REVIEWS} WHERE Id = ?`, [id]);
				const nowIso = SharedService.getCurrentTimestamp();
				await ActivityLogService.log(
					db,
					ActivityTypes.REVIEW_DELETED,
					{
						actor: this.#caller,
						productId: rv.ProductId,
						reviewId: id,
						payload: { moderated: rv.UserId !== user.Id, rating: rv.Rating },
					},
					nowIso,
				);
				return ResponseHelper.success({ status: ResponseCodes.NO_CONTENT, deleted: true, id });
			});
		});
	}

	/** PUT /api/reviews/:id/helpful - one vote per user, not on your own review. */
	async voteHelpful() {
		IdentityService.requireWrite(this.#message);
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			const user = await IdentityService.requireUser(db, this.#caller);
			return db.withTransaction(async () => {
				const rv = await ReviewService.loadReview(db, id);
				if (rv.UserId === user.Id) {
					throw new ContractError(ResponseCodes.BAD_REQUEST, "You cannot vote on your own review");
				}
				const nowIso = SharedService.getCurrentTimestamp();
				const res = await db.runQuery(
					`INSERT OR IGNORE INTO ${Tables.REVIEW_VOTES} (ReviewId, UserId, CreatedOn) VALUES (?, ?, ?)`,
					[id, user.Id, nowIso],
				);
				if (res.changes > 0) {
					await ActivityLogService.log(
						db,
						ActivityTypes.REVIEW_VOTED,
						{ actor: this.#caller, productId: rv.ProductId, reviewId: id },
						nowIso,
					);
				}
				return ResponseHelper.success(shape(await ReviewService.loadReview(db, id, user.Id), user.Id));
			});
		});
	}

	/** DELETE /api/reviews/:id/helpful - removes the caller's vote (idempotent). */
	async unvoteHelpful() {
		IdentityService.requireWrite(this.#message);
		const id = idParam(this.#data.id);
		return this.#withDb(async db => {
			const user = await IdentityService.requireUser(db, this.#caller);
			return db.withTransaction(async () => {
				const rv = await ReviewService.loadReview(db, id);
				const res = await db.runQuery(`DELETE FROM ${Tables.REVIEW_VOTES} WHERE ReviewId = ? AND UserId = ?`, [id, user.Id]);
				if (res.changes > 0) {
					await ActivityLogService.log(
						db,
						ActivityTypes.REVIEW_UNVOTED,
						{ actor: this.#caller, productId: rv.ProductId, reviewId: id },
						SharedService.getCurrentTimestamp(),
					);
				}
				return ResponseHelper.success(shape(await ReviewService.loadReview(db, id, user.Id), user.Id));
			});
		});
	}
}

module.exports = { ReviewService };
