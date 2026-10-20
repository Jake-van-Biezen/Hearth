/// <reference path="../pb_data/types.d.ts" />
// JSONField records read back through the Go API as the raw JSON *bytes*
// (e.g. [91,123,...]), not a parsed array. decodeList turns those bytes (or
// an already-decoded array) into a real list.

function decodeList(value) {
	if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'number')) {
		let s = '';
		for (let i = 0; i < value.length; i++) s += String.fromCharCode(value[i]);
		try {
			return JSON.parse(s);
		} catch {
			return [];
		}
	}
	return Array.isArray(value) ? value : [];
}

module.exports = { jsonList: decodeList };
