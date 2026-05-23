import { Router } from "express";
import { register, login, logout, getMe } from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/login
router.post("/login", login);

// POST /api/auth/logout
router.post("/logout", logout);

// GET /api/auth/me — returns current user (requires token)
router.get("/me", authenticate, getMe);

export default router;
