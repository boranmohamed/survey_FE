import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerChatRoutes } from "./replit_integrations/chat"; // Using chat for rephrase/logic if needed
import OpenAI from "openai";

let openai: OpenAI | null = null;

function initializeOpenAI() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.warn(
      "⚠️  AI_INTEGRATIONS_OPENAI_API_KEY is not set. AI features will be unavailable.",
    );
    return;
  }

  try {
    openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  } catch (error) {
    console.warn("⚠️  Failed to initialize OpenAI client:", error);
  }
}

initializeOpenAI();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register AI chat routes (optional but good for history/logging)
  registerChatRoutes(app);

  // === Survey Endpoints ===
  
  app.get(api.surveys.list.path, async (req, res) => {
    const surveys = await storage.getSurveys();
    res.json(surveys);
  });

  app.get(api.surveys.get.path, async (req, res) => {
    const survey = await storage.getSurvey(Number(req.params.id));
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found' });
    }
    res.json(survey);
  });

  app.post(api.surveys.create.path, async (req, res) => {
    try {
      const input = api.surveys.create.input.parse(req.body);
      const survey = await storage.createSurvey(input);
      res.status(201).json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.surveys.update.path, async (req, res) => {
    try {
      const input = api.surveys.update.input.parse(req.body);
      const survey = await storage.updateSurvey(Number(req.params.id), input);
      if (!survey) {
        return res.status(404).json({ message: 'Survey not found' });
      }
      res.json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.surveys.delete.path, async (req, res) => {
    await storage.deleteSurvey(Number(req.params.id));
    res.status(204).send();
  });

  // === AI Generation Endpoints ===

  app.post(api.ai.generate.path, async (req, res) => {
    try {
      const { prompt, numQuestions, numPages, language } = api.ai.generate.input.parse(req.body);

      // Construct a system prompt to guide the AI
      const systemPrompt = `You are an expert survey designer. 
      Generate a structured survey based on the user's request.
      Language: ${language}
      Target: ${numQuestions} questions across ${numPages} pages.
      
      Return ONLY valid JSON with this structure:
      {
        "suggestedName": "string",
        "sections": [
          {
            "title": "string",
            "questions": [
              {
                "text": "string",
                "type": "rating" | "text" | "choice",
                "options": ["string"] (only for choice type)
              }
            ]
          }
        ]
      }`;

      if (!openai) {
        return res.status(503).json({ message: "OpenAI is not configured" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No content generated");

      const result = JSON.parse(content);
      res.json(result);

    } catch (err) {
      console.error("AI Generation Error:", err);
      res.status(500).json({ message: "Failed to generate survey structure" });
    }
  });

  app.post(api.ai.rephrase.path, async (req, res) => {
    try {
      const { prompt, language } = req.body;
      
      if (!openai) {
        return res.status(503).json({ message: "OpenAI is not configured" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a professional editor. Rephrase the following survey prompt to be more clear, professional, and effective. Return JSON with 'rephrased' field." },
          { role: "user", content: `Language: ${language}\nPrompt: ${prompt}` }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No content generated");

      const result = JSON.parse(content);
      res.json({
        original: prompt,
        rephrased: result.rephrased || prompt // Fallback
      });

    } catch (err) {
      console.error("AI Rephrase Error:", err);
      res.status(500).json({ message: "Failed to rephrase prompt" });
    }
  });

  // === Seed Data ===
  try {
    await seedDatabase();
  } catch (error) {
    console.warn("⚠️  Could not seed database (database may not be configured):", error instanceof Error ? error.message : error);
  }

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getSurveys();
  if (existing.length === 0) {
    await storage.createSurvey({
      name: "Employee Satisfaction Q1",
      language: "English",
      collectionMode: "web",
      status: "active"
    });
    await storage.createSurvey({
      name: "Customer Feedback 2024",
      language: "Bilingual",
      collectionMode: "field",
      status: "draft"
    });
  }
}
