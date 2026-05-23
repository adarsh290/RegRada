import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}

export interface AuthPayload {
  userId: string;
  username: string;
  role: "CO" | "DEPARTMENT";
  department_name?: string;
}

/**
 * Middleware: verifies JWT from Authorization header.
 * Attaches decoded payload to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Check cookies (parsed by cookie-parser)
  if (!token && req.cookies && req.cookies.regradar_token) {
    token = req.cookies.regradar_token;
  }

  if (!token) {
    res.status(401).json({ error: "No token provided. Please log in." });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any as AuthPayload;
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token. Please log in again." });
  }
}

/**
 * Middleware: restricts access to Compliance Officer role only.
 */
export function requireCO(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthPayload;
  if (!user || user.role !== "CO") {
    res.status(403).json({ error: "Access denied. Compliance Officer role required." });
    return;
  }
  next();
}
