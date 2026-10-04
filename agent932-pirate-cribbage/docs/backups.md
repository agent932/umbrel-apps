# Backups

The Umbrel app runs a small `backup` service that saves a copy of the game database every day:
accounts, friends, the Ship's Log, achievements, settings and any game in progress.

- **Where:** `~/umbrel/app-data/agent932-pirate-cribbage/data/backups/` on your Umbrel
  (one file per day, `pirate_cribbage-YYYY-MM-DD.dump`).
- **How many:** the last 14 days. Older copies are deleted automatically.
- **When:** two minutes after the app starts, then every 24 hours.

For extra safety, copy that folder somewhere off the Umbrel now and then (another computer or a USB drive).

## Restoring a backup

Do this from a terminal on the Umbrel (Settings → Advanced settings → Terminal → umbrelOS, or SSH).
It replaces everything in the game with the contents of the backup.

```bash
cd ~/umbrel/app-data/agent932-pirate-cribbage/data/backups
ls -1t   # pick a file, newest first
sudo docker cp pirate_cribbage-2026-10-04.dump agent932-pirate-cribbage_database_1:/tmp/restore.dump
sudo docker exec agent932-pirate-cribbage_database_1 pg_restore -U pirate -d pirate_cribbage --clean --if-exists --no-owner /tmp/restore.dump
```

Then restart the app from the Umbrel dashboard so everyone reconnects to the restored data.
