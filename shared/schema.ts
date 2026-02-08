import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/chat";

// === TABLE DEFINITIONS ===
export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  language: text("language", { enum: ["English", "Arabic", "Bilingual"] }).notNull().default("English"),
  collectionMode: text("collection_mode", { enum: ["field", "web"] }).notNull().default("web"),
  status: text("status", { enum: ["draft", "active", "completed"] }).notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Store the generated structure as JSON
  structure: jsonb("structure").$type<{
    sections: {
      title: string;
      questions: {
        text: string;
        type: string;
        options?: string[];
        // Metadata fields from planner API
        spec_id?: string;
        required?: boolean;
        validation?: any;
        skip_logic?: any;
        scale?: any;
      }[];
    }[];
  }>(),
});

// === BASE SCHEMAS ===
export const insertSurveySchema = createInsertSchema(surveys).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  structure: true // Structure is usually generated or updated separately
});

// === EXPLICIT API CONTRACT TYPES ===
export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = z.infer<typeof insertSurveySchema>;

export type CreateSurveyRequest = InsertSurvey;
export type UpdateSurveyRequest = Partial<InsertSurvey> & {
  structure?: Survey['structure'];
};

// AI Generation types
export const generateSurveySchema = z.object({
  prompt: z.string().min(10),
  numQuestions: z.number().min(1).max(20).default(5),
  numPages: z.number().min(1).max(5).default(1),
  language: z.enum(["English", "Arabic", "Bilingual"]).default("English"),
  title: z.string().optional(), // Survey title/name for external backend
  type: z.string().optional(), // Survey type for external backend
});

export type GenerateSurveyRequest = z.infer<typeof generateSurveySchema>;

export type GeneratedQuestion = {
  text: string;
  type: "rating" | "text" | "choice";
  options?: string[];
};

export type GeneratedSection = {
  title: string;
  questions: GeneratedQuestion[];
};

export type GeneratedSurveyResponse = {
  sections: GeneratedSection[];
  suggestedName?: string;
};
