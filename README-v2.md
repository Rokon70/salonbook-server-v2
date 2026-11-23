# SalonBook API v2

Separate copy of the Express API paired with `salonbook-client-v2`. The original `salonbook-server` is untouched.

- Folder: `salonbook-server-v2`
- Local port: `5001` (original API keeps `5000`)
- Client pairing: `salonbook-client-v2` on `http://localhost:3001`

## Run locally

```bash
cd salonbook-server-v2
copy .env.example .env   # then fill in the real values
npm install              # skip if node_modules is already linked
npm run dev              # http://localhost:5001
```

Important env values for the local v2 stack:

```env
PORT=5001
CLIENT_URL=http://localhost:3001,https://salonbook-client-gamma-three.vercel.app
AUTH_URL=https://salonbook-client-gamma-three.vercel.app
```

`AUTH_URL` must stay identical to the client's `BETTER_AUTH_URL`, because JWTs are verified against `${AUTH_URL}/api/auth/jwks`. `CLIENT_URL` may contain several comma-separated origins so both the v2 preview (`3001`) and the deployed client are allowed by CORS.

## Pair with client v2

In `salonbook-client-v2/.env.local`:

```env
NEXT_PUBLIC_API_URL=/server-api
API_UPSTREAM=http://localhost:5001/api
```

The client's Next.js proxy forwards `/server-api/*` to this server, so browser CORS is not an issue.

## ZIP contents

`salonbook-server-v2.zip` contains source only. Excluded: `node_modules`, `.git`, `.env` (secrets — use `.env.example`).
