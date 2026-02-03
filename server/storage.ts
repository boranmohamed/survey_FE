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

export const storage = new DatabaseStorage();
