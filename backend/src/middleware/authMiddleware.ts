import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "regradar-super-secret-key";

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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided. Please log in." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
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
