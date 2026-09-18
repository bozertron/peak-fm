#!/usr/bin/env bash
# Can an unauthenticated GET discriminate WHICH config fault is active,
# without access to server logs? Tests better-auth's built-in /ok endpoint.
cd /home/user/peak-Integration
SP=/tmp/claude-0/-home-user-peak-Integration/f107ef70-8801-5ebb-b585-8d8251d97f1a/scratchpad
[ -f .env.local ] && mv .env.local "$SP/env.local.bak"
restore() { [ -f "$SP/env.local.bak" ] && mv "$SP/env.local.bak" .env.local; }
trap restore EXIT

GOOD_DB="postgres://peak:peak@127.0.0.1:5432/peak"
EMPTY_DB="postgres://peak:peak@127.0.0.1:5432/peak_empty"
SECRET="$(openssl rand -base64 32)"

run() {
  local name="$1" port="$2"; shift 2
  local log="$SP/probe-$name.log"
  env -u BETTER_AUTH_SECRET -u DATABASE_URL -u BETTER_AUTH_URL "$@" \
    node node_modules/next/dist/bin/next start -p "$port" > "$log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 40); do
    curl -s -o /dev/null --noproxy '*' --max-time 2 "http://localhost:$port/" && break; sleep 0.5
  done
  printf "%-22s  /ok=%s  %-28s | sign-up=%s | GET /=%s\n" "$name" \
    "$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 20 "http://localhost:$port/api/auth/ok")" \
    "$(curl -s --noproxy '*' --max-time 20 "http://localhost:$port/api/auth/ok" | head -c 26)" \
    "$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 20 -X POST "http://localhost:$port/api/auth/sign-up/email" -H 'Content-Type: application/json' -d '{"email":"p@example.com","password":"correct-horse-battery-staple","name":"P"}')" \
    "$(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 20 "http://localhost:$port/")"
  kill $pid 2>/dev/null; wait $pid 2>/dev/null; sleep 1
}

echo "scenario                probe results"
echo "----------------------------------------------------------------------------------------"
run "1-HEALTHY"        3220 BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$GOOD_DB"
run "3-NO-SECRET"      3222 DATABASE_URL="$GOOD_DB"
run "4-NO-DATABASE-URL" 3223 BETTER_AUTH_SECRET="$SECRET"
run "5-TABLES-MISSING" 3224 BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$EMPTY_DB"
