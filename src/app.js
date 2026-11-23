import dns from "node:dns";

if (!process.env.VERCEL) dns.setServers(["8.8.8.8", "1.1.1.1"]);
import "dotenv/config";
import express from "express";
import cors from "cors";
import servicesRouter from "./routes/services.js";
import appointmentsRouter from "./routes/appointments.js";
import paymentsRouter, { stripeWebhook } from "./routes/payments.js";
import { usersRouter, profileRouter } from "./routes/users.js";
import statsRouter from "./routes/stats.js";
import uploadRouter from "./routes/upload.js";

const app = express();
app.set("trust proxy", 1);

const allowed = (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((s) => s.trim());
app.use(cors({ origin: allowed, credentials: true }));

// Stripe needs the RAW body to verify the signature -> must be registered before express.json()
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.json({ name: "SalonBook API", status: "ok" }));
app.use("/api/services", servicesRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/profile", profileRouter);
app.use("/api/stats", statsRouter);
app.use("/api/upload", uploadRouter);

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === "MulterError" ? 400 : 500);
  if (status >= 500) console.error(err);
  const message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller" : status >= 500 ? "Something went wrong on the server" : err.message;
  res.status(status).json({ message });
});

export default app;
