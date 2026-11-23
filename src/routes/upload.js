import { Router } from "express";
import multer from "multer";
import { asyncHandler, HttpError } from "../utils/helpers.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (file.mimetype.startsWith("image/") ? cb(null, true) : cb(new HttpError(400, "Only image files are allowed"))),
});

// tiny in-memory rate limit (20 uploads / hour / IP) because sign-up needs a public upload
const hits = new Map();
function rateLimit(req, _res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= 20) return next(new HttpError(429, "Too many uploads. Try again later."));
  list.push(now);
  hits.set(req.ip, list);
  next();
}

router.post("/", rateLimit, upload.single("image"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Please choose an image");
  const form = new FormData();
  form.append("image", req.file.buffer.toString("base64"));
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, { method: "POST", body: form });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new HttpError(502, "Image upload failed. Please try again.");
  res.json({ url: json.data.display_url });
}));

export default router;
