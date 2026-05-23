import { Router } from 'express';
import { getSources, addSource, scrapeSource } from '../controllers/sourceController';
import { authenticate, requireCO } from "../middleware/authMiddleware";

const router = Router();

router.get('/', authenticate, getSources);
router.post('/', authenticate, requireCO, addSource);
router.post('/:id/scrape', authenticate, requireCO, scrapeSource);

export default router;
