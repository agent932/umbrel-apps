# Backups

The Umbrel app runs a small `backup` service that saves a copy of the game database every day:
accounts, friends, the Ship's Log, achievements, doubloons, the boards and card backs players own,
settings and any game in progress.

- **Where:** `~/umbrel/app-data/agent932-pirate-cribbage/data/backups/` on your Umbrel
  (one file per day, `pirate_cribbage-YYYY-MM-DD.dump`).
- **How many:** the last 14 days. Older copies are deleted automatically.
- **When:** two minutes after the app starts, then every 24 hours.

For extra safety, copy that folder somewhere off the Umbrel now and then (another computer or a USB drive).

## Before you update the app

An update can change the database (new features bring new tables). The daily backup runs two
minutes after the updated app starts, so it is taken after that change, and it replaces any copy
made earlier the same day. So take a copy by hand just before you update:

```bash
sudo docker inspect --format '{{.Config.Image}} {{.Image}}' agent932-pirate-cribbage_web_1   # note the version running now
sudo docker exec agent932-pirate-cribbage_database_1 pg_dump -U pirate -d pirate_cribbage -Fc -f /tmp/before-update.dump
sudo docker cp agent932-pirate-cribbage_database_1:/tmp/before-update.dump ~/before-update.dump
```

Then copy `~/before-update.dump` off the Umbrel too.

## Restoring a backup

Do this from a terminal on the Umbrel (Settings → Advanced settings → Terminal → umbrelOS, or SSH).
It replaces everything in the game with the contents of the backup: the database is emptied first,
then the backup goes into it. If you might want today's data back, take a copy first (as above).

Don't restore with `pg_restore --clean` (earlier versions of this guide said to). On a database
that a newer version of the app has changed, it can't remove everything: the restore stops
partway, players' doubloons no longer match their history, and the app may not start.

```bash
cd ~/umbrel/app-data/agent932-pirate-cribbage/data/backups
ls -1t   # pick a file, newest first (or use the copy you made before an update)
sudo docker stop agent932-pirate-cribbage_web_1   # nobody plays while you restore
sudo docker exec agent932-pirate-cribbage_database_1 dropdb -U pirate --force pirate_cribbage
sudo docker exec agent932-pirate-cribbage_database_1 createdb -U pirate pirate_cribbage
sudo docker cp pirate_cribbage-2026-10-04.dump agent932-pirate-cribbage_database_1:/tmp/restore.dump
sudo docker exec agent932-pirate-cribbage_database_1 pg_restore -U pirate -d pirate_cribbage --no-owner --exit-on-error /tmp/restore.dump
```

Then check that every player's doubloons match their history. This must print no rows:

```bash
sudo docker exec agent932-pirate-cribbage_database_1 psql -U pirate -d pirate_cribbage -c \
  "select u.username, u.doubloons, coalesce(sum(l.delta), 0) as ledger from users u left join wallet_ledger l on l.user_id = u.id group by u.id having u.doubloons <> coalesce(sum(l.delta), 0)"
```

For a backup made by version 0.33.0 or later (it has the shop), also check that every purchase
has its item. This must print a count of 0:

```bash
sudo docker exec agent932-pirate-cribbage_database_1 psql -U pirate -d pirate_cribbage -c \
  "select count(*) from wallet_ledger l where reason = 'purchase' and not exists (select 1 from inventory i where i.user_id = l.user_id and i.item_id = l.ref_id)"
```

If `pg_restore` stops with an error or a check fails, don't start the app yet: run the steps again
from `dropdb`, with an earlier backup if it fails again.

Then restart the app from the Umbrel dashboard so everyone reconnects to the restored data.

### Backups from an older version

A backup made by an older version works with the version you run now: when the app starts, it
brings the database up to date. New features start empty; balances and history are as they were
in the backup. To run the older version itself again, restore the copy you made before the update
and pin the app to the image you noted then.
