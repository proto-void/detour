#!/bin/sh
# Ensure server key permissions work inside the Postgres container.
chmod 600 /certs/server.key 2>/dev/null || true
