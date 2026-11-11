const { SqliteDatabase } = require("../Common.Services/dbHandler");
const { SharedService } = require("../Common.Services/SharedService");
const { IdentityService } = require("../Common.Services/Identity.Service");
const { ActivityLogService } = require("../Common.Services/ActivityLog.Service");
const { Tables, Roles, ActivityTypes, ResponseCodes } = require("../../Constants/constants");
const Config = require("../../Constants/Config");
const ResponseHelper = require("../../Utils/Response.Helper");
const { validate, str, intOr, clamp } = require("../../Utils/Validation.Helper");

const { ContractError } = ResponseHelper;
const PUBKEY_RE = /^ed[0-9a-f]{64}$/;

/**
 * Converted from the Web2 /api/auth routes.
 *  - POST /register -> Register (display name only; the HotPocket key replaces email + password)
 *  - POST /login    -> not needed: every connection is already authenticated by its Ed25519 key
 *  - GET  /me       -> GetMe
 * Plus UpdateProfile, and admin-only GetUsers / SetUserRole so admins can be managed
 * without editing the database (the Web2 app only had a seeded admin).
 */
class UserService {
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

	async register() {
		IdentityService.requireWrite(this.#message);
		const { name } = this.#data;
		validate({
			name: () => str(name, { required: true, min: 2, max: 60, label: "Name" }),
		});

		return this.#withDb(db =>
			db.withTransaction(async () => {
				if (await IdentityService.findCaller(db, this.#caller)) {
					throw new ContractError(ResponseCodes.CONFLICT, "An account with this public key already exists");
				}
				const nowIso = SharedService.getCurrentTimestamp();
				const res = await db.insertValue(Tables.USERS, {
					PubKey: this.#caller,
					Name: name.trim(),
					Role: Roles.USER,
					CreatedOn: nowIso,
					LastUpdatedOn: nowIso,
				});
				await ActivityLogService.log(db, ActivityTypes.USER_REGISTERED, { actor: this.#caller, payload: { userId: res.lastId } }, nowIso);
				const user = await db.findById(Tables.USERS, res.lastId);
				return ResponseHelper.success({ status: ResponseCodes.CREATED, user: IdentityService.publicUser(user) });
			}),
		);
	}

	async getMe() {
		return this.#withDb(async db => {
			const user = await IdentityService.findCaller(db, this.#caller);
			if (!user) {
				throw new ContractError(ResponseCodes.UNAUTHORIZED, "Account not registered for this public key");
			}
			return ResponseHelper.success(IdentityService.publicUser(user));
		});
	}

	async updateProfile() {
		IdentityService.requireWrite(this.#message);
		const { name } = this.#data;
		validate({
			name: () => str(name, { required: true, min: 2, max: 60, label: "Name" }),
		});

		return this.#withDb(db =>
			db.withTransaction(async () => {
				const user = await IdentityService.requireUser(db, this.#caller);
				const nowIso = SharedService.getCurrentTimestamp();
				await db.updateValue(Tables.USERS, { Name: name.trim(), LastUpdatedOn: nowIso }, { Id: user.Id });
				await ActivityLogService.log(db, ActivityTypes.PROFILE_UPDATED, { actor: this.#caller, payload: { userId: user.Id } }, nowIso);
				return ResponseHelper.success(IdentityService.publicUser(await db.findById(Tables.USERS, user.Id)));
			}),
		);
	}

	async getUsers() {
		const data = this.#data;
		const limit = clamp(intOr(data.limit, 20), 1, Config.RATING.maxPageSize);
		const page = Math.max(intOr(data.page, 1), 1);
		const role = data.role === Roles.ADMIN || data.role === Roles.USER ? data.role : null;

		return this.#withDb(async db => {
			await IdentityService.requireAdmin(db, this.#caller);
			const where = role ? "WHERE Role = ?" : "";
			const params = role ? [role] : [];
			const total = (await db.getRecord(`SELECT COUNT(*) AS n FROM ${Tables.USERS} ${where}`, params)).n;
			const rows = await db.runSelectQuery(
				`SELECT * FROM ${Tables.USERS} ${where} ORDER BY Id ASC LIMIT ? OFFSET ?`,
				params.concat([limit, (page - 1) * limit]),
			);
			return ResponseHelper.success({
				items: rows.map(u => IdentityService.publicUser(u)),
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			});
		});
	}

	async setUserRole() {
		IdentityService.requireWrite(this.#message);
		const data = this.#data;
		const publicKey = typeof data.publicKey === "string" ? data.publicKey.trim().toLowerCase() : "";
		validate({
			publicKey: () => (PUBKEY_RE.test(publicKey) ? null : "A valid HotPocket public key (ed + 64 hex) is required"),
			role: () => (data.role === Roles.ADMIN || data.role === Roles.USER ? null : "Role must be 'user' or 'admin'"),
		});

		return this.#withDb(db =>
			db.withTransaction(async () => {
				await IdentityService.requireAdmin(db, this.#caller);
				const target = await IdentityService.findCaller(db, publicKey);
				if (!target) throw new ContractError(ResponseCodes.NOT_FOUND, "User not found");

				if (target.Role === Roles.ADMIN && data.role === Roles.USER) {
					const admins = (await db.getRecord(`SELECT COUNT(*) AS n FROM ${Tables.USERS} WHERE Role = ?`, [Roles.ADMIN])).n;
					if (admins <= 1) {
						throw new ContractError(ResponseCodes.CONFLICT, "Cannot remove the last admin");
					}
				}

				const nowIso = SharedService.getCurrentTimestamp();
				await db.updateValue(Tables.USERS, { Role: data.role, LastUpdatedOn: nowIso }, { Id: target.Id });
				await ActivityLogService.log(
					db,
					ActivityTypes.ROLE_CHANGED,
					{ actor: this.#caller, payload: { userId: target.Id, from: target.Role, to: data.role } },
					nowIso,
				);
				return ResponseHelper.success(IdentityService.publicUser(await db.findById(Tables.USERS, target.Id)));
			}),
		);
	}
}

module.exports = { UserService };
