# SalonBook v2 — Vercel deploy guide (বাংলা)

> amar kache Vercel access nai, tai deploy tumik-e korte hobe. Purono `salonbook-client` / `salonbook-server` ke **touch kortei hobe na**.

---

## Step 0 — Purono values ready koro

Purono Environment Variables copy koro (Vercel dashboard → purono project → Settings → Environment Variables, ba local file theke):

- `salonbook-client/.env.local` → MongoDB URI, `BETTER_AUTH_SECRET`, Google Client ID/Secret
- `salonbook-server/.env` → MongoDB URI, Stripe keys, `IMGBB_API_KEY`

⚠️ Eigulo **GitHub-e commit koro na**. Shudu Vercel dashboard-e paste koro.

---

## Step 1 — GitHub-e dui repo bano

1. GitHub → **New repository**
   - `salonbook-server-v2`
   - `salonbook-client-v2`
2. Duto repo **Private** rakha bhalo (secret env thake dashboard-e, repo-te nai).
3. Local-e push koro (PowerShell):

```powershell
cd "C:\Users\teame\Desktop\Salon book\salonbook-server-v2"
git init
git add .
git status
git commit -m "SalonBook API v2"
git remote add origin https://github.com/<TUMI>/salonbook-server-v2.git
git branch -M main
git push -u origin main
```

```powershell
cd "C:\Users\teame\Desktop\Salon book\salonbook-client-v2"
git init
git add .
git status
git commit -m "SalonBook client v2 redesign"
git remote add origin https://github.com/<TUMI>/salonbook-client-v2.git
git branch -M main
git push -u origin main
```

`git status`-এ `.env` ba `.env.local` dekha gele **commit koro na** — `.gitignore`-e thakle o onek bar check kora bhalo.

> Jodi dui folder ek-i repo-te rakho, tahole Vercel-e **Root Directory** set korte hobe: `salonbook-server-v2` / `salonbook-client-v2`. Alada repo hole root directory blank-i chalbe.

---

## Step 2 — SERVER v2 deploy koro (prothome)

Vercel → **Add New → Project** → `salonbook-server-v2` import koro.

- Framework Preset: **Other** / Node.js
- Build Command: blank
- Output Directory: blank
- Root Directory: alada repo hole blank, monorepo hole `salonbook-server-v2`

### Environment Variables (Production + Preview)

| Name | Value |
| --- | --- |
| `MONGODB_URI` | purono MongoDB URI |
| `MONGODB_DB` | `salonbook` |
| `CLIENT_URL` | `https://<NEW-CLIENT>.vercel.app` |
| `AUTH_URL` | `https://<NEW-CLIENT>.vercel.app` |
| `STRIPE_SECRET_KEY` | purono Stripe key |
| `STRIPE_WEBHOOK_SECRET` | purono webhook secret (Step 5-e update hote pare) |
| `CURRENCY` | `usd` |
| `IMGBB_API_KEY` | purono ImgBB key |

🔴 `AUTH_URL` **exact same** hote hobe new client er `BETTER_AUTH_URL`-er sathe. Ekhane old client URL dile JWT 401 error debe.

**Deploy** chapo. Tarpor:

- Settings → **Deployment Protection** → **Vercel Authentication: Disabled**
- Test koro: `https://<NEW-SERVER>.vercel.app/` → `{"name":"SalonBook API","status":"ok"}`
- Test koro: `https://<NEW-SERVER>.vercel.app/api/services` → 200

Server URL record koro: `https://<NEW-SERVER>.vercel.app`

---

## Step 3 — CLIENT v2 deploy koro

Vercel → **Add New → Project** → `salonbook-client-v2` import koro.

- Framework Preset: **Next.js** (auto-detect hobe)
- Root Directory: alada repo hole blank, monorepo hole `salonbook-client-v2`

### Environment Variables

| Name | Value | Type |
| --- | --- | --- |
| `MONGODB_URI` | purono MongoDB URI | Config/Secret |
| `MONGODB_DB` | `salonbook` | Config |
| `BETTER_AUTH_SECRET` | **purono exact secret** | Secret |
| `BETTER_AUTH_URL` | `https://<NEW-CLIENT>.vercel.app` | Config |
| `NEXT_PUBLIC_API_URL` | `/server-api` | **Config (Secret na)** |
| `API_UPSTREAM` | `https://<NEW-SERVER>.vercel.app/api` | Config/Secret |
| `GOOGLE_CLIENT_ID` | purono client id | Config |
| `GOOGLE_CLIENT_SECRET` | purono client secret | Secret |

🔴 `NEXT_PUBLIC_API_URL` ke **Config** rakhte hobe. Secret kora hole build-e value undefined hobe (agor bar ei samasya hoyechil).

**Deploy** chapo. Tarpor new client URL record koro: `https://<NEW-CLIENT>.vercel.app`.

---

## Step 4 — Google OAuth update

Google Cloud Console → APIs & Services → Credentials → OAuth client → **Authorized redirect URIs**:

```text
https://<NEW-CLIENT>.vercel.app/api/auth/callback/google
```

Purono redirect URI rakhe rakhleo chalbe. Save koro.

---

## Step 5 — Stripe webhook update (payment use korle)

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

```text
https://<NEW-SERVER>.vercel.app/api/payments/webhook
```

Event: `checkout.session.completed`

Naya **Signing secret** copy kore server-er `STRIPE_WEBHOOK_SECRET`-e boso → **server redeploy** koro.

---

## Step 6 — Test koro

| Test | Expected |
| --- | --- |
| `https://<NEW-CLIENT>.vercel.app/` | Home + 6 featured service card |
| `/services` | 8 service, filter/search chalbe |
| `/signin` → admin login | `/dashboard/admin`-e redirect |
| Dashboard | Stat cards data show korbe |
| `/forgot-password` | Helper page dekha jabe |

---

## Step 7 — Custom domain (optional)

Domain add korle **tin jaygay** badal korte hobe, tarpor duto project redeploy:

- Client: `BETTER_AUTH_URL`
- Server: `AUTH_URL`
- Server: `CLIENT_URL`

Example: `https://book.yourdomain.com` → tinei same value.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `401 Invalid or expired token` | `AUTH_URL` ≠ `BETTER_AUTH_URL` — mile koro, server redeploy |
| `Invalid origin` | Client er `BETTER_AUTH_URL` exact new domain kina dekho |
| `Cannot reach the server` | `API_UPSTREAM` wrong ba server Deployment Protection on |
| API 403/404 | Server `vercel.json` + `api/index.js` commit hoyeche kina dekho |
| `NEXT_PUBLIC_*` undefined | Vercel-e Type **Config** koro, redeploy |
| Purono login break | Kichu change korte hobe na — purono project alada-i achhe |

---

## Purono app-er koto change hobe?

**Kichui na.** Purono `salonbook-client` + `salonbook-server` Vercel project alada thakbe. Same MongoDB use koray **data sob dekha jabe**, kintu purono login link/URL old-i thakbe.
