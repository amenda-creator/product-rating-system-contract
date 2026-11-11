// Service names routed by src/controller.js (matched case-sensitively against message.Service).
const ServiceTypes = Object.freeze({
	HEALTH: "Health",
	USER: "User",
	PRODUCT: "Product",
	REVIEW: "Review",
	UPGRADE: "Upgrade",
	CLUSTER: "Cluster",
});

const HealthActions = Object.freeze({
	HEALTH_CHECK: "HealthCheck",
});

// /api/auth/register, /api/auth/me (login is replaced by the HotPocket key handshake).
const UserActions = Object.freeze({
	REGISTER: "Register",
	GET_ME: "GetMe",
	UPDATE_PROFILE: "UpdateProfile",
	GET_USERS: "GetUsers",
	SET_USER_ROLE: "SetUserRole",
});

// /api/products routes.
const ProductActions = Object.freeze({
	LIST_PRODUCTS: "ListProducts",
	GET_CATEGORIES: "GetCategories",
	GET_PRODUCT: "GetProduct",
	CREATE_PRODUCT: "CreateProduct",
	UPDATE_PRODUCT: "UpdateProduct",
	DELETE_PRODUCT: "DeleteProduct",
});

// /api/products/:id/reviews and /api/reviews routes.
const ReviewActions = Object.freeze({
	LIST_REVIEWS: "ListReviews",
	GET_REVIEW: "GetReview",
	CREATE_REVIEW: "CreateReview",
	UPDATE_REVIEW: "UpdateReview",
	DELETE_REVIEW: "DeleteReview",
	VOTE_HELPFUL: "VoteHelpful",
	UNVOTE_HELPFUL: "UnvoteHelpful",
});

const UpgradeActions = Object.freeze({
	UPGRADE_CONTRACT: "UpgradeContract",
});

const ClusterActions = Object.freeze({
	UPDATE_CLUSTER_CONFIG: "UpdateClusterConfig",
	GET_CLUSTER_UNL: "GetClusterUnl",
	GET_CONTRACT_VERSION: "GetContractVersion",
	UPDATE_CLUSTER_DETAILS: "UpdateClusterDetails",
});

const Tables = Object.freeze({
	SQLSCRIPTMIGRATIONS: "SqlScriptMigrations",
	CONTRACTVERSION: "ContractVersion",
	ContractVersion: "ContractVersion",
	USERS: "Users",
	PRODUCTS: "Products",
	REVIEWS: "Reviews",
	REVIEW_VOTES: "ReviewVotes",
	ACTIVITY_LOG: "ActivityLog",
});

const Roles = Object.freeze({
	USER: "user",
	ADMIN: "admin",
});

// ORDER BY clauses of the Web2 product list (score is the Bayesian average).
const ProductSorts = Object.freeze({
	rating: "Score DESC, ReviewCount DESC, p.Id ASC",
	reviews: "ReviewCount DESC, Score DESC, p.Id ASC",
	newest: "p.CreatedOn DESC, p.Id DESC",
	price_asc: "p.PriceCents ASC, p.Id ASC",
	price_desc: "p.PriceCents DESC, p.Id ASC",
	name: "p.Name COLLATE NOCASE ASC, p.Id ASC",
});

// ORDER BY clauses of the Web2 review list.
const ReviewSorts = Object.freeze({
	newest: "rv.CreatedOn DESC, rv.Id DESC",
	helpful: "HelpfulCount DESC, rv.CreatedOn DESC, rv.Id DESC",
	highest: "rv.Rating DESC, rv.CreatedOn DESC, rv.Id DESC",
	lowest: "rv.Rating ASC, rv.CreatedOn DESC, rv.Id DESC",
});

const ActivityTypes = Object.freeze({
	USER_REGISTERED: "UserRegistered",
	PROFILE_UPDATED: "ProfileUpdated",
	ROLE_CHANGED: "RoleChanged",
	PRODUCT_CREATED: "ProductCreated",
	PRODUCT_UPDATED: "ProductUpdated",
	PRODUCT_DELETED: "ProductDeleted",
	REVIEW_CREATED: "ReviewCreated",
	REVIEW_UPDATED: "ReviewUpdated",
	REVIEW_DELETED: "ReviewDeleted",
	REVIEW_VOTED: "ReviewVoted",
	REVIEW_UNVOTED: "ReviewUnvoted",
	DATA_SEEDED: "DemoDataSeeded",
});

// HTTP status codes of the Web2 API, kept as response codes.
const ResponseCodes = Object.freeze({
	OK: 200,
	CREATED: 201,
	NO_CONTENT: 204,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL_SERVER_ERROR: 500,
});

module.exports = {
	ServiceTypes,
	HealthActions,
	UserActions,
	ProductActions,
	ReviewActions,
	UpgradeActions,
	ClusterActions,
	Tables,
	Roles,
	ProductSorts,
	ReviewSorts,
	ActivityTypes,
	ResponseCodes,
};
