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
              type: z.enum(["rating", "text", "choice"]),
              options: z.array(z.string()).optional()
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
  }
};

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
  return url;
}

// ============================================
// TYPE HELPERS
// ============================================
export type SurveyResponse = z.infer<typeof api.surveys.get.responses[200]>;
export type GenerateSurveyResponse = z.infer<typeof api.ai.generate.responses[200]>;
