/// <reference path="../pb_data/types.d.ts" />
// The client creates a split-of-one-occurrence as one PocketBase batch
// request (series exceptions update + standalone event create), so the
// family never briefly sees both or neither. Batch requests are disabled
// by default in PocketBase settings; without this the whole op fails with
// 403 "Batch requests are not allowed." and the sheet shows "The home
// server didn't accept this."
//
// Individual record writes stay behind their own API rules — enabling
// batch only lets a client submit two rule-enforced requests in one round
// trip, it does not weaken the rules themselves.

migrate(
	(app) => {
		app.settings().batch.enabled = true;
		app.save(app.settings());
	},
	(app) => {
		app.settings().batch.enabled = false;
		app.save(app.settings());
	}
);
