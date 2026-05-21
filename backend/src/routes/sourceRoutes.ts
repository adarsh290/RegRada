import { Router } from 'express';
import { getSources, addSource, scrapeSource } from '../controllers/sourceController';

const router = Router();

router.get('/', getSources);
router.post('/', addSource);
router.post('/:id/scrape', scrapeSource);

export default router;
