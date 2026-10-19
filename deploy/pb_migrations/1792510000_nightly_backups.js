/// <reference path="../pb_data/types.d.ts" />
// Nightly consistent PocketBase backup (zip in pb_data/backups).
// PocketBase cron runs in UTC: 01:00 UTC = 03:00 CEST / 02:00 CET, before the
// NAS appdata archive at 03:30 local picks the zip up.
migrate(
	(app) => {
		const settings = app.settings();
		settings.backups.cron = '0 1 * * *';
		settings.backups.cronMaxKeep = 7;
		app.save(settings);
	},
	(app) => {
		const settings = app.settings();
		settings.backups.cron = '';
		settings.backups.cronMaxKeep = 3;
		app.save(settings);
	}
);
