import { Router } from "express";
import Stripe from "stripe";
import { getDb, toObjectId, ObjectId } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../utils/helpers.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_missing");

// Shared by the customer and admin transaction lists so both show the same enriched data.
async function enrichTransactions(db, list) {
  const apptIds = list.map((t) => t.appointmentId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const appts = await db.collection("appointments").find({ _id: { $in: apptIds } }).toArray();
  const services = await db.collection("services").find({ _id: { $in: appts.map((a) => a.serviceId) } }).toArray();
  const userIds = [...new Set(list.map((t) => t.customerId))].flatMap((id) => (ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]));
  const users = await db.collection("users").find({ _id: { $in: userIds } }).toArray();

  const apptMap = Object.fromEntries(appts.map((a) => [String(a._id), a]));
  const serviceMap = Object.fromEntries(services.map((s) => [String(s._id), s]));
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

  return list.map((t) => {
    const a = apptMap[t.appointmentId];
    return {
      ...t,
      customer: { name: userMap[t.customerId]?.name || "Unknown", email: userMap[t.customerId]?.email || "-" },
      serviceName: a ? serviceMap[String(a.serviceId)]?.serviceName || "Deleted service" : "-",
      appointmentDate: a?.appointmentDate || "-",
    };
  });
}

// CUSTOMER: create Stripe Checkout session for a confirmed + unpaid appointment
router.post("/checkout/:appointmentId", verifyJWT, requireRole("customer"), asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.appointmentId);
  if (!_id) throw new HttpError(400, "Invalid appointment ID");
  const db = await getDb();
  const appt = await db.collection("appointments").findOne({ _id, customerId: req.user.id });
  if (!appt) throw new HttpError(404, "Appointment not found");
  if (appt.status !== "confirmed") throw new HttpError(400, "You can only pay for confirmed appointments");
  if (appt.paymentStatus === "paid") throw new HttpError(400, "This appointment is already paid");

  const service = await db.collection("services").findOne({ _id: appt.serviceId });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: process.env.CURRENCY || "usd",
        unit_amount: Math.round(appt.servicePrice * 100),
        product_data: { name: service?.serviceName || "Salon service", description: `${appt.appointmentDate} at ${appt.timeSlot}` },
      },
    }],
    metadata: { appointmentId: String(appt._id), customerId: appt.customerId },
    success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
  });
  res.json({ url: session.url });
}));

// CUSTOMER: success page polls this. It only READS what the webhook saved.
router.get("/session/:sessionId", verifyJWT, requireRole("customer"), asyncHandler(async (req, res) => {
  const db = await getDb();
  const tx = await db.collection("transactions").findOne({ stripeSessionId: req.params.sessionId, customerId: req.user.id });
  res.json({ status: tx ? tx.status : "processing", amount: tx?.amount, currency: tx?.currency });
}));

// CUSTOMER: own payment history
router.get("/mine", verifyJWT, requireRole("customer"), asyncHandler(async (req, res) => {
  const db = await getDb();
  const list = await db.collection("transactions").find({ customerId: req.user.id }).sort({ createdAt: -1 }).toArray();
  res.json({ transactions: await enrichTransactions(db, list) });
}));

// ADMIN: all transactions (read-only, there is NO endpoint to edit a payment)
router.get("/transactions", verifyJWT, requireRole("admin"), asyncHandler(async (_req, res) => {
  const db = await getDb();
  const list = await db.collection("transactions").find().sort({ createdAt: -1 }).toArray();
  res.json({ transactions: await enrichTransactions(db, list) });
}));

/**
 * Stripe webhook (mounted in app.js with express.raw BEFORE express.json).
 * This is the ONLY place where an appointment becomes "paid".
 */
export async function stripeWebhook(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  try {
    const db = await getDb();
    const session = event.data.object;
    const appointmentId = session.metadata?.appointmentId;
    const customerId = session.metadata?.customerId;
    // Ignore unrelated or malformed events instead of throwing a 500 that Stripe would retry forever.
    if (!appointmentId || !ObjectId.isValid(appointmentId)) {
      res.json({ received: true });
      return;
    }

    const saveTransaction = (status) =>
      db.collection("transactions").updateOne(
        { stripeSessionId: session.id },
        {
          $set: { status },
          $setOnInsert: {
            appointmentId,
            customerId,
            amount: (session.amount_total || 0) / 100,
            currency: session.currency,
            stripeSessionId: session.id,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

    if (
      (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
      session.payment_status === "paid" && appointmentId
    ) {
      await saveTransaction("paid");
      await db.collection("appointments").updateOne(
        { _id: new ObjectId(appointmentId) },
        { $set: { paymentStatus: "paid", updatedAt: new Date() } }
      );
    } else if (
      (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") &&
      appointmentId
    ) {
      // Failed / expired checkouts are recorded as failed, but never make an appointment paid.
      await saveTransaction("failed");
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Webhook handler failed"); // Stripe will retry
  }
}

export default router;
