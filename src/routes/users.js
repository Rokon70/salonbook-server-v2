import { Router } from "express";
import { getDb, ObjectId } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError, escapeRegex } from "../utils/helpers.js";

export const usersRouter = Router();
export const profileRouter = Router();

const safeUser = (u) => ({ _id: u._id, name: u.name, email: u.email, image: u.image || "", phone: u.phone || "", role: u.role || "customer", isBlocked: !!u.isBlocked, createdAt: u.createdAt });
const idFilter = (id) => ({ _id: { $in: ObjectId.isValid(id) ? [new ObjectId(id), id] : [id] } });

// ---------- ADMIN: manage customers ----------
usersRouter.use(verifyJWT, requireRole("admin"));

usersRouter.get("/", asyncHandler(async (req, res) => {
  const db = await getDb();
  const query = { role: { $ne: "admin" } };
  if (req.query.search) {
    const rx = { $regex: escapeRegex(String(req.query.search)), $options: "i" };
    query.$or = [{ name: rx }, { email: rx }];
  }
  const users = await db.collection("users").find(query).sort({ createdAt: -1 }).toArray();
  res.json({ users: users.map(safeUser) });
}));

usersRouter.get("/:id", asyncHandler(async (req, res) => {
  const db = await getDb();
  const user = await db.collection("users").findOne(idFilter(req.params.id));
  if (!user) throw new HttpError(404, "User not found");
  const appointments = await db.collection("appointments").countDocuments({ customerId: String(user._id) });
  res.json({ user: safeUser(user), appointments });
}));

async function setBlocked(req, res, isBlocked) {
  const db = await getDb();
  const user = await db.collection("users").findOne(idFilter(req.params.id));
  if (!user) throw new HttpError(404, "User not found");
  if (user.role === "admin") throw new HttpError(400, "Admin accounts cannot be blocked");
  await db.collection("users").updateOne({ _id: user._id }, { $set: { isBlocked, updatedAt: new Date() } });
  res.json({ message: isBlocked ? "User blocked" : "User unblocked" });
}
usersRouter.patch("/:id/block", asyncHandler((req, res) => setBlocked(req, res, true)));
usersRouter.patch("/:id/unblock", asyncHandler((req, res) => setBlocked(req, res, false)));

// ---------- Own profile (customer + admin) ----------
profileRouter.use(verifyJWT);

profileRouter.get("/", asyncHandler(async (req, res) => {
  const db = await getDb();
  const user = await db.collection("users").findOne(idFilter(req.user.id));
  res.json({ user: safeUser(user) });
}));

// Whitelist: only name, image and phone. role / isBlocked / email can never be changed here.
profileRouter.patch("/", asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 2) throw new HttpError(400, "Name must be at least 2 characters");
    update.name = name;
  }
  if (req.body.image !== undefined) update.image = String(req.body.image).trim();
  if (req.body.phone !== undefined) {
    const phone = String(req.body.phone).trim();
    if (phone && !/^[+0-9\-\s()]{6,20}$/.test(phone)) throw new HttpError(400, "Enter a valid phone number");
    update.phone = phone;
  }
  if (!Object.keys(update).length) throw new HttpError(400, "Nothing to update");
  update.updatedAt = new Date();
  const db = await getDb();
  await db.collection("users").updateOne(idFilter(req.user.id), { $set: update });
  res.json({ message: "Profile updated" });
}));
