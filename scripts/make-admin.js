// Usage: npm run make-admin -- admin@example.com
// 1) Register that email normally on the website  2) run this script to promote it to admin.
import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const result = await client.db(process.env.MONGODB_DB || "salonbook").collection("users").updateOne({ email: email.toLowerCase() }, { $set: { role: "admin", isBlocked: false } });
console.log(result.matchedCount ? `✔ ${email} is now an admin` : "✘ No user with that email. Sign up on the website first.");
await client.close();
