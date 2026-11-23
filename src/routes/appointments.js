import { Router } from "express";
import { getDb, toObjectId, ObjectId } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError, TIME_SLOTS } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT);

const ACTIVE = ["pending", "confirmed"];

// Attach service + customer info to appointments
async function enrich(db, appointments, { withCustomer = false } = {}) {
  const serviceIds = [...new Set(appointments.map((a) => String(a.serviceId)))].map((id) => new ObjectId(id));
  const services = await db.collection("services").find({ _id: { $in: serviceIds } }).toArray();
  const serviceMap = Object.fromEntries(services.map((s) => [String(s._id), s]));

  let userMap = {};
  if (withCustomer) {
    const ids = [...new Set(appointments.map((a) => a.customerId))];
    const candidates = ids.flatMap((id) => (ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]));
    const users = await db.collection("users").find({ _id: { $in: candidates } }).toArray();
    userMap = Object.fromEntries(users.map((u) => [String(u._id), { name: u.name, email: u.email, image: u.image, phone: u.phone }]));
  }

  return appointments.map((a) => ({
    ...a,
    service: serviceMap[String(a.serviceId)]
      ? { _id: serviceMap[String(a.serviceId)]._id, serviceName: serviceMap[String(a.serviceId)].serviceName, image: serviceMap[String(a.serviceId)].image, category: serviceMap[String(a.serviceId)].category, duration: serviceMap[String(a.serviceId)].duration }
      : { serviceName: "Deleted service", category: "-", image: "" },
    ...(withCustomer ? { customer: userMap[a.customerId] || { name: "Unknown", email: "-" } } : {}),
  }));
}

// Taken time slots for a service on a date (used by the booking form)
router.get("/slots", asyncHandler(async (req, res) => {
  const serviceId = toObjectId(req.query.serviceId);
  const date = String(req.query.date || "");
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "serviceId and date are required");
  const db = await getDb();
  const taken = await db.collection("appointments").find({ serviceId, appointmentDate: date, status: { $in: ACTIVE } }).project({ timeSlot: 1 }).toArray();
  res.json({ slots: TIME_SLOTS, taken: taken.map((t) => t.timeSlot) });
}));

// CUSTOMER: create appointment request
router.post("/", requireRole("customer"), asyncHandler(async (req, res) => {
  const { appointmentDate, timeSlot, message } = req.body;
  const serviceId = toObjectId(req.body.serviceId);
  if (!serviceId) throw new HttpError(400, "Invalid service ID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(appointmentDate))) throw new HttpError(400, "Please choose a valid date");
  const today = new Date().toISOString().slice(0, 10);
  if (appointmentDate < today) throw new HttpError(400, "Appointment date cannot be in the past");
  if (!TIME_SLOTS.includes(timeSlot)) throw new HttpError(400, "Please choose a valid time slot");
  if (message && String(message).length > 500) throw new HttpError(400, "Message must be 500 characters or fewer");

  const db = await getDb();
  const service = await db.collection("services").findOne({ _id: serviceId });
  if (!service) throw new HttpError(404, "Service not found");
  if (service.status !== "active") throw new HttpError(400, "This service is not available for booking");

  const slotTaken = await db.collection("appointments").findOne({ serviceId, appointmentDate, timeSlot, status: { $in: ACTIVE } });
  if (slotTaken) throw new HttpError(409, "That time slot is already booked. Please pick another one.");

  const customerBusy = await db.collection("appointments").findOne({ customerId: req.user.id, appointmentDate, timeSlot, status: { $in: ACTIVE } });
  if (customerBusy) throw new HttpError(409, "You already have an appointment at this date and time.");

  const doc = {
    serviceId,
    customerId: req.user.id,
    appointmentDate,
    timeSlot,
    message: String(message || "").trim(),
    servicePrice: service.price,
    paymentStatus: "unpaid",
    status: "pending",
    createdAt: new Date(),
  };
  try {
    const result = await db.collection("appointments").insertOne(doc);
    res.status(201).json({ message: "Appointment request submitted. We will confirm it soon.", appointmentId: result.insertedId });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, "That time slot is already booked. Please pick another one.");
    throw err;
  }
}));

// CUSTOMER: my appointments
router.get("/mine", requireRole("customer"), asyncHandler(async (req, res) => {
  const db = await getDb();
  const list = await db.collection("appointments").find({ customerId: req.user.id }).sort({ createdAt: -1 }).toArray();
  res.json({ appointments: await enrich(db, list) });
}));

// ADMIN: all appointments
router.get("/", requireRole("admin"), asyncHandler(async (req, res) => {
  const db = await getDb();
  const query = ["pending", "confirmed", "cancelled"].includes(req.query.status) ? { status: req.query.status } : {};
  const list = await db.collection("appointments").find(query).sort({ createdAt: -1 }).toArray();
  res.json({ appointments: await enrich(db, list, { withCustomer: true }) });
}));

// Single appointment: owner or admin
router.get("/:id", asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid appointment ID");
  const db = await getDb();
  const appt = await db.collection("appointments").findOne({ _id });
  if (!appt || (req.user.role !== "admin" && appt.customerId !== req.user.id)) throw new HttpError(404, "Appointment not found");
  const [full] = await enrich(db, [appt], { withCustomer: true });
  res.json({ appointment: full });
}));

// ADMIN: confirm (pending only)
router.patch("/:id/confirm", requireRole("admin"), asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid appointment ID");
  const db = await getDb();
  const result = await db.collection("appointments").updateOne({ _id, status: "pending" }, { $set: { status: "confirmed", updatedAt: new Date() } });
  if (!result.matchedCount) throw new HttpError(400, "Only pending appointments can be confirmed");
  res.json({ message: "Appointment confirmed" });
}));

// CANCEL: customer (own, pending only) or admin (pending or confirmed)
router.patch("/:id/cancel", asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(400, "Invalid appointment ID");
  const db = await getDb();
  const appt = await db.collection("appointments").findOne({ _id });
  if (!appt) throw new HttpError(404, "Appointment not found");

  if (req.user.role === "customer") {
    if (appt.customerId !== req.user.id) throw new HttpError(404, "Appointment not found");
    if (appt.status !== "pending") throw new HttpError(400, "Only pending appointment requests can be cancelled");
  } else if (!ACTIVE.includes(appt.status)) {
    throw new HttpError(400, "This appointment is already cancelled");
  }
  if (appt.paymentStatus === "paid") throw new HttpError(400, "This appointment is already paid. Refund it from Stripe first.");

  await db.collection("appointments").updateOne({ _id }, { $set: { status: "cancelled", updatedAt: new Date() } });
  res.json({ message: "Appointment cancelled" });
}));

export default router;
