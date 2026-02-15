import { api, type GenerateSurveyResponse } from "@shared/routes";
import { type GenerateSurveyRequest } from "@shared/schema";
import { handlePromptValidationError } from "./promptValidationError";
import { getText, getUserLanguagePreference } from "./bilingual";

/**
 * Anomaly backend integration (Python/FastAPI).
 *
 * Why this file exists:
 * - We want the UI to be able to call an external backend (running on `192.168.2.71:8000`)
 *   without mixing URL-building and response-shape guessing inside React components.
 * - We keep parsing/normalization here so the rest of the app can rely on the existing
 *   `GeneratedSurveyResponse` shape used by `BlueprintReview`.
 *
 * Configure the backend base URL:
 * - Set `VITE_ANOMALY_API_BASE_URL` in a `client/.env` file (Vite reads env vars from `client/`).
 * - Example values:
 *   - `VITE_ANOMALY_API_BASE_URL=http://192.168.2.71:8000/anomaly`
 *   - `VITE_ANOMALY_API_BASE_URL=http://192.168.2.71:8000`
 */

// Default backend URL - can be overridden with VITE_ANOMALY_API_BASE_URL environment variable
// If your backend uses the /anomaly prefix, keep it. Otherwise, remove /anomaly
// Default to localhost for the common case (backend running on the same machine).
// We intentionally do NOT hardcode a specific LAN IP here because it changes per network/device.
const DEFAULT_ANOMALY_API_BASE_URL = "http://192.168.2.71:8000";
const SURVEY_PLAN_FAST_PATH = "/api/upsert-survey/survey-plan/fast";

/**
 * See `plannerBackend.ts` for detailed reasoning.
 * This keeps "localhost" usable when the UI is opened from another device on the LAN.
 */
function replaceLocalhostWithCurrentHostname(url: string): string {
  const isLocalHost = url.includes("localhost") || url.includes("127.0.0.1");
  if (!isLocalHost) return url;

  if (typeof window === "undefined") return url;
  const currentHost = window.location.hostname;
  if (!currentHost) return url;
  if (currentHost === "localhost" || currentHost === "127.0.0.1") return url;

  const portMatch = url.match(/:(\d+)/);
  const port = portMatch ? portMatch[1] : "8000";
  const newUrl = url.replace(/https?:\/\/[^\/]+/, `http://${currentHost}:${port}`);
  console.warn("⚠️ Replaced localhost with current host for LAN access:", url, "→", newUrl);
  return newUrl;
}

function joinUrl(base: string, path: string) {
  // Simple and robust URL joiner.
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}

function toggleAnomalyPrefix(baseUrl: string) {
  // Some deployments mount the app at `/anomaly`, others at root.
  // We try both to avoid guessing.
  const trimmed = baseUrl.replace(/\/+$/, "");
  const anomalySuffix = "/anomaly";
  if (trimmed.toLowerCase().endsWith(anomalySuffix)) {
    return trimmed.slice(0, -anomalySuffix.length) || "http://192.168.2.71:8000";
  }
  return `${trimmed}${anomalySuffix}`;
}

/**
 * Best-effort extraction for different backend envelope styles.
 * We ONLY accept a final object that matches the existing `GeneratedSurveyResponse` schema.
 * 
 * The FastAPI backend might return structures like:
 * - { survey_plan: { sections: [...] } }
 * - { plan: { sections: [...] } }
 * - { data: { sections: [...] } }
 * - { sections: [...] } (direct)
 * - { rendered_pages: [...] } (planner API format - needs conversion)
 * - { generated_questions: {...} } (planner API format - needs conversion)
 */
function extractPlanCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;

  const r = raw as any;
  
  // Direct match - already has sections at root
  if (r.sections && Array.isArray(r.sections)) {
    return r;
  }
  
  // Handle new format: { timestamp, survey: { id, pages: [...] } }
  // This is the format returned by the approve endpoint
  if (r.survey && r.survey.pages && Array.isArray(r.survey.pages)) {
    // Import the conversion function from plannerBackend
    // We'll need to convert survey.pages to rendered_pages format, then to sections
    const survey = r.survey;
    // Convert survey.pages to sections format
    return {
      sections: survey.pages.map((page: any, idx: number) => {
        const controls = page.controls || [];
        const questions = controls.map((control: any) => {
          // Extract question text from label
          const label = control.label || {};
          let questionText: string;
          if (typeof label === 'string') {
            questionText = label;
          } else {
            const enText = label.en || '';
            const arText = label.ar || '';
            if (enText && arText) {
              // For bilingual, preserve as object
              questionText = { en: enText, ar: arText } as any;
            } else {
              questionText = enText || arText || Object.values(label)[0] as string || '';
            }
          }
          
          // Extract options
          const options: Array<string | { en: string; ar: string }> = [];
          const optionsArray = control.settings?.props?.options || control.props?.options;
          if (optionsArray && Array.isArray(optionsArray) && optionsArray.length > 0) {
            optionsArray.forEach((opt: any) => {
              const optLabel = opt.label || {};
              if (typeof optLabel === 'string') {
                options.push(optLabel);
              } else {
                const enOpt = optLabel.en || '';
                const arOpt = optLabel.ar || '';
                if (enOpt && arOpt) {
                  options.push({ en: enOpt, ar: arOpt });
                } else {
                  options.push(enOpt || arOpt);
                }
              }
            });
          }
          
          // Extract scale
          const scaleData = control.settings?.props?.scale || control.props?.scale;
          const scale = scaleData ? {
            min: scaleData.min,
            max: scaleData.max,
            labels: scaleData.labels ? {
              min: typeof scaleData.labels.min === 'object' && scaleData.labels.min !== null
                ? scaleData.labels.min
                : scaleData.labels.min,
              max: typeof scaleData.labels.max === 'object' && scaleData.labels.max !== null
                ? scaleData.labels.max
                : scaleData.labels.max,
            } : undefined,
          } : undefined;
          
          // Map question types
          let questionType = control.type || 'text';
          if (questionType === 'select') {
            questionType = 'dropdown_list';
          }
          
          // Convert null values to undefined for schema validation
          const finalScale = (scale !== null && scale !== undefined) ? scale : undefined;
          const finalValidation = (control.settings?.validations !== null && control.settings?.validations !== undefined) 
            ? control.settings.validations 
            : undefined;
          const finalSkipLogic = (control.skip_logic !== null && control.skip_logic !== undefined) 
            ? control.skip_logic 
            : undefined;
          
          return {
            text: questionText,
            type: questionType,
            options: options.length > 0 ? options : undefined,
            required: control.settings?.validations?.required || false,
            spec_id: control.id || control.name || '',
            scale: finalScale,
            validation: finalValidation,
            skip_logic: finalSkipLogic,
          };
        });
        
        return {
          title: typeof page.name === 'object' ? (page.name.en || page.name.ar || Object.values(page.name)[0]) : (page.name || page.title || `Page ${idx + 1}`),
          questions: questions,
        };
      }),
      suggestedName: typeof survey.title === 'object' ? (survey.title.en || survey.title.ar || Object.values(survey.title)[0]) : (survey.title || ''),
    };
  }
  
  // Handle rendered_pages format from planner API (convert to sections)
  if (r.rendered_pages && Array.isArray(r.rendered_pages)) {
    return {
      sections: r.rendered_pages.map((page: any) => ({
        title: page.name || `Page ${page.page_number || ''}`,
        questions: (page.questions || []).map((q: any) => ({
          text: q.question_text || q.text || '',
          type: q.question_type || q.type || 'text',
          options: q.options && Array.isArray(q.options) && q.options.length > 0 ? q.options : undefined,
          required: q.required,
          spec_id: q.spec_id,
          scale: (q.scale !== null && q.scale !== undefined) ? q.scale : undefined, // Convert null to undefined
          validation: (q.validation !== null && q.validation !== undefined) ? q.validation : undefined,
          skip_logic: (q.skip_logic !== null && q.skip_logic !== undefined) ? q.skip_logic : undefined, // Convert null to undefined
        })),
      })),
      suggestedName: r.suggestedName || r.name,
    };
  }
  
  // Handle generated_questions format from planner API (convert to sections)
  // Backend returns: { generated_questions: { rendered_pages: [...] } }
  if (r.generated_questions && typeof r.generated_questions === 'object') {
    // Check if generated_questions has rendered_pages array (new format)
    if (r.generated_questions.rendered_pages && Array.isArray(r.generated_questions.rendered_pages)) {
      return {
        sections: r.generated_questions.rendered_pages.map((page: any, idx: number) => ({
          title: page.name || page.title || `Section ${idx + 1}`,
          questions: (Array.isArray(page.questions) ? page.questions : []).map((q: any) => ({
            text: q.question_text || q.text || q.intent || '',
            type: q.question_type || q.type || 'text',
            options: (q.options && Array.isArray(q.options) && q.options.length > 0) ? q.options : undefined,
            required: q.required !== undefined ? q.required : undefined,
            spec_id: q.spec_id,
            scale: (q.scale !== null && q.scale !== undefined) ? q.scale : undefined,
            validation: (q.validation !== null && q.validation !== undefined) ? q.validation : undefined,
            skip_logic: (q.skip_logic !== null && q.skip_logic !== undefined) ? q.skip_logic : undefined,
          })),
        })),
        suggestedName: r.suggestedName || r.name || r.plan?.title,
      };
    }
    // Fallback: try treating generated_questions as a record (old format)
    const pages = Object.values(r.generated_questions) as any[];
    if (Array.isArray(pages) && pages.length > 0 && pages[0]?.questions) {
      return {
        sections: pages.map((page: any, idx: number) => ({
          title: page.name || page.title || `Section ${idx + 1}`,
          questions: (Array.isArray(page.questions) ? page.questions : []).map((q: any) => ({
            text: q.question_text || q.text || q.intent || '',
            type: q.question_type || q.type || 'text',
            options: (q.options && Array.isArray(q.options) && q.options.length > 0) ? q.options : undefined,
            required: q.required !== undefined ? q.required : undefined,
            spec_id: q.spec_id,
            scale: (q.scale !== null && q.scale !== undefined) ? q.scale : undefined,
            validation: (q.validation !== null && q.validation !== undefined) ? q.validation : undefined,
            skip_logic: (q.skip_logic !== null && q.skip_logic !== undefined) ? q.skip_logic : undefined,
          })),
        })),
        suggestedName: r.suggestedName || r.name,
      };
    }
  }
  
  // Try nested structures (common in FastAPI responses)
  if (r.survey_plan?.sections && Array.isArray(r.survey_plan.sections)) {
    return r.survey_plan;
  }
  if (r.surveyPlan?.sections && Array.isArray(r.surveyPlan.sections)) {
    return r.surveyPlan;
  }
  // Handle plan.pages format (planner API format with question_specs or section_brief)
  if (r.plan?.pages && Array.isArray(r.plan.pages)) {
    const userLang = getUserLanguagePreference(r.plan.language || "en");
    return {
      sections: r.plan.pages.map((page: any, idx: number) => {
        // Check for section_brief first (new format)
        if (page.section_brief) {
          // For section_brief format, create placeholder questions based on question_count
          const questionCount = page.section_brief.question_count || 0;
          return {
            title: getText(page.name || page.title, userLang) || `Section ${idx + 1}`,
            questions: Array.from({ length: questionCount }, (_, qIdx: number) => ({
              text: `Question ${qIdx + 1} (to be generated from section brief)`,
              type: 'text', // Default type, will be determined during generation
              // Include section_brief metadata for reference
              section_brief: page.section_brief,
            })),
          };
        } else if (page.question_specs && Array.isArray(page.question_specs) && page.question_specs.length > 0) {
          // Legacy format: use question_specs
          return {
            title: getText(page.name || page.title, userLang) || `Section ${idx + 1}`,
            questions: page.question_specs.map((spec: any) => ({
              text: spec.intent || spec.question_text || spec.text || '',
              type: spec.question_type || spec.type || 'text',
              options: (spec.options_hint && Array.isArray(spec.options_hint) && spec.options_hint.length > 0) ? spec.options_hint : undefined,
              required: spec.required !== undefined ? spec.required : undefined,
              spec_id: spec.spec_id,
              validation: (spec.validation !== null && spec.validation !== undefined) ? spec.validation : undefined,
              skip_logic: (spec.skip_logic !== null && spec.skip_logic !== undefined) ? spec.skip_logic : undefined,
              scale: (spec.scale !== null && spec.scale !== undefined) ? spec.scale : undefined,
            })),
          };
        } else {
          // No section_brief or question_specs - create empty section
          return {
            title: getText(page.name || page.title, userLang) || `Section ${idx + 1}`,
            questions: [],
          };
        }
      }),
      suggestedName: getText(r.plan.title, userLang) || r.suggestedName || r.name,
    };
  }
  if (r.plan?.sections && Array.isArray(r.plan.sections)) {
    return r.plan;
  }
  if (r.data?.sections && Array.isArray(r.data.sections)) {
    return r.data;
  }
  if (r.result?.sections && Array.isArray(r.result.sections)) {
    return r.result;
  }
  
  // Try nested rendered_pages
  if (r.data?.rendered_pages && Array.isArray(r.data.rendered_pages)) {
    return extractPlanCandidate({ rendered_pages: r.data.rendered_pages, suggestedName: r.data.suggestedName || r.data.name });
  }
  
  // Try nested generated_questions in data wrapper
  if (r.data?.generated_questions && typeof r.data.generated_questions === 'object') {
    if (r.data.generated_questions.rendered_pages && Array.isArray(r.data.generated_questions.rendered_pages)) {
      return extractPlanCandidate({ 
        generated_questions: r.data.generated_questions,
        suggestedName: r.data.suggestedName || r.data.name || r.plan?.title
      });
    }
  }
  
  // If we have questions but no sections, try to construct sections
  // (some backends might return questions directly)
  if (r.questions && Array.isArray(r.questions) && !r.sections) {
    return {
      sections: [{
        title: r.title || "Survey Questions",
        questions: r.questions
      }],
      suggestedName: r.suggestedName || r.name
    };
  }
  
  // Last resort: return as-is (will fail validation but we'll see the structure)
  return raw;
}

export async function postSurveyPlanFast(
  data: GenerateSurveyRequest,
): Promise<GenerateSurveyResponse> {
  const rawBaseUrl =
    (import.meta as any).env?.VITE_ANOMALY_API_BASE_URL ?? DEFAULT_ANOMALY_API_BASE_URL;
  const baseUrl = replaceLocalhostWithCurrentHostname(rawBaseUrl);

  /**
   * NOTE ABOUT 404s
   * FastAPI's default 404 body looks like: `{ "detail": "Not Found" }`.
   * A 404 almost always means the URL path is wrong (wrong prefix), not that the server is down.
   *
   * To reduce setup friction, we try a few likely URL variants:
   * - with/without `/anomaly` base prefix
   * - with/without trailing slash
   */
  const altBaseUrl = toggleAnomalyPrefix(baseUrl);
  const candidateUrls = Array.from(
    new Set([
      joinUrl(baseUrl, SURVEY_PLAN_FAST_PATH),
      joinUrl(baseUrl, `${SURVEY_PLAN_FAST_PATH}/`),
      joinUrl(altBaseUrl, SURVEY_PLAN_FAST_PATH),
      joinUrl(altBaseUrl, `${SURVEY_PLAN_FAST_PATH}/`),
    ]),
  );

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await res.text(); // backend might return non-JSON on error
    return { res, text };
  };

  let lastStatus = 0;
  let lastText = "";
  let finalJson: unknown = null;

  for (const url of candidateUrls) {
    const { res, text } = await doPost(url);
    lastStatus = res.status;
    lastText = text;

    if (!res.ok) {
      // Only retry on 404 (wrong URL). For other errors, fail fast.
      if (res.status === 404) continue;
      
      // Check if this is a prompt validation error (422)
      // This will throw a PromptValidationError with user-friendly message and suggested_prompt
      handlePromptValidationError(res.status, text);
      
      // Handle other types of errors normally
      throw new Error(`Anomaly backend error (${res.status}). ${text || res.statusText}`);
    }

    try {
      finalJson = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Anomaly backend returned a non-JSON response.");
    }

    // Success: stop trying other URLs.
    break;
  }

  // If we exhausted candidates without success, show what we tried.
  if (lastStatus === 404) {
    throw new Error(
      `Anomaly backend error (404). The endpoint was not found. Tried: ${candidateUrls.join(
        ", ",
      )}`,
    );
  }

  // Extract thread_id from the response (for fast mode)
  // The Anomaly backend returns: { timestamp, survey: { id: "thread_...", meta: { thread_id: "..." }, pages: [...] } }
  let threadId: string | undefined = undefined;
  if (finalJson && typeof finalJson === 'object') {
    const response = finalJson as any;
    // Try survey.id first (most common)
    if (response.survey?.id) {
      threadId = response.survey.id;
    }
    // Try survey.meta.thread_id as fallback
    else if (response.survey?.meta?.thread_id) {
      threadId = response.survey.meta.thread_id;
    }
    // Try thread_id at root level
    else if (response.thread_id) {
      threadId = response.thread_id;
    }
  }

  // Validate and normalize to the exact shape the UI already expects.
  const candidate = extractPlanCandidate(finalJson);
  
  // Debug logging to understand the response structure
  console.log("🔍 Backend response structure:", JSON.stringify(finalJson, null, 2));
  console.log("🔍 Extracted candidate:", JSON.stringify(candidate, null, 2));
  if (threadId) {
    console.log("🔍 Extracted thread_id from Anomaly backend:", threadId);
  }
  
  try {
    const parsed = api.ai.generate.responses[200].parse(candidate);
    console.log("✅ Successfully parsed response:", parsed);
    
    // Store thread_id in the parsed response as a custom property (not part of schema but accessible)
    // We'll access it via (parsed as any).thread_id in ConfigPage
    if (threadId) {
      (parsed as any).thread_id = threadId;
    }
    
    return parsed;
  } catch (parseError) {
    // If parsing fails, show a helpful hint for debugging.
    console.error("❌ Parsing error:", parseError);
    console.error("❌ Candidate that failed:", candidate);
    throw new Error(
      `Anomaly backend response does not match the expected survey plan format (missing or invalid \`sections\`). Received: ${JSON.stringify(candidate).substring(0, 200)}...`,
    );
  }
}


