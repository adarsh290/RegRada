import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "regradar-super-secret-key";
const JWT_EXPIRES_IN = "24h";

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response) {
  try {
    const { username, password, role, department_name, email } = req.body;

    if (!username || !password || !role) {
      res.status(400).json({ error: "username, password, and role are required" });
      return;
    }
    if (!["CO", "DEPARTMENT"].includes(role)) {
      res.status(400).json({ error: "role must be 'CO' or 'DEPARTMENT'" });
      return;
    }
    if (role === "DEPARTMENT" && !department_name) {
      res.status(400).json({ error: "department_name is required for DEPARTMENT role" });
      return;
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = new User({ username, password_hash, role, department_name: department_name || null, email: email || null });
    await user.save();

    res.status(201).json({
      message: "User registered successfully",
      user: { id: user._id, username: user.username, role: user.role, department_name: user.department_name },
    });
  } catch (err) {
    console.error("❌ register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role, department_name: user.department_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, username: user.username, role: user.role, department_name: user.department_name },
    });
  } catch (err) {
    console.error("❌ login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response) {
  res.json((req as any).user);
}
