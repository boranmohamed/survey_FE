import { 
  api, 
  buildUrl,
  type CreateSurveyPlanRequest, 
  type CreateSurveyPlanResponse,
  type SurveyPlanResponse,
  type GenerateValidateFixResponse,
  type RenderedPage
} from "@shared/routes";

/**
 * Planner backend integration (Python/FastAPI).
 *
 * This file handles communication with the planner API endpoints:
 * - POST /api/upsert-survey/survey-plan - Creates a survey plan and returns thread_id
 * - GET /api/upsert-survey/survey-plan/{thread_id} - Retrieves a survey plan by thread_id
 *
 * Configure the backend base URL:
 * - Set `VITE_PLANNER_API_BASE_URL` in a `client/.env` file (Vite reads env vars from `client/`).
 * - Example values:
 *   - `VITE_PLANNER_API_BASE_URL=http://127.0.0.1:8000`
 *   - `VITE_PLANNER_API_BASE_URL=http://127.0.0.1:8000/anomaly`
 */

// Default backend URL - can be overridden with VITE_PLANNER_API_BASE_URL environment variable
const DEFAULT_PLANNER_API_BASE_URL = "http://192.168.2.70:8000";

/**
 * Helper function to join base URL with path, handling trailing slashes
 */
function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}

/**
 * Helper function to toggle anomaly prefix for URL flexibility
 * Some deployments mount the app at `/anomaly`, others at root.
 */
function toggleAnomalyPrefix(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const anomalySuffix = "/anomaly";
  if (trimmed.toLowerCase().endsWith(anomalySuffix)) {
    return trimmed.slice(0, -anomalySuffix.length) || "http://127.0.0.1:8000";
  }
  return `${trimmed}${anomalySuffix}`;
}

/**
 * Create a survey plan by calling the POST endpoint.
 * Returns the thread_id which can be used to retrieve the plan later.
 * 
 * @param data - Request data including prompt, title, type, language, etc.
 * @returns Response containing thread_id
 */
export async function createSurveyPlan(
  data: CreateSurveyPlanRequest,
): Promise<CreateSurveyPlanResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, api.planner.create.path),
      joinUrl(baseUrl, `${api.planner.create.path}/`),
      joinUrl(altBaseUrl, api.planner.create.path),
      joinUrl(altBaseUrl, `${api.planner.create.path}/`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: api.planner.create.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      throw new Error(`Planner API error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API create response:", JSON.stringify(finalJson, null, 2));

  // Extract thread_id from various possible response structures
  let threadId: string | undefined;
  
  // Try different possible locations for thread_id
  if (finalJson && typeof finalJson === 'object') {
    const response = finalJson as any;
    // Check data.thread_id first (most common wrapped format)
    threadId = response.data?.thread_id;
    // Check thread_id at root level
    if (!threadId) threadId = response.thread_id;
    // Check if data is the thread_id itself (unlikely but possible)
    if (!threadId && typeof response.data === 'string') threadId = response.data;
  }

  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error(
      `Planner API response does not contain thread_id. Response structure: ${JSON.stringify(finalJson).substring(0, 500)}...`,
    );
  }

  // Return normalized response
  return {
    meta: (finalJson as any)?.meta,
    status: (finalJson as any)?.status || { code: "success", message: "Plan created successfully" },
    thread_id: threadId,
    message: (finalJson as any)?.data?.message || (finalJson as any)?.message,
  };
}

/**
 * Retrieve a survey plan by thread_id.
 * 
 * @param thread_id - The unique thread identifier for the plan
 * @returns Full survey plan response with all metadata
 */
export async function getSurveyPlan(
  thread_id: string,
): Promise<SurveyPlanResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = buildUrl(api.planner.get.path, { thread_id });
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doGet = async (url: string) => {
    const res = await fetch(url, {
      method: api.planner.get.method,
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doGet(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      throw new Error(`Planner API error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API get response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract fields from either data object or root level
  const data = response.data || response;
  
  // Extract thread_id
  const threadId = data.thread_id || response.thread_id;
  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  // Extract plan
  const plan = data.plan || response.plan;
  if (!plan) {
    console.error("❌ Could not find plan in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain plan");
  }

  // Extract other required fields
  const approvalStatus = data.approval_status || response.approval_status;
  const attempt = data.attempt !== undefined ? data.attempt : response.attempt;
  const version = data.version !== undefined ? data.version : response.version;

  if (approvalStatus === undefined || attempt === undefined || version === undefined) {
    console.error("❌ Response missing required fields:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response missing required fields (approval_status, attempt, or version)");
  }

  // Return normalized response with all fields at root level
  const normalizedResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Plan retrieved successfully" },
    thread_id: threadId,
    plan: plan,
    approval_status: approvalStatus,
    attempt: attempt,
    version: version,
    generated_questions: data.generated_questions || response.generated_questions,
  };

  console.log("✅ Normalized planner response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Approve a survey plan by calling the POST approve endpoint.
 * This sets the approval status to "approved", records the action in history,
 * and automatically generates questions using the Question Writer agent.
 * 
 * @param thread_id - The unique thread identifier for the plan
 * @returns Full survey plan response with generated_questions field
 */
export async function approveSurveyPlan(
  thread_id: string,
): Promise<SurveyPlanResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/approve`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // Empty body is acceptable
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      throw new Error(`Planner API error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API approve response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract fields from either data object or root level
  const data = response.data || response;
  
  // Extract thread_id
  const threadId = data.thread_id || response.thread_id;
  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  // Extract plan
  const plan = data.plan || response.plan;
  if (!plan) {
    console.error("❌ Could not find plan in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain plan");
  }

  // Extract other required fields
  const approvalStatus = data.approval_status || response.approval_status;
  const attempt = data.attempt !== undefined ? data.attempt : response.attempt;
  const version = data.version !== undefined ? data.version : response.version;

  if (approvalStatus === undefined || attempt === undefined || version === undefined) {
    console.error("❌ Response missing required fields:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response missing required fields (approval_status, attempt, or version)");
  }

  // Return normalized response with all fields at root level
  const normalizedResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Plan approved successfully" },
    thread_id: threadId,
    plan: plan,
    approval_status: approvalStatus,
    attempt: attempt,
    version: version,
    generated_questions: data.generated_questions || response.generated_questions,
  };

  console.log("✅ Normalized approve response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Reject a survey plan by calling the POST reject endpoint.
 * This sets the approval status to "rejected" and optionally regenerates the plan
 * with feedback if attempt < 3. If attempt >= 3, returns an error.
 * 
 * @param thread_id - The unique thread identifier for the plan
 * @param feedback - Required feedback explaining why the plan was rejected
 * @returns Full survey plan response with regenerated plan (if attempt < 3)
 * @throws Error with MAX_PLAN_ATTEMPTS_REACHED if attempt >= 3
 */
export async function rejectSurveyPlan(
  thread_id: string,
  feedback: string,
): Promise<SurveyPlanResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/reject`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }), // Feedback is required
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      
      // Check for MAX_PLAN_ATTEMPTS_REACHED error (400)
      if (res.status === 400) {
        try {
          const errorData = JSON.parse(text);
          if (errorData.detail?.error_code === 'MAX_PLAN_ATTEMPTS_REACHED') {
            // Create a custom error that can be caught and handled specially
            const error = new Error(errorData.detail.message || "Maximum plan attempts reached");
            (error as any).errorCode = 'MAX_PLAN_ATTEMPTS_REACHED';
            (error as any).threadId = errorData.detail.thread_id;
            (error as any).currentAttempt = errorData.detail.current_attempt;
            (error as any).maxAttempts = errorData.detail.max_attempts;
            throw error;
          }
        } catch (parseError) {
          // If parsing fails, throw generic error
        }
      }
      
      throw new Error(`Planner API error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API reject response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract fields from either data object or root level
  const data = response.data || response;
  
  // Extract thread_id
  const threadId = data.thread_id || response.thread_id;
  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  // Extract plan
  const plan = data.plan || response.plan;
  if (!plan) {
    console.error("❌ Could not find plan in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain plan");
  }

  // Extract other required fields
  const approvalStatus = data.approval_status || response.approval_status;
  const attempt = data.attempt !== undefined ? data.attempt : response.attempt;
  const version = data.version !== undefined ? data.version : response.version;

  if (approvalStatus === undefined || attempt === undefined || version === undefined) {
    console.error("❌ Response missing required fields:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response missing required fields (approval_status, attempt, or version)");
  }

  // Return normalized response with all fields at root level
  const normalizedResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Plan rejected and regenerated successfully" },
    thread_id: threadId,
    plan: plan,
    approval_status: approvalStatus,
    attempt: attempt,
    version: version,
    generated_questions: data.generated_questions || response.generated_questions,
  };

  console.log("✅ Normalized reject response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Generate, validate, and fix questions for an approved survey plan.
 * This endpoint generates questions from the approved plan, validates them,
 * and optionally fixes issues automatically.
 * 
 * @param thread_id - The unique thread identifier for the approved plan
 * @param auto_fix - Whether to automatically fix validation issues (default: true)
 * @returns Response containing rendered pages with questions, validation results, and save status
 */
export async function generateValidateFixQuestions(
  thread_id: string,
  auto_fix: boolean = true,
): Promise<GenerateValidateFixResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/generate-validate-fix`;
  const queryParam = `?auto_fix=${auto_fix}`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, `${path}${queryParam}`),
      joinUrl(baseUrl, `${path}/${queryParam}`),
      joinUrl(altBaseUrl, `${path}${queryParam}`),
      joinUrl(altBaseUrl, `${path}/${queryParam}`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // Empty body is acceptable
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      throw new Error(`Planner API error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API generate-validate-fix response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract fields from either data object or root level
  const data = response.data || response;
  
  // Extract thread_id
  const threadId = data.thread_id || response.thread_id;
  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  // Extract rendered_pages
  const renderedPages = data.rendered_pages || response.rendered_pages;
  if (!renderedPages || !Array.isArray(renderedPages)) {
    console.error("❌ Could not find rendered_pages in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain rendered_pages");
  }

  // Return normalized response with all fields at root level
  const normalizedResponse: GenerateValidateFixResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Questions generated, validated, and fixed successfully" },
    thread_id: threadId,
    rendered_pages: renderedPages,
    error: data.error || response.error || null,
    validation: data.validation || response.validation || null,
    saved: data.saved !== undefined ? data.saved : response.saved,
  };

  console.log("✅ Normalized generate-validate-fix response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Update a survey plan by calling the POST update endpoint.
 * Updates the survey plan from natural language instructions, generates questions,
 * and returns the rendered survey.
 * 
 * @param thread_id - The unique thread identifier for the plan to update
 * @param update_instructions - Natural language instructions describing what to change
 * @returns Response containing rendered pages with updated questions
 */
export async function updateSurveyPlan(
  thread_id: string,
  update_instructions: string,
): Promise<{
  meta?: any;
  status: { code: string; message: string };
  thread_id: string;
  rendered_pages: RenderedPage[];
  error: string | null;
  validation?: any;
  saved?: boolean;
}> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/update`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_instructions: update_instructions,
        // meta is optional - can be omitted
      }),
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      
      // Try to parse error response
      let errorMessage = `Planner API error (${res.status}). ${text || res.statusText}`;
      try {
        const errorData = text ? JSON.parse(text) : null;
        if (errorData?.detail) {
          errorMessage = errorData.detail;
        } else if (errorData?.status?.message) {
          errorMessage = errorData.status.message;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Planner API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Planner API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full planner API update response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract data from either data object or root level
  const data = response.data || response;
  
  // Extract thread_id
  const threadId = data.thread_id || response.thread_id || thread_id;
  if (!threadId) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  // Extract rendered_pages
  const renderedPages = data.rendered_pages || response.rendered_pages;
  if (!renderedPages || !Array.isArray(renderedPages)) {
    console.error("❌ Could not find rendered_pages in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain rendered_pages");
  }

  // Return normalized response
  const normalizedResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Survey updated successfully" },
    thread_id: threadId,
    rendered_pages: renderedPages,
    error: data.error || response.error || null,
    validation: data.validation || response.validation,
    saved: data.saved !== undefined ? data.saved : response.saved,
  };

  console.log("✅ Normalized update response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Generate survey rules by calling the POST generate rules endpoint.
 * Generates validation and conditional rules for the survey based on user prompt.
 * 
 * @param thread_id - The unique thread identifier for the survey
 * @param options - Optional parameters for rule generation
 * @param options.user_prompt - Custom instructions for rule generation
 * @param options.expected_rules_count - Target number of rules (default: 8, min: 1, max: 50)
 * @returns Response containing generated rules and validation summary
 */
export async function generateSurveyRules(
  thread_id: string,
  options?: {
    user_prompt?: string;
    expected_rules_count?: number;
  }
): Promise<{
  thread_id: string;
  rules: {
    survey_rules: Array<{
      meta_rule: {
        rule_id: string;
        rule_type: string;
        description_en: string;
        description_ar: string;
      };
      conditions: Array<{
        left_side: {
          type: string;
          question_id: string;
          data_type?: string;
        };
        operator: string;
        right_side: {
          type: string;
          value: any;
          data_type?: string;
        };
      }>;
      actions: Array<{
        type: string;
        action_element: string;
        message_en?: string;
        message_ar?: string;
        sequence?: number;
        action_answer?: string;
      }>;
    }>;
  };
  critique_summary?: {
    initial_validation: {
      valid_count: number;
      invalid_count: number;
      errors_by_category?: Record<string, any>;
    };
    after_fixing: {
      valid_count: number;
      invalid_count: number;
    };
    final_rules_count: number;
  };
}> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/agentic-survey/${thread_id}/rules/generate`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  // Build request body - only include fields that are provided
  const requestBody: any = {};
  if (options?.user_prompt !== undefined) {
    requestBody.user_prompt = options.user_prompt;
  }
  if (options?.expected_rules_count !== undefined) {
    requestBody.expected_rules_count = options.expected_rules_count;
  }

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const text = await res.text();
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  // Try each candidate URL until one succeeds
  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      
      // Try to parse error response
      let errorMessage = `Rules generation API error (${res.status}). ${text || res.statusText}`;
      try {
        const errorData = text ? JSON.parse(text) : null;
        if (errorData?.detail) {
          // Handle both string and array detail formats
          if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData.detail)) {
            // Validation errors - format them nicely
            const errors = errorData.detail.map((err: any) => 
              `${err.loc?.join('.')}: ${err.msg}`
            ).join('; ');
            errorMessage = `Validation error: ${errors}`;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        } else if (errorData?.status?.message) {
          errorMessage = errorData.status.message;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Rules generation API returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Rules generation API error (404). The endpoint was not found. Tried: ${candidateUrls.join(", ")}`,
    );
  }

  // Log the full response for debugging
  console.log("🔍 Full rules generation API response:", JSON.stringify(finalJson, null, 2));

  // Validate response structure
  if (!finalJson || typeof finalJson !== 'object') {
    throw new Error("Rules generation API returned invalid response");
  }

  const response = finalJson as any;
  
  // Extract data from either data object or root level
  const data = response.data || response;
  
  // Validate required fields
  if (!data.thread_id && !response.thread_id) {
    console.error("❌ Could not find thread_id in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain thread_id");
  }

  if (!data.rules && !response.rules) {
    console.error("❌ Could not find rules in response:", JSON.stringify(finalJson, null, 2));
    throw new Error("Response does not contain rules");
  }

  // Return normalized response
  const normalizedResponse = {
    thread_id: data.thread_id || response.thread_id || thread_id,
    rules: data.rules || response.rules,
    critique_summary: data.critique_summary || response.critique_summary,
  };

  console.log("✅ Normalized rules generation response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

