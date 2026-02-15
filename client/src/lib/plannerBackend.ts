import { 
  api, 
  type CreateSurveyPlanRequest, 
  type CreateSurveyPlanResponse,
  type SurveyPlanResponse,
  type GenerateValidateFixResponse,
  type RenderedPage
} from "@shared/routes";
import { RulesGenerationValidationError } from "./rulesGenerationError";
import { handlePromptValidationError, PromptValidationError } from "./promptValidationError";
import { getText } from "./bilingual";

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
 *   - `VITE_PLANNER_API_BASE_URL=http://192.168.2.131:8000`
 *   - `VITE_PLANNER_API_BASE_URL=http://192.168.2.131:8000/anomaly`
 */

// Default backend URL - can be overridden with VITE_PLANNER_API_BASE_URL environment variable
const DEFAULT_PLANNER_API_BASE_URL = "http://192.168.2.131:8000";

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
    return trimmed.slice(0, -anomalySuffix.length) || "http://192.168.2.131:8000";
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
  // Replace :thread_id parameter in the path (buildUrl would return full URL, but we need just the path)
  const path = api.planner.get.path.replace(':thread_id', thread_id);
  
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
 * Convert new survey structure (with survey.pages[].controls[]) to rendered_pages format
 * This handles the new API response structure from the approve endpoint
 */
function convertSurveyToRenderedPages(survey: any): RenderedPage[] {
  console.log("🔄 convertSurveyToRenderedPages called with:", {
    hasSurvey: !!survey,
    hasPages: !!survey?.pages,
    pagesIsArray: Array.isArray(survey?.pages),
    pagesCount: survey?.pages?.length || 0,
  });
  
  if (!survey || !survey.pages || !Array.isArray(survey.pages)) {
    console.warn("⚠️ convertSurveyToRenderedPages: Invalid survey structure", survey);
    return [];
  }

  return survey.pages.map((page: any) => {
    const controls = page.controls || [];
    const questions = controls.map((control: any) => {
      // Extract question text from label (can be object with language keys or string)
      // Combine English and Arabic if both exist, otherwise use available language
      const label = control.label || {};
      let questionText: string;
      if (typeof label === 'string') {
        questionText = label;
      } else {
        const enText = label.en || '';
        const arText = label.ar || '';
        if (enText && arText) {
          // Combine bilingual: "English / Arabic"
          questionText = `${enText} / ${arText}`;
        } else {
          // Use whichever is available
          questionText = enText || arText || Object.values(label)[0] || '';
        }
      }

      // Extract options from settings.props.options (correct path based on API structure)
      const options: string[] = [];
      // Try both paths: settings.props.options (new structure) and props.options (legacy)
      const optionsArray = control.settings?.props?.options || control.props?.options;
      
      if (optionsArray && Array.isArray(optionsArray) && optionsArray.length > 0) {
        optionsArray.forEach((opt: any, idx: number) => {
          try {
            const optLabel = opt.label || {};
            let optionText = '';
            
            if (typeof optLabel === 'string') {
              optionText = optLabel;
            } else if (optLabel && typeof optLabel === 'object') {
              const enOpt = optLabel.en || '';
              const arOpt = optLabel.ar || '';
              if (enOpt && arOpt) {
                // Combine bilingual: "English / Arabic"
                optionText = `${enOpt} / ${arOpt}`;
              } else {
                // Use whichever is available (prefer English, then Arabic, then any other value)
                optionText = enOpt || arOpt || (Object.values(optLabel).find((v: any) => v && typeof v === 'string') as string) || '';
              }
            }
            
            // Only add non-empty options
            if (optionText.trim().length > 0) {
              options.push(optionText);
            } else {
              console.warn(`⚠️ Empty option text for ${control.id} option ${idx}:`, opt);
            }
          } catch (error) {
            console.error(`❌ Error extracting option ${idx} for ${control.id}:`, error, opt);
          }
        });
        
        // Debug logging for options extraction
        if (options.length > 0) {
          console.log(`✅ Extracted ${options.length}/${optionsArray.length} options for ${control.id} (${control.type}):`, options.slice(0, 3));
        } else {
          console.warn(`⚠️ No valid options extracted for ${control.id} (${control.type}) - had ${optionsArray.length} options:`, optionsArray);
        }
      } else if (['radio', 'checkbox_list', 'dropdown_list', 'select'].includes(control.type)) {
        // Warn if question type requires options but none were found
        console.warn(`⚠️ Question ${control.id} is type ${control.type} but has no options. Checked:`, {
          hasSettingsPropsOptions: !!control.settings?.props?.options,
          hasPropsOptions: !!control.props?.options,
          settings: control.settings,
          props: control.props,
        });
      }

      // Extract scale information from settings.props.scale (correct path)
      // Try both paths: settings.props.scale (new structure) and props.scale (legacy)
      const scaleData = control.settings?.props?.scale || control.props?.scale;
      const scale = scaleData ? {
        min: scaleData.min,
        max: scaleData.max,
        labels: (() => {
          const labels = scaleData.labels || {};
          if (!labels || typeof labels === 'string') {
            return labels;
          }
          // Convert language-keyed labels to combined bilingual strings
          const result: any = {};
          if (labels.min) {
            if (typeof labels.min === 'string') {
              result.min = labels.min;
            } else {
              const enMin = labels.min.en || '';
              const arMin = labels.min.ar || '';
              result.min = (enMin && arMin) ? `${enMin} / ${arMin}` : (enMin || arMin || Object.values(labels.min)[0] || '');
            }
          }
          if (labels.max) {
            if (typeof labels.max === 'string') {
              result.max = labels.max;
            } else {
              const enMax = labels.max.en || '';
              const arMax = labels.max.ar || '';
              result.max = (enMax && arMax) ? `${enMax} / ${arMax}` : (enMax || arMax || Object.values(labels.max)[0] || '');
            }
          }
          return result;
        })()
      } : undefined;

      // Extract validation rules
      const validation = control.settings?.validations ? {
        required: control.settings.validations.required || false,
        max_length: control.settings.validations.max_length,
        min_length: control.settings.validations.min_length,
        pattern: control.settings.validations.pattern,
        ...control.settings.validations
      } : undefined;

      // Map question types: select -> dropdown_list (QuestionCard expects dropdown_list)
      let questionType = control.type || 'text';
      if (questionType === 'select') {
        questionType = 'dropdown_list';
      }

      const questionData = {
        spec_id: control.id || control.name || '',
        question_type: questionType,
        question_text: questionText,
        required: control.settings?.validations?.required || false,
        options: options, // Always include options array (even if empty)
        scale: scale,
        validation: validation,
        skip_logic: control.skip_logic || undefined,
      };
      
      // Debug logging for question data - especially for questions that should have options
      if (['radio', 'checkbox_list', 'dropdown_list', 'select'].includes(questionType)) {
        if (options.length > 0) {
          console.log(`✅ Question ${control.id} (${questionType}) - ${options.length} options:`, {
            text: questionText.substring(0, 50) + (questionText.length > 50 ? '...' : ''),
            options: options,
            fullQuestionData: questionData, // Log full question data for verification
          });
        } else {
          console.error(`❌ Question ${control.id} (${questionType}) - NO OPTIONS!`, {
            text: questionText.substring(0, 50),
            controlProps: control.props,
            hasPropsOptions: !!control.props?.options,
            propsOptionsLength: control.props?.options?.length || 0,
            propsOptions: control.props?.options,
          });
        }
      }
      
      return questionData;
    });

    // Extract page title (prefer title, then name, then id)
    // Can be object with language keys or string
    const pageTitle = page.title || page.name || {};
    const pageName = typeof pageTitle === 'string' 
      ? pageTitle 
      : (pageTitle.en || pageTitle.ar || page.id || `Page ${page.id || ''}`);

    return {
      name: pageName,
      questions: questions,
    };
  });
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
  
  // Check for new structure: { timestamp: "...", survey: { id, pages: [...], meta: {...} } }
  if (response.survey) {
    console.log("✅ Detected new survey structure format");
    const survey = response.survey;
    const threadId = survey.id || survey.meta?.thread_id || thread_id;
    const surveyVersion = survey.surveyVersion || survey.version || "1";
    
    // Log survey structure for debugging
    console.log("📋 Survey structure:", {
      id: survey.id,
      pagesCount: survey.pages?.length || 0,
      firstPageControlsCount: survey.pages?.[0]?.controls?.length || 0,
      firstControlType: survey.pages?.[0]?.controls?.[0]?.type,
      firstControlHasOptions: !!survey.pages?.[0]?.controls?.[0]?.props?.options,
      firstControlOptionsCount: survey.pages?.[0]?.controls?.[0]?.props?.options?.length || 0,
    });
    
    // Convert survey structure to rendered_pages format
    const renderedPages = convertSurveyToRenderedPages(survey);
    
    // Verify rendered pages have options
    console.log("📋 Rendered pages result:", {
      pagesCount: renderedPages.length,
      firstPageQuestionsCount: renderedPages[0]?.questions?.length || 0,
      firstQuestionType: renderedPages[0]?.questions?.[0]?.question_type,
      firstQuestionOptionsCount: renderedPages[0]?.questions?.[0]?.options?.length || 0,
      firstQuestionOptions: renderedPages[0]?.questions?.[0]?.options?.slice(0, 3),
    });
    
    // Extract title (can be object with language keys or string)
    const titleObj = survey.title || {};
    const title = typeof titleObj === 'string' 
      ? titleObj 
      : (titleObj.en || titleObj.ar || Object.values(titleObj)[0] || '');

    // Create a plan structure from the survey
    const plan = {
      title: title,
      type: survey.type || "survey",
      language: survey.language || "en",
      pages: survey.pages.map((page: any) => {
        // Prefer title, then name, then id for page name
        const pageTitle = page.title || page.name || {};
        const pageName = typeof pageTitle === 'string' 
          ? pageTitle 
          : (pageTitle.en || pageTitle.ar || page.id || '');
        return {
          name: pageName,
          question_specs: [], // Empty since we have rendered questions
        };
      }),
    };

    // Extract meta - can be at root level, nested in survey.meta, or both
    // Merge root-level timestamp with survey.meta if both exist
    const rootMeta = response.meta || (response.timestamp ? { timestamp: response.timestamp } : undefined);
    const surveyMeta = survey.meta;
    const mergedMeta = surveyMeta 
      ? { ...surveyMeta, ...(rootMeta || {}) }
      : rootMeta;

    // Verify rendered pages have options before returning
    const totalQuestions = renderedPages.reduce((sum, page) => sum + (page.questions?.length || 0), 0);
    const questionsWithOptions = renderedPages.flatMap(page => 
      (page.questions || []).filter(q => q.options && Array.isArray(q.options) && q.options.length > 0)
    );
    console.log("📊 Rendered pages summary:", {
      totalPages: renderedPages.length,
      totalQuestions: totalQuestions,
      questionsWithOptions: questionsWithOptions.length,
      sampleQuestionWithOptions: questionsWithOptions[0] ? {
        spec_id: questionsWithOptions[0].spec_id,
        type: questionsWithOptions[0].question_type,
        optionsCount: questionsWithOptions[0].options?.length,
        options: questionsWithOptions[0].options,
      } : null,
    });

    // Return normalized response in the expected format
    const normalizedResponse: SurveyPlanResponse = {
      meta: mergedMeta,
      status: { code: "success", message: "Plan approved successfully" },
      thread_id: threadId,
      plan: plan,
      approval_status: "approved" as const,
      attempt: 1, // Default attempt number
      version: parseInt(surveyVersion) || 1,
      generated_questions: {
        rendered_pages: renderedPages,
      },
    };

    console.log("✅ Normalized approve response (new structure) - generated_questions.rendered_pages:", {
      pagesCount: normalizedResponse.generated_questions?.rendered_pages?.length || 0,
      firstPageQuestionsCount: normalizedResponse.generated_questions?.rendered_pages?.[0]?.questions?.length || 0,
      firstQuestionHasOptions: !!normalizedResponse.generated_questions?.rendered_pages?.[0]?.questions?.[0]?.options,
      firstQuestionOptionsCount: normalizedResponse.generated_questions?.rendered_pages?.[0]?.questions?.[0]?.options?.length || 0,
    });
    return normalizedResponse;
  }
  
  // Legacy structure handling (for backward compatibility)
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

  console.log("✅ Normalized approve response (legacy structure):", JSON.stringify(normalizedResponse, null, 2));
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
 * Generate questions for a survey plan by calling the POST generate-questions endpoint.
 * Generates survey questions from an approved survey plan.
 *
 * This is a lightweight wrapper around the planner API that mirrors the behavior of
 * `generateValidateFixQuestions` but without the validation/fix step.
 *
 * @param thread_id - The unique thread identifier for the approved plan
 * @returns Response containing rendered pages with questions
 */
export async function generateQuestions(
  thread_id: string,
): Promise<GenerateValidateFixResponse> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/generate-questions`;

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
  console.log("🔍 Full planner API generate-questions response:", JSON.stringify(finalJson, null, 2));

  // Extract data from various possible response structures
  if (!finalJson || typeof finalJson !== "object") {
    throw new Error("Planner API returned invalid response");
  }

  const response = finalJson as any;

  // Extract fields from either data object or root level
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

  // Return normalized response with all fields at root level
  const normalizedResponse: GenerateValidateFixResponse = {
    meta: response.meta,
    status: response.status || { code: "success", message: "Questions generated successfully" },
    thread_id: threadId,
    rendered_pages: renderedPages,
    error: data.error || response.error || null,
    validation: data.validation || response.validation || null,
    saved: data.saved !== undefined ? data.saved : response.saved,
  };

  console.log("✅ Normalized generate-questions response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Generate survey rules by calling the POST generate rules endpoint.
 * Generates validation and conditional rules for the survey based on user prompt.
 *
 * This wrapper keeps the planner API contract isolated from UI components.
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
    // Include user_prompt even if it's an empty string - backend handles empty strings correctly
    requestBody.user_prompt = options.user_prompt;
    console.log("📤 Building request body with user_prompt:", {
      value: options.user_prompt,
      type: typeof options.user_prompt,
      length: typeof options.user_prompt === 'string' ? options.user_prompt.length : 'N/A'
    });
  } else {
    console.log("ℹ️ user_prompt is undefined, omitting from request body");
  }
  if (options?.expected_rules_count !== undefined) {
    requestBody.expected_rules_count = options.expected_rules_count;
  }
  
  console.log("📤 Final request body:", JSON.stringify(requestBody, null, 2));

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

      // Handle 422 (validation error) separately - check if it's a prompt validation error
      if (res.status === 422) {
        // Parse the error response first
        let errorData: any = null;
        try {
          errorData = text ? JSON.parse(text) : null;
          console.log("🔍 422 Error Response:", JSON.stringify(errorData, null, 2));
        } catch (parseError) {
          // If parsing fails, use default error
          console.warn("⚠️ Failed to parse 422 error response:", text);
          throw new RulesGenerationValidationError("Couldn't generate valid rules. Try rephrasing your request.");
        }

        // First, try to handle as PromptValidationError (structured error with reason_code, message, suggested_prompt)
        // handlePromptValidationError will throw PromptValidationError if it matches the structure
        try {
          handlePromptValidationError(res.status, text);
          // If we get here, handlePromptValidationError didn't throw, so it's not a PromptValidationError
          console.log("ℹ️ 422 error is not a PromptValidationError, using fallback handling");
        } catch (promptError) {
          // If handlePromptValidationError threw, it's a PromptValidationError - re-throw it
          if (promptError instanceof PromptValidationError) {
            console.log("✅ Detected PromptValidationError:", {
              reasonCode: promptError.reasonCode,
              message: promptError.message,
              hasSuggestedPrompt: !!promptError.suggestedPrompt
            });
            throw promptError;
          }
          // If it's some other error from parsing, re-throw it
          throw promptError;
        }
        
        // If not a PromptValidationError, fall back to RulesGenerationValidationError
        // Extract error message from the parsed error data
        let errorMessage = "Couldn't generate valid rules. Try rephrasing your request.";
        if (errorData?.detail) {
          // Handle both string and object detail formats
          if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else if (typeof errorData.detail === "object") {
            // Try to extract a user-friendly message
            if (errorData.detail.message) {
              errorMessage = errorData.detail.message;
            } else {
              errorMessage = "Couldn't generate valid rules. Try rephrasing your request.";
            }
          }
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
        console.log("ℹ️ Using RulesGenerationValidationError with message:", errorMessage);
        // Throw custom error that won't be logged as console error
        throw new RulesGenerationValidationError(errorMessage);
      }

      // For real server failures (500+), log as error
      if (res.status >= 500) {
        let errorMessage = `Rules generation API error (${res.status}). ${text || res.statusText}`;
        try {
          const errorData = text ? JSON.parse(text) : null;
          if (errorData?.detail) {
            if (typeof errorData.detail === "string") {
              errorMessage = errorData.detail;
            } else if (Array.isArray(errorData.detail)) {
              const errors = errorData.detail
                .map((err: any) => `${err.loc?.join(".")}: ${err.msg}`)
                .join("; ");
              errorMessage = `Validation error: ${errors}`;
            } else {
              errorMessage = JSON.stringify(errorData.detail);
            }
          } else if (errorData?.status?.message) {
            errorMessage = getText(errorData.status.message, "en");
          }
        } catch {
          // Use default error message
        }
        console.error("Rules generation API server error:", errorMessage);
        throw new Error(errorMessage);
      }

      // For other errors (400-499 except 422), handle normally
      let errorMessage = `Rules generation API error (${res.status}). ${text || res.statusText}`;
      try {
        const errorData = text ? JSON.parse(text) : null;
        if (errorData?.detail) {
          if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData.detail)) {
            const errors = errorData.detail
              .map((err: any) => `${err.loc?.join(".")}: ${err.msg}`)
              .join("; ");
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
  if (!finalJson || typeof finalJson !== "object") {
    throw new Error("Rules generation API returned invalid response");
  }

  const response = finalJson as any;

  // Check for new structure: { timestamp: "...", survey: { id, rules: [...], meta: {...} } }
  if (response.survey && response.survey.rules && Array.isArray(response.survey.rules)) {
    console.log("✅ Detected new survey structure format in rules response");
    const survey = response.survey;
    const threadId = survey.id || survey.meta?.thread_id || thread_id;
    const rulesArray = survey.rules;

    // Convert new rule format to expected format
    const convertedRules = rulesArray.map((rule: any) => {
      // Extract rule type from actions in the "then" array
      const ruleType = rule.if?.then?.[0]?.type || 'unknown';
      
      // Convert conditions from "when" array to expected format
      const conditions = (rule.if?.when || []).map((cond: any) => ({
        left_side: {
          type: cond.leftOperand?.type || 'question',
          question_id: cond.leftOperand?.value || '',
          data_type: cond.leftOperand?.data_type,
        },
        operator: cond.operator || '',
        right_side: {
          type: cond.rightOperand?.type || 'value',
          value: cond.rightOperand?.value || '',
          data_type: cond.rightOperand?.data_type,
        },
      }));

      // Convert actions from "then" array to expected format
      const actions = (rule.if?.then || []).map((action: any) => {
        // Handle target IDs - if it's an array, join them; otherwise use the single value
        let actionElement = '';
        if (action.target?.ids && Array.isArray(action.target.ids)) {
          actionElement = action.target.ids.join(', ');
        } else if (action.target?.ids) {
          actionElement = action.target.ids;
        } else if (action.target?.type) {
          actionElement = action.target.type;
        }

        return {
          type: action.type || '',
          action_element: actionElement,
          message_en: action.message?.en,
          message_ar: action.message?.ar,
          sequence: action.sequence,
          action_answer: action.action_answer,
        };
      });

      return {
        meta_rule: {
          rule_id: rule.id || '',
          rule_type: ruleType,
          description_en: rule.description?.en || '',
          description_ar: rule.description?.ar || '',
        },
        conditions: conditions,
        actions: actions,
      };
    });

    // Return normalized response in expected format
    const normalizedResponse = {
      thread_id: threadId,
      rules: {
        survey_rules: convertedRules,
      },
      critique_summary: undefined, // New structure doesn't include critique_summary
    };

    console.log("✅ Normalized rules generation response (new structure):", {
      thread_id: normalizedResponse.thread_id,
      rulesCount: normalizedResponse.rules.survey_rules.length,
      sampleRule: normalizedResponse.rules.survey_rules[0],
    });
    return normalizedResponse;
  }

  // Legacy structure handling (for backward compatibility)
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

  console.log("✅ Normalized rules generation response (legacy structure):", JSON.stringify(normalizedResponse, null, 2));
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
  
  // Check for new structure: { timestamp: "...", survey: { id, pages: [...], meta: {...} } }
  if (response.survey) {
    console.log("✅ Detected new survey structure format in update response");
    const survey = response.survey;
    const threadId = survey.id || survey.meta?.thread_id || thread_id;
    
    // Convert survey structure to rendered_pages format (same as approve)
    const renderedPages = convertSurveyToRenderedPages(survey);
    
    // Verify rendered pages have options
    const totalQuestions = renderedPages.reduce((sum, page) => sum + (page.questions?.length || 0), 0);
    const questionsWithOptions = renderedPages.flatMap(page => 
      (page.questions || []).filter(q => q.options && Array.isArray(q.options) && q.options.length > 0)
    );
    console.log("📊 Update rendered pages summary:", {
      totalPages: renderedPages.length,
      totalQuestions: totalQuestions,
      questionsWithOptions: questionsWithOptions.length,
    });

    // Extract meta - can be at root level, nested in survey.meta, or both
    const rootMeta = response.meta || (response.timestamp ? { timestamp: response.timestamp } : undefined);
    const surveyMeta = survey.meta;
    const mergedMeta = surveyMeta 
      ? { ...surveyMeta, ...(rootMeta || {}) }
      : rootMeta;

    // Return normalized response
    const normalizedResponse = {
      meta: mergedMeta,
      status: response.status || { code: "success", message: "Survey updated successfully" },
      thread_id: threadId,
      rendered_pages: renderedPages,
      error: null,
      validation: undefined,
      saved: undefined,
    };

    console.log("✅ Normalized update response (new structure):", {
      pagesCount: normalizedResponse.rendered_pages.length,
      firstPageQuestionsCount: normalizedResponse.rendered_pages[0]?.questions?.length || 0,
      firstQuestionHasOptions: !!normalizedResponse.rendered_pages[0]?.questions?.[0]?.options,
      firstQuestionOptionsCount: normalizedResponse.rendered_pages[0]?.questions?.[0]?.options?.length || 0,
    });
    return normalizedResponse;
  }
  
  // Legacy structure handling (for backward compatibility)
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

  console.log("✅ Normalized update response (legacy structure):", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Delete a question from a survey plan by calling the DELETE endpoint.
 * After deletion, remaining questions are automatically renumbered.
 * 
 * @param thread_id - The unique thread identifier for the survey plan
 * @param spec_id - The spec_id of the question to delete (format: p{page}_q{question})
 * @returns Response containing updated rendered pages with remaining questions
 */
export async function deleteQuestion(
  thread_id: string,
  spec_id: string,
): Promise<{
  meta?: any;
  status: { code: string; message: string };
  thread_id: string;
  rendered_pages: RenderedPage[];
}> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/question/${spec_id}`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doDelete = async (url: string) => {
    const res = await fetch(url, {
      method: "DELETE",
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
    const { res, text } = await doDelete(url);
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
  console.log("🔍 Full planner API delete question response:", JSON.stringify(finalJson, null, 2));

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
    status: response.status || { code: "success", message: "Question deleted successfully" },
    thread_id: threadId,
    rendered_pages: renderedPages,
  };

  console.log("✅ Normalized delete question response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

/**
 * Delete a page from a survey plan by calling the DELETE endpoint.
 * After deletion, remaining pages are automatically renumbered.
 * 
 * @param thread_id - The unique thread identifier for the survey plan
 * @param page_number - The page number to delete (1-indexed, e.g., 1 for first page, 2 for second page)
 * @returns Response containing updated rendered pages with remaining pages
 */
export async function deletePage(
  thread_id: string,
  page_number: number,
): Promise<{
  meta?: any;
  status: { code: string; message: string };
  thread_id: string;
  rendered_pages: RenderedPage[];
}> {
  const baseUrl =
    (import.meta as any).env?.VITE_PLANNER_API_BASE_URL ?? DEFAULT_PLANNER_API_BASE_URL;

  // Try multiple URL variants to handle different deployment configurations
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const path = `/api/upsert-survey/survey-plan/${thread_id}/page/${page_number}`;
  
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, path),
      joinUrl(baseUrl, `${path}/`),
      joinUrl(altBaseUrl, path),
      joinUrl(altBaseUrl, `${path}/`),
    ]),
  );

  const doDelete = async (url: string) => {
    const res = await fetch(url, {
      method: "DELETE",
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
    const { res, text } = await doDelete(url);
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
  console.log("🔍 Full planner API delete page response:", JSON.stringify(finalJson, null, 2));

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
    status: response.status || { code: "success", message: "Page deleted successfully" },
    thread_id: threadId,
    rendered_pages: renderedPages,
  };

  console.log("✅ Normalized delete page response:", JSON.stringify(normalizedResponse, null, 2));
  return normalizedResponse;
}

