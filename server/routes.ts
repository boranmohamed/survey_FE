import type { Express } from "express";
import type { Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerChatRoutes } from "./replit_integrations/chat"; // Using chat for rephrase/logic if needed
import OpenAI from "openai";

let openai: OpenAI | null = null;

function initializeOpenAI() {
  // Check for both AI_INTEGRATIONS_OPENAI_API_KEY and OPENAI_API_KEY
  // This allows users to use either environment variable name
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  // Debug: Log if API key is found (without exposing the full key)
  if (apiKey) {
    console.log("✅ OpenAI API key found:", apiKey.substring(0, 10) + "...");
  } else {
    console.warn(
      "⚠️  AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY is not set. AI features will be unavailable.",
    );
    // Debug: Show what environment variables are available
    console.log("   Available env vars:", Object.keys(process.env).filter(k => k.includes("OPENAI") || k.includes("AI")).join(", ") || "none");
    return;
  }

  try {
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    console.log("✅ OpenAI client initialized successfully");
  } catch (error) {
    console.warn("⚠️  Failed to initialize OpenAI client:", error);
  }
}

// Don't initialize at module load time - wait until registerRoutes is called
// This ensures dotenv has loaded the environment variables first

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize OpenAI now that dotenv has loaded environment variables
  initializeOpenAI();
  
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
      res.json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      // Handle case where survey is not found
      if (err instanceof Error && err.message.includes('not found')) {
        return res.status(404).json({ message: 'Survey not found' });
      }
      throw err;
    }
  });

  app.delete(api.surveys.delete.path, async (req, res) => {
    try {
      await storage.deleteSurvey(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      // Handle case where survey is not found
      if (err instanceof Error && err.message.includes('not found')) {
        return res.status(404).json({ message: 'Survey not found' });
      }
      throw err;
    }
  });

  // === AI Generation Endpoints ===
  
  // Test endpoint to verify route is registered
  console.log("✅ AI Generation endpoint registered at:", api.ai.generate.path);

  app.post(api.ai.generate.path, async (req, res) => {
    console.log("📥 Received AI generation request");
    try {
      const { prompt, numQuestions, numPages, language } = api.ai.generate.input.parse(req.body);
      console.log("📥 Request details:", { prompt: prompt?.substring(0, 50) + "...", numQuestions, numPages, language });

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
        model: "gpt-4.1-mini",
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
      // Provide more detailed error information
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && 'status' in err ? (err as any).status : 500;
      res.status(statusCode).json({ 
        message: "Failed to generate survey structure",
        error: errorMessage 
      });
    }
  });

  app.post(api.ai.rephrase.path, async (req, res) => {
    try {
      const { prompt, language } = req.body;
      
      if (!openai) {
        return res.status(503).json({ message: "OpenAI is not configured" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
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
      // Provide more detailed error information
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && 'status' in err ? (err as any).status : 500;
      res.status(statusCode).json({ 
        message: "Failed to rephrase prompt",
        error: errorMessage 
      });
    }
  });

  // === Prompt Rewrite Endpoint (New API) ===
  // This endpoint matches the FastAPI specification: POST /api/upsert-survey/prompt/rewrite
  app.post("/api/upsert-survey/prompt/rewrite", async (req, res) => {
    console.log("📥 Received prompt rewrite request");
    try {
      // Extract and validate request body
      const { prompt, language = "en", mode = "paraphrase", meta } = req.body;
      
      // Validate required fields
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({
          original_prompt: "",
          rewritten_prompt: "",
          rewrite_notes: [],
          status: {
            code: "error",
            message: "Prompt is required and must be a non-empty string"
          },
          meta: {
          run_id: meta?.run_id || randomUUID(),
          timestamp: new Date().toISOString(),
          trace_id: meta?.trace_id
          }
        });
      }

      if (!openai) {
        return res.status(503).json({
          original_prompt: prompt,
          rewritten_prompt: "",
          rewrite_notes: [],
          status: {
            code: "error",
            message: "OpenAI is not configured"
          },
          meta: {
          run_id: meta?.run_id || randomUUID(),
          timestamp: new Date().toISOString(),
          trace_id: meta?.trace_id
          }
        });
      }

      // Generate run_id and trace_id if not provided
      const runId = meta?.run_id || randomUUID();
      const traceId = meta?.trace_id || randomUUID();
      const timestamp = new Date().toISOString();

      // Create system prompt for professional rewriting
      const systemPrompt = `You are a professional editor specializing in survey design. 
Your task is to rewrite the user's survey prompt to improve clarity, professionalism, and effectiveness while:
- Preserving ALL constraints, numbers, and specific requirements
- Maintaining the original intent and meaning
- Improving grammar, structure, and clarity
- Making it more professional and actionable

Return JSON with this structure:
{
  "rewritten_prompt": "the improved version",
  "rewrite_notes": ["note 1", "note 2", ...]
}

The rewrite_notes should be a list of strings describing what improvements were made.`;

      const userPrompt = `Language: ${language}\nMode: ${mode}\nOriginal Prompt: ${prompt}`;

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content generated from OpenAI");
      }

      // Parse the AI response
      const aiResult = JSON.parse(content);
      const rewrittenPrompt = aiResult.rewritten_prompt || prompt;
      const rewriteNotes = Array.isArray(aiResult.rewrite_notes) 
        ? aiResult.rewrite_notes 
        : (aiResult.rewrite_notes ? [String(aiResult.rewrite_notes)] : []);

      // Extract token usage if available
      const tokenUsage = response.usage ? {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : undefined;

      // Build response matching the API specification
      const responseData = {
        original_prompt: prompt,
        rewritten_prompt: rewrittenPrompt,
        rewrite_notes: rewriteNotes,
        status: {
          code: "success",
          message: "Prompt rewritten successfully"
        },
        meta: {
          run_id: runId,
          timestamp: timestamp,
          trace_id: traceId,
          ...(response.model && {
            model_info: {
              name: response.model,
              version: "1.0",
              ...(tokenUsage && { token_usage: tokenUsage })
            }
          })
        }
      };

      console.log("✅ Prompt rewrite successful");
      res.json(responseData);

    } catch (err) {
      console.error("❌ Prompt Rewrite Error:", err);
      
      // Build error response matching the API specification
      const errorResponse = {
        original_prompt: req.body?.prompt || "",
        rewritten_prompt: "",
        rewrite_notes: [],
        status: {
          code: "error",
          message: err instanceof Error ? err.message : "Failed to rewrite prompt. Please try again."
        },
        meta: {
          run_id: req.body?.meta?.run_id || crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          trace_id: req.body?.meta?.trace_id
        }
      };

      res.status(500).json(errorResponse);
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
