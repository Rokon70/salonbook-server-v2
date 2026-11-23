import "dotenv/config";
import dns from "node:dns";
import { MongoClient } from "mongodb";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

// Fixed 4:3 crop keeps every service image the same size, including portrait originals.
const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=675&q=80`;
const services = [
  ["Signature Haircut & Blow-dry", "Haircut & Styling", 45, 60, "A precision cut tailored to your face shape, finished with a smooth blow-dry.", "photo-1560066984-138dadb4c035"],
  ["Balayage Hair Coloring", "Hair Coloring", 140, 180, "Hand-painted highlights for soft, natural-looking dimension and grow-out.", "photo-1562322140-8baeececf3df"],
  ["Deep Repair Hair Treatment", "Hair Treatment", 60, 45, "Keratin-rich treatment that restores shine and strength to damaged hair.", "photo-1522337360788-8b13dee7a37e"],
  ["Hydrating Facial", "Facial & Skincare", 75, 60, "Deep cleanse, exfoliation and a hydrating mask for glowing skin.", "photo-1570172619644-dfd03ed5d881"],
  ["Bridal Makeup", "Makeup", 120, 90, "Long-lasting, camera-ready makeup with a complimentary trial consultation.", "photo-1487412947147-5cebf100ffc2"],
  ["Gel Manicure", "Manicure & Pedicure", 35, 45, "Nail shaping, cuticle care and a chip-resistant gel polish finish.", "photo-1604654894610-df63bc536371"],
  ["Spa Pedicure", "Manicure & Pedicure", 50, 60, "Warm soak, scrub, massage and polish for soft, refreshed feet.", "photo-1519014816548-bf5fe059798b"],
  ["Aromatherapy Massage", "Spa & Massage", 90, 60, "Full-body relaxing massage with essential oils to release tension.", "photo-1544161515-4ab6ce6db874"],
].map(([serviceName, category, price, duration, description, photo]) => ({
  serviceName, category, price, duration, description, image: img(photo), status: "active", createdAt: new Date(),
}));

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB || "salonbook").collection("services");
if ((await col.countDocuments()) > 0) console.log("Services already exist, skipping seed.");
else console.log(`Inserted ${(await col.insertMany(services)).insertedCount} services`);
await client.close();
