const sqlite3 = require("sqlite3").verbose();

const DataTypes = {
	TEXT: "TEXT",
	INTEGER: "INTEGER",
	NULL: "NULL",
};

/**
 * Thin promise wrapper around sqlite3. All queries use bound parameters.
 * open()/close() are reference counted so nested calls share one connection.
 */
class SqliteDatabase {
	constructor(dbFile) {
		this.dbFile = dbFile;
		this.db = null;
		this.openConnections = 0;
	}

	open() {
		if (this.openConnections <= 0) {
			this.db = new sqlite3.Database(this.dbFile);
			this.db.run("PRAGMA foreign_keys = ON");
			this.openConnections = 1;
		} else {
			this.openConnections++;
		}
	}

	close() {
		if (this.openConnections <= 1) {
			if (this.db) this.db.close();
			this.db = null;
			this.openConnections = 0;
		} else {
			this.openConnections--;
		}
	}

	ensureOpen() {
		if (!this.db) throw new Error("Database connection is not open.");
	}

	/**
	 * Runs a write/DDL statement.
	 * @returns {Promise<{lastId: number, changes: number}>}
	 */
	runQuery(query, params = []) {
		this.ensureOpen();
		return new Promise((resolve, reject) => {
			this.db.run(query, params || [], function (err) {
				if (err) {
					reject(err);
					return;
				}
				resolve({ lastId: this.lastID, changes: this.changes });
			});
		});
	}

	/**
	 * Returns the first matching row or undefined.
	 */
	getRecord(query, params = []) {
		this.ensureOpen();
		return new Promise((resolve, reject) => {
			this.db.get(query, params || [], (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(row);
			});
		});
	}

	/**
	 * Returns all matching rows (empty array when none).
	 */
	runSelectQuery(query, params = []) {
		this.ensureOpen();
		return new Promise((resolve, reject) => {
			this.db.all(query, params || [], (err, rows) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(rows || []);
			});
		});
	}

	async insertValue(tableName, value) {
		const columns = Object.keys(value);
		const placeholders = columns.map(() => "?").join(", ");
		const values = columns.map(c => (value[c] === undefined ? null : value[c]));
		return this.runQuery(
			`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
			values,
		);
	}

	async insertValues(tableName, values) {
		const results = [];
		for (const value of values) {
			results.push(await this.insertValue(tableName, value));
		}
		return results;
	}

	async updateValue(tableName, value, filter = null) {
		const setColumns = Object.keys(value);
		const params = setColumns.map(c => (value[c] === undefined ? null : value[c]));
		const setClause = setColumns.map(c => `${c} = ?`).join(", ");

		let whereClause = "1 = 1";
		if (filter && Object.keys(filter).length > 0) {
			const filterColumns = Object.keys(filter);
			whereClause = filterColumns.map(c => `${c} = ?`).join(" AND ");
			for (const c of filterColumns) params.push(filter[c]);
		}

		return this.runQuery(`UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`, params);
	}

	async getValues(tableName, filter = null) {
		const params = [];
		let whereClause = "1 = 1";
		if (filter && Object.keys(filter).length > 0) {
			const filterColumns = Object.keys(filter);
			whereClause = filterColumns.map(c => `${c} = ?`).join(" AND ");
			for (const c of filterColumns) params.push(filter[c]);
		}
		return this.runSelectQuery(
			`SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY rowid ASC`,
			params,
		);
	}

	async deleteValues(tableName, filter = null) {
		const params = [];
		let whereClause = "1 = 1";
		if (filter && Object.keys(filter).length > 0) {
			const filterColumns = Object.keys(filter);
			whereClause = filterColumns.map(c => `${c} = ?`).join(" AND ");
			for (const c of filterColumns) params.push(filter[c]);
		}
		return this.runQuery(`DELETE FROM ${tableName} WHERE ${whereClause}`, params);
	}

	/**
	 * Runs fn() inside BEGIN/COMMIT, rolling back on any error so a failed action
	 * leaves no partial state (the equivalent of a Solidity revert).
	 */
	async withTransaction(fn) {
		await this.runQuery("BEGIN IMMEDIATE TRANSACTION");
		try {
			const result = await fn();
			await this.runQuery("COMMIT");
			return result;
		} catch (error) {
			try {
				await this.runQuery("ROLLBACK");
			} catch (rollbackError) {
				console.error("[dbHandler] Rollback failed:", rollbackError.message);
			}
			throw error;
		}
	}

	async getLastRecord(tableName) {
		return this.getRecord(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 1`);
	}

	async findById(tableName, id) {
		return this.getRecord(`SELECT * FROM ${tableName} WHERE Id = ?`, [id]);
	}
}

module.exports = {
	SqliteDatabase,
	DataTypes,
};
