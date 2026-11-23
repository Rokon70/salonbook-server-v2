# SalonBook – Server

REST API for the SalonBook salon appointment booking platform.

**Client repository:** https://github.com/Rokon70/salonbook-client · **Live API:** `<add live API link>` · **Live website:** `<add live website link>`

## Important Features
- Services CRUD (admin), public active-service listing with **search, category filter and price sorting**
- Appointment requests with status workflow (pending → confirmed / cancelled) and **double-booking prevention**
- **JWT verification middleware** (tokens issued by Better Auth, verified against its JWKS endpoint)
- **Server-side role checks** on every protected route + blocked-user enforcement
- **Stripe Checkout** + **verified webhook** – payment status changes only after a signed Stripe event
- Read-only transactions for admin, user management (block / unblock), secure profile update (whitelisted fields)
- ImgBB image upload proxy (API key stays on the server)

## Technology Stack
Node.js, Express.js, MongoDB (native driver), jose (JWT), Stripe, Multer, ImgBB

## Installation
```bash
git clone https://github.com/Rokon70/salonbook-server.git
cd salonbook-server
npm install
cp .env.example .env   # then fill in the values
```

## Run Locally
```bash
npm run dev          # http://localhost:5000
npm run seed         # optional: insert sample services
npm run make-admin -- admin@example.com   # after that email signed up on the client
```
Stripe webhook locally:
```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```
Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

## Required Environment Variables (names only)
`PORT`, `MONGODB_URI`, `MONGODB_DB`, `CLIENT_URL`, `AUTH_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CURRENCY`, `IMGBB_API_KEY`

## API Overview
| Method | Route | Access |
|---|---|---|
| GET | `/api/services` `?search=&category=&sort=price_asc\|price_desc` | Public |
| GET | `/api/services/categories` | Public |
| GET | `/api/services/:id` | Logged in |
| POST/PUT/DELETE/PATCH | `/api/services…` | Admin |
| POST | `/api/appointments` | Customer |
| GET | `/api/appointments/mine` | Customer |
| PATCH | `/api/appointments/:id/cancel` | Customer (own pending) / Admin |
| GET / PATCH | `/api/appointments`, `/:id/confirm` | Admin |
| POST | `/api/payments/checkout/:appointmentId` | Customer |
| POST | `/api/payments/webhook` | Stripe only (signature verified) |
| GET | `/api/payments/transactions` | Admin |
| GET / PATCH | `/api/users`, `/:id/block`, `/:id/unblock` | Admin |
| GET / PATCH | `/api/profile` | Logged in |
| GET | `/api/stats/customer`, `/api/stats/admin` | Customer / Admin |

## Deployment (Vercel)
`vercel.json` + `api/index.js` are included. Add all environment variables in the Vercel dashboard and register
`https://<your-api>/api/payments/webhook` in the Stripe dashboard (events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`).
