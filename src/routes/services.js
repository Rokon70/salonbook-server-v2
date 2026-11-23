import { Router } from "express";
import { getDb, toObjectId } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError, escapeRegex, CATEGORIES } from "../utils/helpers.js";

const router = Router();

function validateService(body, { partial = false } = {}) {
  const data = {};
  const name = String(body.serviceName || "").trim();
  if (!name) throw new HttpError(400, "Service name is required");
  data.serviceName = name;

  if (!CATEGORIES.includes(body.category)) throw new HttpError(400, "Please choose a valid category");
  data.category = body.category;

  const description = String(body.description || "").trim();
  if (description.length < 10) throw new HttpError(400, "Description must be at least 10 characters");
  data.description = description;

  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Price must be a positive number");
  data.price = price;

  const duration = Number(body.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(400, "Duration must be a positive number");
  data.duration = Math.round(duration);

  if (!body.image || typeof body.image !== "string") throw new HttpError(400, "Service image is required");
  data.image = body.image;

  data.status = body.status === "inactive" ? "inactive" : "active";
  return data;
}

// PUBLIC: active services with search, category filter, price sorting
router.get("/", asyncHandler(async (req, res) => {
  const db = await getDb();
  const { search, category, sort } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 50);

  const query = { status: "active" };
  if (search) query.serviceName = { $regex: escapeRegex(String(search)), $options: "i" };
  if (category) query.category = String(category);

  const sortMap = { price_asc: { price: 1 }, price_desc: { price: -1 } };
  const sortBy = sortMap[sort] || { createdAt: -1 };

  const total = await db.collection("services").countDocuments(query);
  const services = await db.collection("services").find(query).sort(sortBy).skip((page - 1) * limit).limit(limit).toArray();
  res.json({ services, total, page, pages: Math.ceil(total / limit) });
}));

// PUBLIC: categories with number of active services
router.get("/categories", asyncHandler(async (_req, res) => {
  const db = await getDb();
  const counts = await db.collection("services").aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]).toArray();
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  res.json({ categories: CATEGORIES.map((name) => ({ name, count: map[name] || 0 })) });
}));

// ADMIN: all services (active + inactive)
router.get("/admin/all", verifyJWT, requireRole("admin"), asyncHandler(async (_req, res) => {
  const db = await getDb();
  const services = await db.collection("services").find().sort({ createdAt: -1 }).toArray();
  res.json({ services });
}));

// PROTECTED: single service (customers can only see active ones)
router.get("/:id", verifyJWT, asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid service ID");
  const db = await getDb();
  const service = await db.collection("services").findOne({ _id });
  if (!service || (service.status !== "active" && req.user.role !== "admin")) {
    throw new HttpError(404, "This service was not found or is no longer available");
  }
  res.json({ service });
}));

router.post("/", verifyJWT, requireRole("admin"), asyncHandler(async (req, res) => {
  const data = { ...validateService(req.body), createdAt: new Date() };
  const db = await getDb();
  const result = await db.collection("services").insertOne(data);
  res.status(201).json({ message: "Service created", service: { _id: result.insertedId, ...data } });
}));

router.put("/:id", verifyJWT, requireRole("admin"), asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid service ID");
  const data = { ...validateService(req.body), updatedAt: new Date() };
  const db = await getDb();
  const result = await db.collection("services").updateOne({ _id }, { $set: data });
  if (!result.matchedCount) throw new HttpError(404, "Service not found");
  res.json({ message: "Service updated" });
}));

router.patch("/:id/status", verifyJWT, requireRole("admin"), asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid service ID");
  const status = req.body.status === "inactive" ? "inactive" : "active";
  const db = await getDb();
  const result = await db.collection("services").updateOne({ _id }, { $set: { status } });
  if (!result.matchedCount) throw new HttpError(404, "Service not found");
  res.json({ message: `Service ${status === "active" ? "activated" : "deactivated"}`, status });
}));

router.delete("/:id", verifyJWT, requireRole("admin"), asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid service ID");
  const db = await getDb();
  const busy = await db.collection("appointments").countDocuments({ serviceId: _id, status: { $in: ["pending", "confirmed"] } });
  if (busy) throw new HttpError(409, "This service has active appointments. Deactivate it instead of deleting.");
  const result = await db.collection("services").deleteOne({ _id });
  if (!result.deletedCount) throw new HttpError(404, "Service not found");
  res.json({ message: "Service deleted" });
}));

export default router;
