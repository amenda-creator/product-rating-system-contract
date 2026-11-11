const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { SharedService } = require("../Services/Common.Services/SharedService");
const { Tables, Roles, ActivityTypes } = require("../Constants/constants");
const Config = require("../Constants/Config");
const { PRODUCTS, REVIEWERS, demoReviewerKey, reviewsForProduct } = require("./seedData");

const DAY_MS = 24 * 60 * 60 * 1000;

// Idempotent schema converted from the Web2 better-sqlite3 schema (users, products,
// reviews, review_votes). Users are keyed by HotPocket public key instead of email/password.
// Timestamps are always supplied explicitly from ctx.timestamp to stay deterministic.
const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS ${Tables.ContractVersion} (
		Id INTEGER,
		Version FLOAT NOT NULL,
		Description TEXT,
		CreatedOn DATETIME DEFAULT CURRENT_TIMESTAMP,
		LastUpdatedOn DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY("Id" AUTOINCREMENT)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.SQLSCRIPTMIGRATIONS} (
		Id INTEGER,
		Sprint TEXT NOT NULL,
		ScriptName TEXT NOT NULL,
		ExecutedTimestamp TEXT,
		ConcurrencyKey TEXT
			CHECK (ConcurrencyKey LIKE '0x%' AND length(ConcurrencyKey) = 18),
		PRIMARY KEY("Id" AUTOINCREMENT)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.USERS} (
		Id INTEGER,
		PubKey TEXT NOT NULL UNIQUE,
		Name TEXT NOT NULL,
		Role TEXT NOT NULL DEFAULT 'user' CHECK (Role IN ('user', 'admin')),
		CreatedOn TEXT NOT NULL,
		LastUpdatedOn TEXT NOT NULL,
		PRIMARY KEY("Id" AUTOINCREMENT)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.PRODUCTS} (
		Id INTEGER,
		Name TEXT NOT NULL,
		Description TEXT NOT NULL DEFAULT '',
		Category TEXT NOT NULL,
		PriceCents INTEGER NOT NULL CHECK (PriceCents >= 0),
		ImageUrl TEXT,
		CreatedBy TEXT,
		CreatedOn TEXT NOT NULL,
		LastUpdatedOn TEXT NOT NULL,
		PRIMARY KEY("Id" AUTOINCREMENT)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.REVIEWS} (
		Id INTEGER,
		ProductId INTEGER NOT NULL REFERENCES ${Tables.PRODUCTS}(Id) ON DELETE CASCADE,
		UserId INTEGER NOT NULL REFERENCES ${Tables.USERS}(Id) ON DELETE CASCADE,
		Rating INTEGER NOT NULL CHECK (Rating BETWEEN 1 AND 5),
		Title TEXT NOT NULL DEFAULT '',
		Body TEXT NOT NULL DEFAULT '',
		CreatedOn TEXT NOT NULL,
		UpdatedOn TEXT,
		PRIMARY KEY("Id" AUTOINCREMENT),
		UNIQUE (ProductId, UserId)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.REVIEW_VOTES} (
		ReviewId INTEGER NOT NULL REFERENCES ${Tables.REVIEWS}(Id) ON DELETE CASCADE,
		UserId INTEGER NOT NULL REFERENCES ${Tables.USERS}(Id) ON DELETE CASCADE,
		CreatedOn TEXT NOT NULL,
		PRIMARY KEY (ReviewId, UserId)
	)`,
	`CREATE TABLE IF NOT EXISTS ${Tables.ACTIVITY_LOG} (
		Id INTEGER,
		ActivityType TEXT NOT NULL,
		ActorPubKey TEXT,
		ProductId INTEGER,
		ReviewId INTEGER,
		Payload TEXT NOT NULL DEFAULT '{}',
		CreatedOn TEXT NOT NULL,
		PRIMARY KEY("Id" AUTOINCREMENT)
	)`,
	`CREATE INDEX IF NOT EXISTS IX_Products_Category ON ${Tables.PRODUCTS} (Category)`,
	`CREATE INDEX IF NOT EXISTS IX_Reviews_Product ON ${Tables.REVIEWS} (ProductId)`,
	`CREATE INDEX IF NOT EXISTS IX_ReviewVotes_Review ON ${Tables.REVIEW_VOTES} (ReviewId)`,
	`CREATE INDEX IF NOT EXISTS IX_ActivityLog_Type ON ${Tables.ACTIVITY_LOG} (ActivityType, Id)`,
];

class DBInitializer {
	static #db = null;

	static async init() {
		this.#db = new sqlite3.Database(Config.DB_PATH);
		try {
			await this.#runQuery("PRAGMA foreign_keys = ON");
			for (const statement of SCHEMA) {
				await this.#runQuery(statement);
			}
			await this.#seedInitialContractVersion();
			await this.#seedAdmin();
			await this.#seedDemoData();
			await this.#runMigrationScripts();
		} finally {
			await this.#close();
		}
	}

	static async #seedInitialContractVersion() {
		const row = await this.#getRecord(`SELECT COUNT(*) AS Total FROM ${Tables.ContractVersion}`);
		if (row && Number(row.Total) > 0) return;

		const nowIso = SharedService.getCurrentTimestamp();
		await this.#runQuery(
			`INSERT INTO ${Tables.ContractVersion} (Version, Description, CreatedOn, LastUpdatedOn) VALUES (?, ?, ?, ?)`,
			[1.0, "Initial product rating system contract", nowIso, nowIso],
		);
		console.log("[DBInitializer] Seeded initial contract version 1.0.");
	}

	/**
	 * Replaces the Web2 "Admin" account (ADMIN_EMAIL / ADMIN_PASSWORD): the ADMIN_PUBKEY
	 * (falling back to MAINTAINER_PUBKEY) becomes an admin the first time the contract runs.
	 */
	static async #seedAdmin() {
		const row = await this.#getRecord(`SELECT COUNT(*) AS Total FROM ${Tables.USERS} WHERE Role = ?`, [Roles.ADMIN]);
		if (row && Number(row.Total) > 0) return;

		const admin = Config.ADMIN_PUBKEY;
		if (!/^ed[0-9a-f]{64}$/.test(admin)) {
			console.error("[DBInitializer] ADMIN_PUBKEY / MAINTAINER_PUBKEY is not a valid public key; no admin seeded.");
			return;
		}
		const nowIso = SharedService.getCurrentTimestamp();
		const existing = await this.#getRecord(`SELECT Id FROM ${Tables.USERS} WHERE PubKey = ?`, [admin]);
		if (existing) {
			await this.#runQuery(`UPDATE ${Tables.USERS} SET Role = ?, LastUpdatedOn = ? WHERE Id = ?`, [Roles.ADMIN, nowIso, existing.Id]);
		} else {
			await this.#runQuery(
				`INSERT INTO ${Tables.USERS} (PubKey, Name, Role, CreatedOn, LastUpdatedOn) VALUES (?, ?, ?, ?, ?)`,
				[admin, "Admin", Roles.ADMIN, nowIso, nowIso],
			);
		}
		await this.#logActivity(ActivityTypes.ROLE_CHANGED, null, { account: admin, role: Roles.ADMIN, seeded: true }, nowIso);
		console.log(`[DBInitializer] Seeded admin ${admin}.`);
	}

	/** Port of the Web2 seed(): demo reviewers, products and reviews when the catalogue is empty. */
	static async #seedDemoData() {
		if (!Config.SEED_DEMO_DATA) return;
		const row = await this.#getRecord(`SELECT COUNT(*) AS Total FROM ${Tables.PRODUCTS}`);
		if (row && Number(row.Total) > 0) return;

		const nowMs = SharedService.getContextTimestamp();
		const nowIso = SharedService.getUtcISOStringFromUnixTimestamp(nowMs);

		await this.#runQuery("BEGIN IMMEDIATE TRANSACTION");
		try {
			const reviewerIds = [];
			for (const name of REVIEWERS) {
				const key = demoReviewerKey(name);
				const existing = await this.#getRecord(`SELECT Id FROM ${Tables.USERS} WHERE PubKey = ?`, [key]);
				if (existing) {
					reviewerIds.push(existing.Id);
					continue;
				}
				const res = await this.#runQuery(
					`INSERT INTO ${Tables.USERS} (PubKey, Name, Role, CreatedOn, LastUpdatedOn) VALUES (?, ?, ?, ?, ?)`,
					[key, name, Roles.USER, nowIso, nowIso],
				);
				reviewerIds.push(res.lastId);
			}

			let reviewCount = 0;
			for (let i = 0; i < PRODUCTS.length; i++) {
				const [name, description, category, price] = PRODUCTS[i];
				const res = await this.#runQuery(
					`INSERT INTO ${Tables.PRODUCTS} (Name, Description, Category, PriceCents, ImageUrl, CreatedBy, CreatedOn, LastUpdatedOn)
					 VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
					[name, description, category, Math.round(price * 100), nowIso, nowIso],
				);
				for (const rv of reviewsForProduct(i)) {
					const createdOn = SharedService.getUtcISOStringFromUnixTimestamp(nowMs - rv.daysAgo * DAY_MS);
					await this.#runQuery(
						`INSERT INTO ${Tables.REVIEWS} (ProductId, UserId, Rating, Title, Body, CreatedOn, UpdatedOn) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
						[res.lastId, reviewerIds[rv.reviewerIndex], rv.rating, rv.title, rv.body, createdOn],
					);
					reviewCount++;
				}
			}
			await this.#logActivity(ActivityTypes.DATA_SEEDED, null, { products: PRODUCTS.length, reviews: reviewCount }, nowIso);
			await this.#runQuery("COMMIT");
			console.log(`[DBInitializer] Seeded ${PRODUCTS.length} demo products and ${reviewCount} demo reviews.`);
		} catch (error) {
			await this.#runQuery("ROLLBACK").catch(() => {});
			throw error;
		}
	}

	/**
	 * Runs SQL files from <dbScriptsFolderPath>/Sprint_XX/NN_Name.sql once each, in order.
	 */
	static async #runMigrationScripts() {
		const scriptsRoot = Config.DB_SCRIPTS_FOLDER;
		if (!scriptsRoot || !fs.existsSync(scriptsRoot)) return;

		const lastRow = await this.#getRecord(
			`SELECT Sprint FROM ${Tables.SQLSCRIPTMIGRATIONS} ORDER BY Sprint DESC LIMIT 1`,
		);
		const lastExecutedSprint = lastRow ? lastRow.Sprint : "Sprint_00";

		const sprintFolders = fs
			.readdirSync(scriptsRoot)
			.filter(folder => folder.startsWith("Sprint_") && folder >= lastExecutedSprint)
			.filter(folder => fs.statSync(path.join(scriptsRoot, folder)).isDirectory())
			.sort();

		for (const sprintFolder of sprintFolders) {
			const sprintPath = path.join(scriptsRoot, sprintFolder);
			const sqlFiles = fs
				.readdirSync(sprintPath)
				.filter(file => /^\d+_.+\.sql$/.test(file))
				.sort();

			for (const sqlFile of sqlFiles) {
				const executed = await this.#getRecord(
					`SELECT Id FROM ${Tables.SQLSCRIPTMIGRATIONS} WHERE Sprint = ? AND ScriptName = ?`,
					[sprintFolder, sqlFile],
				);
				if (executed) continue;

				const scriptPath = path.join(sprintPath, sqlFile);
				console.log(`[MIGRATION] Executing script: ${scriptPath}`);
				const statements = fs
					.readFileSync(scriptPath, "utf8")
					.split(";")
					.map(statement =>
						statement
							.split(/\r?\n/)
							.map(line => (line.trim().startsWith("--") ? "" : line))
							.join("\n"),
					)
					.filter(statement => statement.trim() !== "");

				for (const statement of statements) {
					await this.#runQuery(statement);
				}

				await this.#runQuery(
					`INSERT INTO ${Tables.SQLSCRIPTMIGRATIONS} (Sprint, ScriptName, ExecutedTimestamp) VALUES (?, ?, ?)`,
					[sprintFolder, sqlFile, SharedService.getCurrentTimestamp()],
				);
			}
		}
	}

	static async #logActivity(type, actor, payload, nowIso) {
		await this.#runQuery(
			`INSERT INTO ${Tables.ACTIVITY_LOG} (ActivityType, ActorPubKey, ProductId, ReviewId, Payload, CreatedOn) VALUES (?, ?, NULL, NULL, ?, ?)`,
			[type, actor, JSON.stringify(payload || {}), nowIso],
		);
	}

	static #runQuery(query, params = []) {
		return new Promise((resolve, reject) => {
			this.#db.run(query, params, function (err) {
				if (err) {
					reject(err);
					return;
				}
				resolve({ lastId: this.lastID, changes: this.changes });
			});
		});
	}

	static #getRecord(query, params = []) {
		return new Promise((resolve, reject) => {
			this.#db.get(query, params, (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(row);
			});
		});
	}

	static #close() {
		return new Promise(resolve => {
			if (!this.#db) {
				resolve();
				return;
			}
			this.#db.close(err => {
				if (err) console.error("[DBInitializer] Error closing database:", err.message);
				this.#db = null;
				resolve();
			});
		});
	}
}

module.exports = { DBInitializer };
