import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}
// BUG-BE2-032: Align JWT expiry with cookie maxAge
const JWT_EXPIRES_IN = "8h";

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response) {
  try {
    const { username, password, department_name, email } = req.body;

    // BUG-SEC-003: Validate inputs are plain strings — prevent NoSQL operator injection
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "username and password must be strings" });
      return;
    }

    if (!username.trim() || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    // BUG-BE2-023: bcrypt silently truncates passwords over 72 bytes. Check length.
    if (password.length > 72) {
      res.status(400).json({ error: "password must be 72 characters or less" });
      return;
    }
    
    // Default all new registrations to DEPARTMENT
    const role = "DEPARTMENT";
    
    if (!department_name) {
      res.status(400).json({ error: "department_name is required for registration" });
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
  } catch (err: any) {
    // BUG-BE2-033: Handle concurrent registration race conditions
    if (err.code === 11000) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
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

    // BUG-SEC-003: Validate inputs are plain strings — prevent NoSQL operator injection
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "username and password must be strings" });
      return;
    }

    if (!username.trim() || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    // BUG-BE2-023: bcrypt silently truncates passwords over 72 bytes. Check length.
    if (password.length > 72) {
      res.status(400).json({ error: "password must be 72 characters or less" });
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
      { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" }
    );

    // BUG-SEC-001: Always set secure: true for cookies to prevent session hijacking over HTTP
    res.cookie("regradar_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login successful",
      user: { id: user._id, username: user.username, role: user.role, department_name: user.department_name },
    });
  } catch (err) {
    console.error("❌ login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response) {
  try {
    res.clearCookie("regradar_token", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("❌ logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response) {
  // BUG-CONTRACT-006: Normalize id field — login returns { id } but JWT payload has { userId }
  // This ensures /me and /login return the same shape so frontend code can rely on user.id
  const raw = (req as any).user;
  res.json({
    id: raw.userId,
    username: raw.username,
    role: raw.role,
    department_name: raw.department_name,
  });
}
