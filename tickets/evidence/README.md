# Reproduction evidence — sign-in 500 (AREA-109)

Controlled local reproduction of the `POST /api/auth/sign-in/email` 500
reported against the v0.build preview. One environment variable changed per
scenario, against a production build (`next start`).

- `experiment.sh` — five scenarios; captures HTTP status, response body, and
  server stderr.
- `probe.sh` — tests whether an unauthenticated `GET /api/auth/ok` can
  discriminate healthy from broken without server logs.
- `scn-*.log` — filtered server stderr per scenario. The two CONTROL logs are
  empty because a healthy server logs nothing on sign-in.

Both scripts generate a throwaway secret with `openssl rand` at runtime and
move `.env.local` aside so each scenario's environment is exact; they restore
it on exit via a trap. They contain no secret values.

Re-run from the repo root after `./scripts/dev-setup.sh`. `experiment.sh`
additionally expects a `peak_empty` database (no tables) and an account
`matrix@example.com`; see AREA-109 for how these were created.

Result summary is tabled in `../wave-3/AREA-109-signin-500-root-cause.md`.
