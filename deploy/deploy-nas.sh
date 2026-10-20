#!/usr/bin/env bash
# Build Hearth and ship it to the NAS PocketBase (container "hearth") and the
# push sidecar (container "hearth-push").
#
#   deploy/deploy-nas.sh
#
# The app is served by PocketBase from pb_public (same origin as the API),
# so PUBLIC_POCKETBASE_URL is blanked for the build. Migrations run and
# hooks load when the container restarts.
set -euo pipefail

NAS="${NAS:-agent@192.168.1.69}"
APPDIR="${APPDIR:-/volume1/docker/appdata/hearth}"
STACKS="/volume1/docker/stacks"

cd "$(dirname "$0")/.."

SSH=(ssh -o BatchMode=yes -o ServerAliveInterval=15 -o LogLevel=ERROR)

echo "==> build"
PUBLIC_POCKETBASE_URL= pnpm build >/dev/null

echo "==> upload pb_public + pb_migrations + pb_hooks + push"
tar -C build -cz . | "${SSH[@]}" "$NAS" \
	"rm -rf '$APPDIR/pb_public.new' && mkdir -p '$APPDIR/pb_public.new' && tar -xz -C '$APPDIR/pb_public.new'"
tar -C deploy/pb_migrations -cz --exclude='*.d.ts' . | "${SSH[@]}" "$NAS" \
	"mkdir -p '$APPDIR/pb_migrations' && tar -xz -C '$APPDIR/pb_migrations'"
# Hooks are replaced wholesale so a deleted hook file stops running.
tar -C deploy/pb_hooks -cz --exclude='*.d.ts' . | "${SSH[@]}" "$NAS" \
	"rm -rf '$APPDIR/pb_hooks.new' && mkdir -p '$APPDIR/pb_hooks.new' && tar -xz -C '$APPDIR/pb_hooks.new' && rm -rf '$APPDIR/pb_hooks' && mv '$APPDIR/pb_hooks.new' '$APPDIR/pb_hooks'"
tar -C deploy/push -cz --exclude=node_modules . | "${SSH[@]}" "$NAS" \
	"rm -rf '$APPDIR/push' && mkdir -p '$APPDIR/push' && tar -xz -C '$APPDIR/push'"

echo "==> swap + restart"
"${SSH[@]}" "$NAS" "set -e; cd '$APPDIR' && rm -rf pb_public.old && { [ -d pb_public ] && mv pb_public pb_public.old || true; } && mv pb_public.new pb_public && rm -rf pb_public.old
cd '$STACKS' && docker compose restart hearth >/dev/null 2>&1 && sleep 3 && docker compose ps hearth --format '{{.Name}} {{.Status}}'
if docker compose config --services | grep -qx hearth-push; then
	docker compose up -d --build hearth-push >/dev/null 2>&1 && docker compose ps hearth-push --format '{{.Name}} {{.Status}}'
else
	echo 'hearth-push not in compose; skipping (no phone notifications)'
fi"

echo "==> done: https://hearth.tail88cd42.ts.net"
