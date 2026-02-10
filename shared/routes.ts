import { z } from 'zod';
import { insertSurveySchema, surveys, generateSurveySchema } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// PLANNER API TYPES (must be defined before api object)
// ============================================

/**
 * Planner API types matching the backend SurveyPlanResponseDTO structure.
 * These types represent the full response from the planner API including
 * metadata, approval status, and the complete plan structure.
 */

// Question specification from planner API
export const planQuestionSpecSchema = z.object({
  spec_id: z.string(),
  question_type: z.string(),
  language: z.string(),
  intent: z.string(),
  required: z.boolean(),
  options_hint: z.array(z.string()).default([]),
});

// Section brief schema - new format for page-level planning guidance
// Used when planner provides high-level guidance instead of detailed question specs
export const sectionBriefSchema = z.object({
  question_count: z.number().optional(), // Expected number of questions for this section
  summary: z.string().optional(), // Brief summary of what this section should cover
  topics: z.array(z.string()).optional(), // Topics to cover in this section
  guidance: z.array(z.string()).optional(), // Guidance for question generation
  must_include: z.array(z.string()).optional(), // Topics/questions that must be included
  avoid: z.array(z.string()).optional(), // Topics/questions to avoid
});

// Page structure from planner API
// Supports both formats: question_specs (detailed) and section_brief (high-level guidance)
export const planPageSchema = z.object({
  name: z.string(),
  question_specs: z.array(planQuestionSpecSchema).optional(), // Detailed question specifications (legacy format)
  section_brief: sectionBriefSchema.optional(), // High-level section guidance (new format)
});

// Plan rationale schema - explains the planning decisions
// The summary field provides a brief explanation of the overall plan approach
// Note: summary is optional to handle cases where older plans may not have it
export const planRationaleSchema = z.object({
  summary: z.string().optional(), // Brief explanation of overall plan approach
  page_and_count_reasoning: z.array(z.string()).optional(), // Reasoning for page count decisions
  question_type_reasoning: z.array(z.any()).optional(), // Reasoning for question type choices - can be string or { question_type: string; why: string }
  assumptions: z.array(z.string()).optional(), // Assumptions made during planning
  contextual_insights: z.object({
    title: z.string().optional(), // Contextual insights about the survey title
    type: z.string().optional(), // Contextual insights about the survey type
    language: z.string().optional(), // Contextual insights about the survey language
  }).optional(), // Additional contextual insights about the survey
});

// Plan structure from planner API
export const planSchema = z.object({
  title: z.string(),
  type: z.string(),
  language: z.string(),
  conflict_resolution: z.string().optional(),
  pages: z.array(planPageSchema),
  estimated_question_count: z.number().optional(),
  version: z.number().optional(),
  created_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  user_requested_number_of_questions: z.number().nullable().optional(),
  user_requested_number_of_pages: z.number().nullable().optional(),
  suggested_number_of_questions: z.number().nullable().optional(),
  suggested_number_of_pages: z.number().nullable().optional(),
  final_number_of_questions: z.number().nullable().optional(),
  final_number_of_pages: z.number().nullable().optional(),
  limits: z.record(z.any()).optional(),
  distribution: z.record(z.any()).optional(),
  // Plan rationale - optional for backward compatibility with older plans
  plan_rationale: planRationaleSchema.nullable().optional(),
});

// Meta information from API response
export const metaSchema = z.object({
  run_id: z.string().optional(),
  timestamp: z.string().optional(),
  trace_id: z.string().optional(),
  model_info: z.record(z.any()).optional(),
});

// Status information from API response
export const statusSchema = z.object({
  code: z.string(),
  message: z.string(),
});

// Full planner API response
// The API wraps the response in a standard format with a 'data' field
export const surveyPlanResponseSchema = z.object({
  meta: metaSchema.optional(),
  status: statusSchema,
  data: z.object({
    thread_id: z.string(),
    plan: planSchema,
    approval_status: z.enum(["awaiting_approval", "approved", "rejected"]),
    attempt: z.number(),
    version: z.number(),
    generated_questions: z.record(z.any()).optional(),
  }).optional(),
  // Also support direct fields at root level for backward compatibility
  thread_id: z.string().optional(),
  plan: planSchema.optional(),
  approval_status: z.enum(["awaiting_approval", "approved", "rejected"]).optional(),
  attempt: z.number().optional(),
  version: z.number().optional(),
  generated_questions: z.record(z.any()).optional(),
});

// Request schema for creating a survey plan
export const createSurveyPlanRequestSchema = z.object({
  prompt: z.string().min(10),
  title: z.string(),
  type: z.string(),
  language: z.string(),
  numQuestions: z.number().min(1).max(20).optional(),
  numPages: z.number().min(1).max(5).optional(),
  // Optional file attachment fields - sent as text content and file name
  attachedFileContent: z.string().optional(),
  attachedFileName: z.string().optional(),
});

// Response schema for creating a survey plan (returns thread_id)
// The API wraps the response in a standard format with a 'data' field
export const createSurveyPlanResponseSchema = z.object({
  meta: metaSchema.optional(),
  status: statusSchema,
  data: z.object({
    thread_id: z.string(),
    message: z.string().optional(),
  }).optional(),
  // Also support direct thread_id at root level for backward compatibility
  thread_id: z.string().optional(),
  message: z.string().optional(),
});

// Rendered question schema for generate-validate-fix response
export const renderedQuestionSchema = z.object({
  spec_id: z.string(),
  question_type: z.string(),
  question_text: z.string(),
  required: z.boolean(),
  options: z.array(z.string()),
  scale: z.record(z.any()).nullable().optional(),
  validation: z.record(z.any()).nullable().optional(),
  skip_logic: z.record(z.any()).nullable().optional(),
});

// Rendered page schema for generate-validate-fix response
export const renderedPageSchema = z.object({
  name: z.string(),
  questions: z.array(renderedQuestionSchema),
});

// Validation result schema
export const validationResultSchema = z.object({
  passed: z.boolean(),
  issue_count: z.number(),
  issues: z.array(z.any()).optional(),
});

// Response schema for generate-validate-fix endpoint
export const generateValidateFixResponseSchema = z.object({
  meta: metaSchema.optional(),
  status: statusSchema,
  thread_id: z.string(),
  rendered_pages: z.array(renderedPageSchema),
  error: z.string().nullable().optional(),
  validation: validationResultSchema.nullable().optional(),
  saved: z.boolean().optional(),
});

// ============================================
// API CONTRACT
// ============================================
export const api = {
  surveys: {
    list: {
      method: 'GET' as const,
      path: '/api/surveys',
      responses: {
        200: z.array(z.custom<typeof surveys.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/surveys/:id',
      responses: {
        200: z.custom<typeof surveys.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/surveys',
      input: insertSurveySchema,
      responses: {
        201: z.custom<typeof surveys.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/surveys/:id',
      input: insertSurveySchema.partial().extend({
        structure: z.custom<any>().optional()
      }),
      responses: {
        200: z.custom<typeof surveys.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/surveys/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  ai: {
    generate: {
      method: 'POST' as const,
      path: '/api/ai/generate',
      input: generateSurveySchema,
      responses: {
        200: z.object({
          sections: z.array(z.object({
            title: z.string(),
            questions: z.array(z.object({
              text: z.string(),
              // Accept any question type string (scale, radio, checkbox, star_rating, text_area, etc.)
              // This matches what the backend returns and what the database schema stores
              type: z.string(),
              options: z.array(z.string()).optional(),
              // Metadata fields from planner API (optional to maintain backward compatibility)
              spec_id: z.string().optional(),
              required: z.boolean().optional(),
              validation: z.record(z.any()).optional(),
              skip_logic: z.record(z.any()).optional(),
              scale: z.record(z.any()).optional()
            }))
          })),
          suggestedName: z.string().optional()
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal
      }
    },
    rephrase: {
      method: 'POST' as const,
      path: '/api/ai/rephrase',
      input: z.object({
        prompt: z.string(),
        language: z.string()
      }),
      responses: {
        200: z.object({
          rephrased: z.string(),
          original: z.string()
        }),
        500: errorSchemas.internal
      }
    }
  },
  planner: {
    create: {
      method: 'POST' as const,
      path: '/api/upsert-survey/survey-plan',
      input: createSurveyPlanRequestSchema,
      responses: {
        200: createSurveyPlanResponseSchema,
        400: errorSchemas.validation,
        500: errorSchemas.internal
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/upsert-survey/survey-plan/:thread_id',
      responses: {
        200: surveyPlanResponseSchema,
        404: errorSchemas.notFound,
        500: errorSchemas.internal
      }
    }
  }
};

// ============================================
// API BASE URL CONFIGURATION
// ============================================
/**
 * Get the API base URL from environment variable or use default
 * Can be set via VITE_API_BASE_URL environment variable
 * Defaults to http://127.0.0.1:8000
 */
export function getApiBaseUrl(): string {
  // Check for Vite environment variable
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Fallback to default backend URL
  return 'http://127.0.0.1:8000';
}

// ============================================
// HELPER FUNCTIONS
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  // Prepend API base URL if path starts with /api
  if (url.startsWith('/api')) {
    const baseUrl = getApiBaseUrl();
    // Remove trailing slash from baseUrl if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    return `${cleanBaseUrl}${url}`;
  }
  return url;
}

// ============================================
// PLANNER API TYPE EXPORTS
// ============================================

// Type exports
export type PlanQuestionSpec = z.infer<typeof planQuestionSpecSchema>;
export type SectionBrief = z.infer<typeof sectionBriefSchema>;
export type PlanPage = z.infer<typeof planPageSchema>;
export type PlanRationale = z.infer<typeof planRationaleSchema>;
export type Plan = z.infer<typeof planSchema>;
export type SurveyPlanResponse = z.infer<typeof surveyPlanResponseSchema>;
export type CreateSurveyPlanRequest = z.infer<typeof createSurveyPlanRequestSchema>;
export type CreateSurveyPlanResponse = z.infer<typeof createSurveyPlanResponseSchema>;
export type RenderedQuestion = z.infer<typeof renderedQuestionSchema>;
export type RenderedPage = z.infer<typeof renderedPageSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type GenerateValidateFixResponse = z.infer<typeof generateValidateFixResponseSchema>;

// ============================================
// TYPE HELPERS
// ============================================
export type SurveyResponse = z.infer<typeof api.surveys.get.responses[200]>;
export type GenerateSurveyResponse = z.infer<typeof api.ai.generate.responses[200]>;
