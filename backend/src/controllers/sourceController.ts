import { Request, Response } from 'express';
import axios from 'axios';
import Source from '../models/Source';
import Circular from '../models/Circular';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

interface AIExtractionResponse {
  summary: string;
  maps: Array<{
    action_title: string;
    department: string;
    deadline: string;
    priority: "high" | "medium" | "low";
  }>;
  extraction_mode?: string;
  scraped_url?: string;
}

export const getSources = async (_req: Request, res: Response) => {
  try {
    const sources = await Source.find().sort({ created_at: -1 });
    res.json(sources);
  } catch (err) {
    console.error("❌ getSources error:", err);
    res.status(500).json({ error: "Failed to fetch sources" });
  }
};

export const addSource = async (req: Request, res: Response) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
       res.status(400).json({ error: "Name and URL are required" });
       return;
    }
    const newSource = new Source({ name, url });
    await newSource.save();
    res.status(201).json(newSource);
  } catch (err) {
    console.error("❌ addSource error:", err);
    res.status(500).json({ error: "Failed to add source" });
  }
};

export const scrapeSource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const source = await Source.findById(id);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    console.log(`🔍 Triggering AI scraper for source: ${source.name} (${source.url})`);

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/scrape-source`, {
      url: source.url
    });

    const extraction = aiResponse.data as AIExtractionResponse;
    
    // Update source last_scraped
    source.last_scraped = new Date();
    await source.save();

    console.log(`✅ Scrape complete for ${source.name} — Extracted ${extraction.maps?.length ?? 0} MAPs`);

    // Save to circular
    const mappedMaps = (extraction.maps || []).map((map, index) => ({
      ...map,
      map_id: `MAP-${(index + 1).toString().padStart(3, "0")}`,
      status: "pending" as const,
      assigned_to: map.department,
    }));

    const circular = new Circular({
      title: `${source.name} Automated Scrape Update`,
      source: source.name,
      raw_text: `[Autonomously Scraped from: ${extraction.scraped_url || source.url}]`,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "scraper",
      status: "parsed",
      date_published: new Date(),
      maps: mappedMaps,
    });

    await circular.save();
    console.log(`💾 Scraped circular saved: ${circular._id}`);

    res.json({ message: "Scrape successful", circular, source });
  } catch (err: any) {
    console.error("❌ scrapeSource error:", err.message);
    if (err.response) {
      console.error("AI service error details:", err.response.data);
    }
    
    // Update source status to error
    try {
        await Source.findByIdAndUpdate(req.params.id, { status: 'error' });
    } catch (e) {}

    res.status(500).json({ 
      error: "Scraping failed", 
      details: err.response?.data?.detail || err.message 
    });
  }
};
