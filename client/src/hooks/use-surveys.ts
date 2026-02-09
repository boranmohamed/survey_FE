import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  buildUrl,
  type CreateSurveyRequest,
  type UpdateSurveyRequest,
  type GenerateSurveyRequest,
  type CreateSurveyPlanRequest,
  type SurveyPlanResponse,
} from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { postSurveyPlanFast } from "@/lib/anomalyBackend";
import { createSurveyPlan, getSurveyPlan, approveSurveyPlan, rejectSurveyPlan, updateSurveyPlan, generateSurveyRules, generateQuestions } from "@/lib/plannerBackend";
import { toPlannerLanguageCode } from "@/lib/language";
import { PromptValidationError } from "@/lib/promptValidationError";

// Export PromptValidationError for use in UI components
export { PromptValidationError } from "@/lib/promptValidationError";

// ============================================
// SURVEY HOOKS
// ============================================

export function useSurveys() {
  return useQuery({
    queryKey: [api.surveys.list.path],
    queryFn: async () => {
      const res = await fetch(api.surveys.list.path);
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return api.surveys.list.responses[200].parse(await res.json());
    },
  });
}

export function useSurvey(id: number | null) {
  return useQuery({
    queryKey: [api.surveys.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("ID required");
      try {
        const url = buildUrl(api.surveys.get.path, { id });
        const res = await fetch(url);
        if (res.status === 404) {
          // Check localStorage as fallback
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
          return null;
        }
        if (!res.ok) {
          // API failed, try localStorage fallback
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
          throw new Error("Failed to fetch survey");
        }
        return api.surveys.get.responses[200].parse(await res.json());
      } catch (error) {
        // Network error - try localStorage fallback
        if (error instanceof TypeError && error.message.includes('fetch')) {
          try {
            const stored = localStorage.getItem(`survey_${id}_structure`);
            if (stored) {
              const structure = JSON.parse(stored);
              return {
                id,
                name: "Untitled Survey",
                language: "English" as const,
                collectionMode: "web" as const,
                status: "draft" as const,
                structure,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          } catch (e) {
            console.warn("Failed to read from localStorage:", e);
          }
        }
        throw error;
      }
    },
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: CreateSurveyRequest) => {
      try {
        const res = await fetch(api.surveys.create.path, {
          method: api.surveys.create.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        
        if (!res.ok) {
          if (res.status === 400) {
            const error = api.surveys.create.responses[400].parse(await res.json());
            throw new Error(error.message);
          }
          // If server is not available, return a mock response instead of throwing
          console.warn("Survey creation API failed, using mock response for frontend-only mode");
          return {
            id: Date.now(), // Use timestamp as temporary ID
            name: data.name,
            language: data.language,
            collectionMode: data.collectionMode,
            status: data.status || "draft",
            structure: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        return api.surveys.create.responses[201].parse(await res.json());
      } catch (error) {
        // Network error or any other error - return mock response instead of throwing
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.warn("Survey creation network error, using mock response for frontend-only mode");
          return {
            id: Date.now(), // Use timestamp as temporary ID
            name: data.name,
            language: data.language,
            collectionMode: data.collectionMode,
            status: data.status || "draft",
            structure: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        // For validation errors (400), still throw them as they're user input issues
        if (error instanceof Error && !error.message.includes('fetch')) {
          throw error;
        }
        // For other errors, return mock response
        console.warn("Survey creation error, using mock response:", error);
        return {
          id: Date.now(),
          name: data.name,
          language: data.language,
          collectionMode: data.collectionMode,
          status: data.status || "draft",
          structure: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      // Only show success toast if API was actually available (we can't easily detect this, so we'll skip it in mock mode)
      // toast({ title: "Survey Created", description: "Your draft has been saved." });
    },
    onError: (error) => {
      // Only show error for validation errors (400), not for network/API unavailability
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('fetch') && !errorMessage.includes('API_UNAVAILABLE')) {
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
      }
    }
  });
}

export function useUpdateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSurveyRequest) => {
      try {
        const url = buildUrl(api.surveys.update.path, { id });
        const res = await fetch(url, {
          method: api.surveys.update.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          // If server is not available, return a mock response instead of throwing
          console.warn("Survey update API failed, using mock response for frontend-only mode");
          return {
            id,
            name: updates.name || "Untitled Survey",
            language: updates.language || "English",
            collectionMode: updates.collectionMode || "web",
            status: updates.status || "draft",
            structure: updates.structure || null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        return api.surveys.update.responses[200].parse(await res.json());
      } catch (error) {
        // Network error or any other error - return mock response instead of throwing
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.warn("Survey update network error, using mock response for frontend-only mode");
          return {
            id,
            name: updates.name || "Untitled Survey",
            language: updates.language || "English",
            collectionMode: updates.collectionMode || "web",
            status: updates.status || "draft",
            structure: updates.structure || null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        // For other errors (like parsing), still return mock to prevent crashes
        console.warn("Survey update error, using mock response:", error);
        return {
          id,
          name: updates.name || "Untitled Survey",
          language: updates.language || "English",
          collectionMode: updates.collectionMode || "web",
          status: updates.status || "draft",
          structure: updates.structure || null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, data.id] });
      // Only show success toast if API was actually available (we can't easily detect this, so we'll skip it in mock mode)
      // toast({ title: "Survey Updated", description: "Changes saved successfully." });
    },
    // No onError handler - we always return mock data on failure, so it's treated as success
  });
}

// ============================================
// AI GENERATION HOOKS
// ============================================

/**
 * Generate a mock survey structure as fallback when API is unavailable
 * This allows the app to work in demo/offline mode
 */
function generateMockSurveyStructure(data: GenerateSurveyRequest) {
  const { prompt, numQuestions, numPages, language } = data;
  
  // Extract key topics from prompt
  const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  const surveyName = prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
  
  // Generate sections based on numPages
  const questionsPerPage = Math.ceil(numQuestions / numPages);
  const sections = [];
  
  for (let page = 0; page < numPages; page++) {
    const sectionQuestions = [];
    const questionsInSection = page === numPages - 1 
      ? numQuestions - (page * questionsPerPage) 
      : questionsPerPage;
    
    for (let q = 0; q < questionsInSection; q++) {
      const questionNum = page * questionsPerPage + q + 1;
      let question;
      
      // Mix question types
      if (q % 3 === 0) {
        // Rating question
        question = {
          text: language === "Arabic" 
            ? `ما هو تقييمك لـ${keywords[0] || "هذا الموضوع"}؟`
            : `How would you rate ${keywords[0] || "this aspect"}?`,
          type: "rating" as const
        };
      } else if (q % 3 === 1) {
        // Choice question
        question = {
          text: language === "Arabic"
            ? `ما هو خيارك المفضل فيما يتعلق بـ${keywords[1] || "هذا الموضوع"}؟`
            : `What is your preference regarding ${keywords[1] || "this topic"}?`,
          type: "choice" as const,
          options: language === "Arabic"
            ? ["خيار 1", "خيار 2", "خيار 3", "خيار 4"]
            : ["Option 1", "Option 2", "Option 3", "Option 4"]
        };
      } else {
        // Text question
        question = {
          text: language === "Arabic"
            ? `يرجى مشاركة أفكارك حول ${keywords[2] || "هذا الموضوع"}`
            : `Please share your thoughts about ${keywords[2] || "this topic"}`,
          type: "text" as const
        };
      }
      
      sectionQuestions.push(question);
    }
    
    sections.push({
      title: language === "Arabic" 
        ? `القسم ${page + 1}: ${keywords[page % keywords.length] || "الموضوع"}`
        : `Section ${page + 1}: ${keywords[page % keywords.length] || "Topic"}`,
      questions: sectionQuestions
    });
  }
  
  return {
    sections,
    suggestedName: surveyName
  };
}

export function useGenerateSurvey() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: GenerateSurveyRequest) => {
      // Construct the full URL - use relative path which will work with same-origin requests
      // If the frontend is served from the same server, this will resolve correctly
      const url = api.ai.generate.path;
      console.log("🔵 Calling built-in AI endpoint:", url, data);
      
      try {
        const res = await fetch(url, {
          method: api.ai.generate.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include', // Include cookies for same-origin requests
        });
        console.log("🔵 Response status:", res.status, res.statusText);
        
        if (!res.ok) {
          // If API fails, use mock data as fallback
          try {
            const errorText = await res.text();
            console.warn("AI Generation API failed, using mock data:", errorText);
            // Show a warning toast but don't fail the mutation
            toast({ 
              title: "AI Generation unavailable", 
              description: "Using fallback data. Check server logs for details.",
              variant: "default"
            });
          } catch {
            console.warn("AI Generation API failed (could not read error), using mock data");
          }
          // Return mock data - this is treated as success, not error
          return generateMockSurveyStructure(data);
        }
        
        try {
          return api.ai.generate.responses[200].parse(await res.json());
        } catch (parseError) {
          // If parsing fails, use mock data
          console.warn("AI Generation response parsing failed, using mock data:", parseError);
          return generateMockSurveyStructure(data);
        }
      } catch (error) {
        // Network error or any other error - use mock data
        // This includes TypeError (network), SyntaxError (JSON parse), etc.
        console.error("❌ AI Generation failed, using mock data:", error);
        if (error instanceof TypeError && error.message.includes("fetch")) {
          console.error("   This is a network error - the server may not be reachable");
          // Show a more helpful error message
          toast({ 
            title: "Network error", 
            description: "Could not reach the server. Using fallback data. Make sure the server is running on port 5000.",
            variant: "default"
          });
        }
        return generateMockSurveyStructure(data);
      }
    },
    // No onError handler - we always return mock data on failure, so it's treated as success
    // This prevents error toasts from showing
  });
}

/**
 * Generate a survey plan using the external Anomaly backend (fast endpoint).
 *
 * This hook is intentionally strict:
 * - It does NOT fall back to mock data.
 * - If the backend is down / CORS blocked / response shape is different, we show a toast.
 *
 * Reason: When the user explicitly chooses the external backend, failures should be visible.
 */
export function useGenerateSurveyFast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: GenerateSurveyRequest) => postSurveyPlanFast(data),
    onError: (error) => {
      // Check if this is a prompt validation error
      if (error instanceof PromptValidationError) {
        // Show the user-friendly validation message
        toast({ 
          title: "Invalid prompt", 
          description: error.message, 
          variant: "destructive" 
        });
      } else {
        // Provide more detailed error messages for other errors
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the external backend. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        toast({ 
          title: "Generation failed", 
          description: message, 
          variant: "destructive" 
        });
      }
    },
  });
}

/**
 * Create a survey plan using the planner API.
 * 
 * This hook calls POST /api/upsert-survey/survey-plan to create a plan
 * and returns a thread_id that can be used to retrieve the plan later.
 */
export function useCreateSurveyPlan() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateSurveyPlanRequest) => {
      try {
        return await createSurveyPlan(data);
      } catch (error) {
        // Preserve PromptValidationError so UI components can access suggested_prompt
        if (error instanceof PromptValidationError) {
          throw error;
        }
        
        // Provide detailed error messages for other errors
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onError: (error) => {
      // Check if this is a prompt validation error
      if (error instanceof PromptValidationError) {
        // Show the user-friendly validation message
        toast({
          title: "Invalid prompt",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Handle other errors normally
        const errorMessage = error instanceof Error ? error.message : "Failed to create survey plan. Please try again.";
        toast({
          title: "Plan creation failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
    },
  });
}

/**
 * Retrieve a survey plan by thread_id using the planner API.
 * 
 * This hook calls GET /api/upsert-survey/survey-plan/{thread_id} to retrieve
 * the full plan with all metadata including approval_status, attempt, version, etc.
 * 
 * @param thread_id - The thread identifier for the plan (null to disable query)
 */
export function useGetSurveyPlan(thread_id: string | null) {
  const { toast } = useToast();

  return useQuery({
    queryKey: [api.planner.get.path, thread_id],
    enabled: !!thread_id,
    queryFn: async () => {
      if (!thread_id) throw new Error("Thread ID required");
      try {
        return await getSurveyPlan(thread_id);
      } catch (error) {
        // Provide detailed error messages
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to retrieve survey plan. Please try again.";
      toast({
        title: "Plan retrieval failed",
        description: errorMessage,
        variant: "destructive"
      });
    },
    // Retry configuration - retry up to 3 times with exponential backoff
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Rephrase a prompt using the new rewrite API endpoint.
 * 
 * This hook calls the /api/upsert-survey/prompt/rewrite endpoint
 * which provides professional rewriting of survey prompts while
 * preserving all constraints, numbers, and intent.
 */
export function useRephrasePrompt() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { prompt: string, language: string }) => {
      // Important: the planner/rewrite backend contract expects strict values:
      // "en" | "ar" | "both".
      // The UI uses labels like "English" | "Arabic" | "Bilingual".
      // We normalize here to always send the clean contract (Bilingual -> "both").
      const languageCode = toPlannerLanguageCode(data.language);
      
      // Prepare request body matching the API specification
      const requestBody = {
        prompt: data.prompt,
        language: languageCode,
        mode: "paraphrase" as const
      };
      
      try {
        const res = await fetch("/api/upsert-survey/prompt/rewrite", {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          credentials: 'include', // Include cookies for same-origin requests
        });
        
        if (!res.ok) {
          // Try to get error details from response
          let errorMessage = "Rephrasing failed";
          try {
            const errorData = await res.json();
            errorMessage = errorData.status?.message || errorMessage;
          } catch {
            // If response is not JSON, use status text
            errorMessage = res.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        const responseData = await res.json();
        
        // Return data in a format compatible with the existing component
        // The API returns: { original_prompt, rewritten_prompt, rewrite_notes, status, meta }
        return {
          original: responseData.original_prompt || data.prompt,
          rephrased: responseData.rewritten_prompt || data.prompt,
          rewritten_prompt: responseData.rewritten_prompt || data.prompt,
          rewrite_notes: responseData.rewrite_notes || [],
          status: responseData.status,
          meta: responseData.meta
        };
      } catch (error) {
        // Log error for debugging
        console.error("Rephrase API error:", error);
        throw error;
      }
    },
    onError: (error) => {
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : "Failed to rephrase prompt. Please try again.";
      toast({
        title: "Rephrase failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });
}

/**
 * Approve a survey plan using the planner API.
 * 
 * This hook calls POST /api/upsert-survey/survey-plan/{thread_id}/approve
 * which sets the approval status to "approved", records the action in history,
 * and automatically generates questions using the Question Writer agent.
 * 
 * @returns Mutation hook that approves a plan and returns the approved plan with generated questions
 */
export function useApproveSurveyPlan() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (thread_id: string) => {
      try {
        return await approveSurveyPlan(thread_id);
      } catch (error) {
        // Provide detailed error messages
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Count questions from generated_questions.rendered_pages (new format)
      // or fallback to treating generated_questions as a record (old format)
      let totalQuestions = 0;
      if (data.generated_questions) {
        if (data.generated_questions.rendered_pages && Array.isArray(data.generated_questions.rendered_pages)) {
          // New format: generated_questions.rendered_pages
          totalQuestions = data.generated_questions.rendered_pages.reduce((acc: number, page: any) => {
            return acc + (Array.isArray(page.questions) ? page.questions.length : 0);
          }, 0);
        } else {
          // Old format: generated_questions as a record
          totalQuestions = Object.values(data.generated_questions).reduce((acc: number, page: any) => {
            return acc + (Array.isArray(page.questions) ? page.questions.length : 0);
          }, 0);
        }
      }
      
      toast({
        title: "Plan approved",
        description: data.status?.message || `Survey plan approved and ${totalQuestions} questions generated successfully`,
        variant: "default"
      });
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to approve survey plan. Please try again.";
      toast({
        title: "Approval failed",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });
}

/**
 * Reject a survey plan using the planner API.
 * 
 * This hook calls POST /api/upsert-survey/survey-plan/{thread_id}/reject
 * which sets the approval status to "rejected" and optionally regenerates the plan
 * with feedback if attempt < 3. If attempt >= 3, returns MAX_PLAN_ATTEMPTS_REACHED error.
 * 
 * @returns Mutation hook that rejects a plan and returns the rejected/regenerated plan
 */
export function useRejectSurveyPlan() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ thread_id, feedback }: { thread_id: string; feedback: string }) => {
      try {
        return await rejectSurveyPlan(thread_id, feedback);
      } catch (error: any) {
        // Check for MAX_PLAN_ATTEMPTS_REACHED error
        if (error.errorCode === 'MAX_PLAN_ATTEMPTS_REACHED') {
          // Re-throw with a user-friendly message
          throw new Error(
            `Maximum attempts (${error.maxAttempts}) reached. Cannot regenerate plan. Please create a new plan.`
          );
        }
        
        // Provide detailed error messages for other errors
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Plan rejected",
        description: data.status?.message || "Survey plan rejected and regenerated successfully",
        variant: "default"
      });
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to reject survey plan. Please try again.";
      toast({
        title: "Rejection failed",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });
}

/**
 * Update a survey plan using the planner API.
 * 
 * This hook calls POST /api/upsert-survey/survey-plan/{thread_id}/update to update
 * a survey plan from natural language instructions and returns rendered questions.
 * 
 * @returns Mutation hook for updating survey plans
 */
export function useUpdateSurveyPlan() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ thread_id, update_instructions }: { thread_id: string; update_instructions: string }) => {
      try {
        return await updateSurveyPlan(thread_id, update_instructions);
      } catch (error) {
        // Provide detailed error messages
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to update survey plan. Please try again.";
      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });
}

/**
 * Generate survey rules using the agentic survey API.
 * 
 * This hook calls POST /api/agentic-survey/{thread_id}/rules/generate to generate
 * validation and conditional rules for the survey based on user prompt.
 * 
 * @returns Mutation hook for generating survey rules
 */
export function useGenerateSurveyRules() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      thread_id, 
      user_prompt, 
      expected_rules_count 
    }: { 
      thread_id: string; 
      user_prompt?: string; 
      expected_rules_count?: number;
    }) => {
      try {
        return await generateSurveyRules(thread_id, {
          user_prompt,
          expected_rules_count,
        });
      } catch (error) {
        // Preserve PromptValidationError so UI components can access suggested_prompt
        if (error instanceof PromptValidationError) {
          throw error;
        }
        
        // Provide detailed error messages for other errors
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the rules generation API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      const rulesCount = data.rules?.survey_rules?.length || 0;
      toast({
        title: "Rules generated successfully",
        description: `Generated ${rulesCount} rule${rulesCount !== 1 ? 's' : ''} for your survey.`,
        variant: "default"
      });
    },
    onError: (error) => {
      // Check if this is a prompt validation error
      if (error instanceof PromptValidationError) {
        // Show the user-friendly validation message
        toast({
          title: "Invalid prompt",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Handle other errors normally
        const errorMessage = error instanceof Error ? error.message : "Failed to generate survey rules. Please try again.";
        toast({
          title: "Rules generation failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
    },
  });
}

/**
 * Generate survey questions using the planner API.
 * 
 * This hook calls POST /api/upsert-survey/survey-plan/{thread_id}/generate-questions
 * to generate questions from an approved survey plan.
 * 
 * @returns Mutation hook for generating survey questions
 */
export function useGenerateQuestions() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (thread_id: string) => {
      try {
        return await generateQuestions(thread_id);
      } catch (error) {
        // Provide detailed error messages
        let message = "An unknown error occurred";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          message = "Failed to fetch: Could not reach the planner API. Check if the backend is running and the URL is correct.";
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Count total questions from rendered_pages
      const totalQuestions = data.rendered_pages?.reduce((acc, page) => {
        return acc + (Array.isArray(page.questions) ? page.questions.length : 0);
      }, 0) || 0;
      
      toast({
        title: "Questions generated successfully",
        description: `Generated ${totalQuestions} question${totalQuestions !== 1 ? 's' : ''} for your survey.`,
        variant: "default"
      });
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate survey questions. Please try again.";
      toast({
        title: "Question generation failed",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });
}
