import { getDb } from "./db";
import {
  surveys,
  type Survey,
  type InsertSurvey,
  type UpdateSurveyRequest
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Survey Operations
  getSurveys(): Promise<Survey[]>;
  getSurvey(id: number): Promise<Survey | undefined>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: number, updates: UpdateSurveyRequest): Promise<Survey>;
  deleteSurvey(id: number): Promise<void>;
}

// Database-backed storage implementation
export class DatabaseStorage implements IStorage {
  async getSurveys(): Promise<Survey[]> {
    const db = getDb();
    return await db.select().from(surveys).orderBy(desc(surveys.createdAt));
  }

  async getSurvey(id: number): Promise<Survey | undefined> {
    const db = getDb();
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
    return survey;
  }

  async createSurvey(insertSurvey: InsertSurvey): Promise<Survey> {
    const db = getDb();
    const [survey] = await db.insert(surveys).values(insertSurvey).returning();
    return survey;
  }

  async updateSurvey(id: number, updates: UpdateSurveyRequest): Promise<Survey> {
    const db = getDb();
    const [updated] = await db
      .update(surveys)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(surveys.id, id))
      .returning();
    return updated;
  }

  async deleteSurvey(id: number): Promise<void> {
    const db = getDb();
    await db.delete(surveys).where(eq(surveys.id, id));
  }
}

// In-memory storage implementation for development when database is not available
// This allows the app to function without requiring a database connection
export class MemoryStorage implements IStorage {
  private surveys: Survey[] = [];
  private nextId = 1;

  async getSurveys(): Promise<Survey[]> {
    // Return surveys sorted by creation date (newest first)
    return [...this.surveys].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getSurvey(id: number): Promise<Survey | undefined> {
    return this.surveys.find(s => s.id === id);
  }

  async createSurvey(insertSurvey: InsertSurvey): Promise<Survey> {
    const now = new Date();
    const survey: Survey = {
      id: this.nextId++,
      name: insertSurvey.name,
      language: insertSurvey.language || "English",
      collectionMode: insertSurvey.collectionMode || "web",
      status: insertSurvey.status || "draft",
      createdAt: now,
      updatedAt: now,
      structure: insertSurvey.structure || null,
    };
    this.surveys.push(survey);
    return survey;
  }

  async updateSurvey(id: number, updates: UpdateSurveyRequest): Promise<Survey> {
    const index = this.surveys.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`Survey with id ${id} not found`);
    }
    
    const existing = this.surveys[index];
    const updated: Survey = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.surveys[index] = updated;
    return updated;
  }

  async deleteSurvey(id: number): Promise<void> {
    const index = this.surveys.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`Survey with id ${id} not found`);
    }
    this.surveys.splice(index, 1);
  }
}

// Use database storage if available, otherwise fall back to in-memory storage
// This allows the app to work in development without requiring a database
function createStorage(): IStorage {
  try {
    // Try to get the database connection
    getDb();
    // If successful, use database storage
    return new DatabaseStorage();
  } catch {
    // If database is not available, use in-memory storage
    console.warn("⚠️  Using in-memory storage. Data will not persist. Set DATABASE_URL to enable persistent storage.");
    return new MemoryStorage();
  }
}

export const storage = createStorage();
