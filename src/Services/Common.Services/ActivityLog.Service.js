const { Tables } = require("../../Constants/constants");

/**
 * Append-only audit trail of state changes (who did what, at which consensus time).
 * Rows are written inside the same transaction as the change they describe.
 */
class ActivityLogService {
	static async log(db, type, { actor = null, productId = null, reviewId = null, payload = {} }, nowIso) {
		await db.runQuery(
			`INSERT INTO ${Tables.ACTIVITY_LOG} (ActivityType, ActorPubKey, ProductId, ReviewId, Payload, CreatedOn)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[type, actor, productId, reviewId, JSON.stringify(payload || {}), nowIso],
		);
	}
}

module.exports = { ActivityLogService };
