import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb, ObjectId } from "../config/db.js";
import { HttpError, asyncHandler } from "../utils/helpers.js";

let jwks;
const getJwks = () => {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${process.env.AUTH_URL}/api/auth/jwks`));
  return jwks;
};

// Better Auth may store _id as ObjectId or string depending on version, so try both.
export async function findUserById(id) {
  const db = await getDb();
  const candidates = [String(id)];
  if (ObjectId.isValid(id)) candidates.unshift(new ObjectId(id));
  return db.collection("users").findOne({ _id: { $in: candidates } });
}

/** Verifies the Better Auth JWT, then loads the user from DB (role + blocked status are always read from DB). */
export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new HttpError(401, "Authentication required");

  let payload;
  try {
    ({ payload } = await jwtVerify(header.slice(7), getJwks(), { issuer: process.env.AUTH_URL }));
  } catch {
    throw new HttpError(401, "Invalid or expired token. Please sign in again.");
  }

  const user = await findUserById(payload.id || payload.sub);
  if (!user) throw new HttpError(401, "User not found");
  if (user.isBlocked) throw new HttpError(403, "Your account has been blocked. Contact the salon.");

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image || "",
    role: user.role || "customer",
  };
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new HttpError(403, "You do not have permission to perform this action"));
  }
  next();
};
