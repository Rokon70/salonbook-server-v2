import { Router } from "express";
import { getDb } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT);

router.get("/customer", requireRole("customer"), asyncHandler(async (req, res) => {
  const db = await getDb();
  const count = (status) => db.collection("appointments").countDocuments({ customerId: req.user.id, ...(status ? { status } : {}) });
  const [total, pending, confirmed, cancelled] = await Promise.all([count(), count("pending"), count("confirmed"), count("cancelled")]);
  res.json({ total, pending, confirmed, cancelled });
}));

router.get("/admin", requireRole("admin"), asyncHandler(async (_req, res) => {
  const db = await getDb();
  const a = db.collection("appointments");
  const [customers, services, total, pending, confirmed, payments] = await Promise.all([
    db.collection("users").countDocuments({ role: { $ne: "admin" } }),
    db.collection("services").countDocuments({ status: "active" }),
    a.countDocuments(),
    a.countDocuments({ status: "pending" }),
    a.countDocuments({ status: "confirmed" }),
    db.collection("transactions").countDocuments({ status: "paid" }),
  ]);
  res.json({ customers, services, total, pending, confirmed, payments });
}));

export default router;
