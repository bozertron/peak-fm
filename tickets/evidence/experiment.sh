#!/usr/bin/env bash
# Controlled reproduction of the /api/auth/sign-in/email 500.
# One variable changed per scenario. Captures HTTP status, response body,
# and the server-side stderr that the incident report says is missing.
cd /home/user/peak-Integration
SP=/tmp/claude-0/-home-user-peak-Integration/f107ef70-8801-5ebb-b585-8d8251d97f1a/scratchpad

# next start auto-loads .env.local; move it aside so each scenario's env is exact.
[ -f .env.local ] && mv .env.local "$SP/env.local.bak"
restore() { [ -f "$SP/env.local.bak" ] && mv "$SP/env.local.bak" .env.local; }
trap restore EXIT

GOOD_DB="postgres://peak:peak@127.0.0.1:5432/peak"
EMPTY_DB="postgres://peak:peak@127.0.0.1:5432/peak_empty"
SECRET="$(openssl rand -base64 32)"
CREDS='{"email":"matrix@example.com","password":"correct-horse-battery-staple"}'
BADPW='{"email":"matrix@example.com","password":"wrong-password-entirely"}'

run() {
  local name="$1" port="$2" body="$3"; shift 3
  local log="$SP/scn-$name.log"
  : > "$log"
  env -u BETTER_AUTH_SECRET -u DATABASE_URL -u BETTER_AUTH_URL "$@" \
    node node_modules/next/dist/bin/next start -p "$port" > "$log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 40); do
    curl -s -o /dev/null --noproxy '*' --max-time 2 "http://localhost:$port/" && break
    sleep 0.5
  done
  local out
  out=$(curl -s --noproxy '*' --max-time 25 -X POST \
        "http://localhost:$port/api/auth/sign-in/email" \
        -H 'Content-Type: application/json' -d "$body" \
        -w '\n__STATUS__%{http_code}')
  echo "=================================================================="
  echo "SCENARIO: $name"
  echo "HTTP STATUS : $(echo "$out" | grep -o '__STATUS__.*' | sed 's/__STATUS__//')"
  echo "RESPONSE    : $(echo "$out" | grep -v '__STATUS__' | head -c 300)"
  echo "SERVER STDERR (what the incident report is missing):"
  grep -iE 'error|betterauth|econnrefused|relation|does not exist|secret' "$log" \
    | grep -v 'next start' | head -4 | sed 's/^/   > /'
  [ -z "$(grep -iE 'error|betterauth|econnrefused|relation|secret' "$log" | head -1)" ] && echo "   > (none)"
  kill $pid 2>/dev/null
  wait $pid 2>/dev/null
  sleep 1
}

run "1-CONTROL-valid-creds"   3210 "$CREDS" BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$GOOD_DB"
run "2-CONTROL-wrong-password" 3211 "$BADPW" BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$GOOD_DB"
run "3-NO-SECRET"             3212 "$CREDS" DATABASE_URL="$GOOD_DB"
run "4-NO-DATABASE-URL"       3213 "$CREDS" BETTER_AUTH_SECRET="$SECRET"
run "5-TABLES-MISSING"        3214 "$CREDS" BETTER_AUTH_SECRET="$SECRET" DATABASE_URL="$EMPTY_DB"
echo "=================================================================="
