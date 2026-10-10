#!/bin/sh
# Certbot runs this on ordinarydata each time it renews a certificate. When the one renewed is the
# relay's, it is copied to where Caddy can read it. Installed as
# /etc/letsencrypt/renewal-hooks/deploy/endless-relay.sh; see deploy/README.md.
[ "$RENEWED_LINEAGE" = /etc/letsencrypt/live/relay.endlessmind.com ] || exit 0
install -d -o caddy -g caddy -m 750 /etc/caddy/certs
install -o caddy -g caddy -m 640 "$RENEWED_LINEAGE/fullchain.pem" /etc/caddy/certs/relay.endlessmind.com.pem
install -o caddy -g caddy -m 640 "$RENEWED_LINEAGE/privkey.pem" /etc/caddy/certs/relay.endlessmind.com.key
systemctl reload caddy
