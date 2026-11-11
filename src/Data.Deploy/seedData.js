/**
 * Demo data ported from the Web2 src/seed.js. Everything here is static so every
 * node seeds byte-identical rows; review dates are offsets from the consensus timestamp.
 */
const PRODUCTS = [
	["Aurora Wireless Headphones", "Over-ear Bluetooth headphones with active noise cancelling and 40-hour battery life.", "Electronics", 149.99],
	["Pulse Smartwatch S2", "Fitness tracking, heart-rate monitoring, GPS and 7-day battery in a slim aluminium case.", "Electronics", 199.0],
	["Nimbus Portable Speaker", "Waterproof (IP67) speaker with 360° sound and 20-hour playtime.", "Electronics", 79.5],
	["Ceylon Single-Estate Tea", "Hand-picked high-grown black tea from Nuwara Eliya. 250 g loose leaf.", "Grocery", 12.9],
	["Cold-Pressed Coconut Oil", "Organic virgin coconut oil, 500 ml glass jar.", "Grocery", 9.75],
	["Trailblazer Running Shoes", "Lightweight cushioned running shoes with breathable mesh upper.", "Sports", 89.0],
	["Yoga Mat Pro 6mm", "Non-slip, eco-friendly TPE mat with alignment lines and carry strap.", "Sports", 34.99],
	["Atlas Backpack 30L", "Laptop backpack with padded 16\" sleeve, rain cover and USB charging port.", "Accessories", 59.0],
	["Classic Leather Wallet", "Full-grain leather bi-fold wallet with RFID blocking.", "Accessories", 39.0],
	["Barista Pour-Over Kit", "Glass dripper, gooseneck kettle and 100 paper filters.", "Home & Kitchen", 64.0],
	["Cast Iron Skillet 26cm", "Pre-seasoned cast iron pan, oven-safe to 260 °C.", "Home & Kitchen", 42.5],
	["LED Desk Lamp", "Dimmable lamp with 5 colour temperatures and wireless charging base.", "Home & Kitchen", 45.0],
];

// Demo reviewers own the demo reviews only. Their identifiers are not Ed25519 keys,
// so nobody can sign in as them (the Web2 version gave them random unknown passwords).
const REVIEWERS = ["Amaya Perera", "Kasun Silva", "Nadia Fernando", "Ravi Jayasinghe", "Dilini Wickrama", "Tharindu Bandara"];

const SNIPPETS = {
	5: [["Absolutely love it", "Exceeded my expectations. Would buy again without hesitation."], ["Five stars", "Great quality and fast delivery."]],
	4: [["Very good", "Does everything I need. Minor nitpicks but overall excellent."], ["Solid choice", "Good value for the price."]],
	3: [["It's okay", "Works as described but nothing special."], ["Average", "Decent, though I expected a bit more."]],
	2: [["Disappointed", "Quality isn't what I hoped for."], ["Not great", "Had some issues after a couple of weeks."]],
	1: [["Would not recommend", "Stopped working almost immediately."]],
};

// Deterministic spread so products rank differently (same as the Web2 seed).
const BIAS = [5, 4, 4, 5, 3, 4, 5, 3, 4, 5, 4, 2];

function demoReviewerKey(name) {
	return `demo:${name.split(" ")[0].toLowerCase()}`;
}

/**
 * Returns the reviews to seed for product index i: { reviewerIndex, rating, title, body, daysAgo }.
 */
function reviewsForProduct(i) {
	const result = [];
	const count = (i * 7 + 3) % (REVIEWERS.length + 1); // 0-6 reviews, a few products with none
	for (let k = 0; k < count; k++) {
		const rating = Math.min(5, Math.max(1, BIAS[i] + ((k * 3 + i) % 3) - 1));
		const options = SNIPPETS[rating];
		const [title, body] = options[(i + k) % options.length];
		result.push({ reviewerIndex: k, rating, title, body, daysAgo: (i * 3 + k * 5) % 60 });
	}
	return result;
}

module.exports = { PRODUCTS, REVIEWERS, SNIPPETS, demoReviewerKey, reviewsForProduct };
