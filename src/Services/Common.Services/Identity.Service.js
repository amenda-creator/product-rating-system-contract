const { Tables, Roles, ResponseCodes } = require("../../Constants/constants");
const { ContractError } = require("../../Utils/Response.Helper");

/**
 * Replacement for the Web2 JWT middleware (optionalAuth / requireAuth / requireAdmin).
 * The caller is identified by the Ed25519 public key HotPocket authenticated during the
 * websocket handshake; the Users row keyed by that key holds the display name and role.
 * Every function takes an open SqliteDatabase so it can join the caller's transaction.
 */
class IdentityService {
	/** optionalAuth: the caller's Users row, or null for an unregistered key. */
	static async findCaller(db, pubKey) {
		if (!pubKey) return null;
		const row = await db.getRecord(`SELECT * FROM ${Tables.USERS} WHERE PubKey = ?`, [pubKey]);
		return row || null;
	}

	/** requireAuth: 401 when the key has no registered profile. */
	static async requireUser(db, pubKey) {
		const user = await this.findCaller(db, pubKey);
		if (!user) {
			throw new ContractError(
				ResponseCodes.UNAUTHORIZED,
				"Authentication required: register a profile for this public key first (User/Register).",
			);
		}
		return user;
	}

	/** requireAdmin: 401 when unregistered, 403 when not an admin. */
	static async requireAdmin(db, pubKey) {
		const user = await this.requireUser(db, pubKey);
		if (user.Role !== Roles.ADMIN) {
			throw new ContractError(ResponseCodes.FORBIDDEN, "Admin access required");
		}
		return user;
	}

	/** State-changing actions must arrive as consensus inputs, never read requests. */
	static requireWrite(message) {
		if (message.isReadOnly) {
			throw new ContractError(
				ResponseCodes.BAD_REQUEST,
				`ReadOnlyRequest: ${message.Action} changes state and must be submitted as a contract input.`,
			);
		}
	}

	static publicUser(u) {
		return { id: u.Id, publicKey: u.PubKey, name: u.Name, role: u.Role, createdAt: u.CreatedOn };
	}
}

module.exports = { IdentityService };
