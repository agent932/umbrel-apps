export APP_PIRATE_CRIBBAGE_PORT="8121"

# Password for the bundled Postgres database.
export APP_PIRATE_CRIBBAGE_DB_PASSWORD="$(derive_entropy "env-${app_entropy_identifier}-DB_PASSWORD" | head -c32)"

# Signs player session cookies. Must not change across restarts or everyone is logged out.
export APP_PIRATE_CRIBBAGE_SESSION_SECRET="$(derive_entropy "env-${app_entropy_identifier}-SESSION_SECRET" | head -c64)"
