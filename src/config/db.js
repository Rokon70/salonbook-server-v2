import { MongoClient, ObjectId } from "mongodb";

let client;
let db;

export async function getDb() {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || "salonbook");
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(database) {
  // One transaction per Stripe session -> webhook retries can never create duplicates
  await database.collection("transactions").createIndex({ stripeSessionId: 1 }, { unique: true });
  await database.collection("appointments").createIndex({ customerId: 1, createdAt: -1 });
  await database.collection("services").createIndex({ status: 1, category: 1 });
  try {
    // Extra safety net against double booking (the API also checks before insert)
    await database.collection("appointments").createIndex(
      { serviceId: 1, appointmentDate: 1, timeSlot: 1 },
      { unique: true, partialFilterExpression: { status: { $in: ["pending", "confirmed"] } } }
    );
  } catch (err) {
    console.warn("Partial unique index skipped:", err.message);
  }
}

export const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
export { ObjectId };
