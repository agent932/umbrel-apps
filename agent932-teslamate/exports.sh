export APP_TESLAMATE_PORT="8841"
export APP_TESLAMATE_GRAFANA_PORT="8842"
export APP_TESLAMATE_MQTT_PORT="1884"

# Password for the bundled Postgres database.
export APP_TESLAMATE_DB_PASSWORD="$(derive_entropy "env-${app_entropy_identifier}-DB_PASSWORD" | head -c32)"

# Key TeslaMate uses to encrypt the Tesla API tokens it stores in the database.
# This must not change across restarts or the stored tokens become unreadable.
export APP_TESLAMATE_ENCRYPTION_KEY="$(derive_entropy "env-${app_entropy_identifier}-ENCRYPTION_KEY" | head -c64)"
