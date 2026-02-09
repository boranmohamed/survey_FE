/**
 * Prompt validation error handling utilities.
 * 
 * The backend validates user prompts before survey generation and returns
 * HTTP 422 with structured error details when validation fails.
 * 
 * This module provides utilities to detect and handle these validation errors.
 */

/**
 * Structure of a prompt validation error response from the backend.
 * 
 * When prompt validation fails (HTTP 422), the response has this structure:
 * {
 *   "detail": {
 *     "reason_code": "too_short" | "gibberish" | "keyboard_walk" | "repetitive" | "unsupported" | "needs_clarification",
 *     "message": "User-friendly error message explaining the issue",
 *     "suggested_prompt": "optional suggested improvement" | null
 *   }
 * }
 */
export interface PromptValidationErrorDetail {
  reason_code: "too_short" | "gibberish" | "keyboard_walk" | "repetitive" | "unsupported" | "needs_clarification";
  message: string;
  suggested_prompt: string | null;
}

/**
 * Custom error class for prompt validation errors.
 * 
 * This error includes all the validation details from the backend,
 * making it easy for UI components to display user-friendly messages
 * and optionally pre-fill suggested prompts.
 */
export class PromptValidationError extends Error {
  readonly reasonCode: PromptValidationErrorDetail["reason_code"];
  readonly suggestedPrompt: string | null;
  readonly statusCode: number = 422;

  constructor(detail: PromptValidationErrorDetail) {
    // Use the user-friendly message from the backend
    super(detail.message);
    
    // Set error name for easier identification
    this.name = "PromptValidationError";
    
    // Store validation details
    this.reasonCode = detail.reason_code;
    this.suggestedPrompt = detail.suggested_prompt;
  }
}

/**
 * Checks if an error response is a prompt validation error (HTTP 422).
 * 
 * @param status - HTTP status code from the response
 * @param errorData - Parsed error response data
 * @returns True if this is a prompt validation error, false otherwise
 */
export function isPromptValidationError(
  status: number,
  errorData: unknown
): errorData is { detail: PromptValidationErrorDetail } {
  // Must be HTTP 422 (Unprocessable Entity)
  if (status !== 422) {
    return false;
  }

  // Check if errorData has the expected structure
  if (!errorData || typeof errorData !== "object") {
    return false;
  }

  const data = errorData as any;
  
  // Check if detail exists and has reason_code (the key indicator)
  if (!data.detail || typeof data.detail !== "object") {
    return false;
  }

  const detail = data.detail;
  
  // Validate reason_code is one of the expected values
  const validReasonCodes = ["too_short", "gibberish", "keyboard_walk", "repetitive", "unsupported", "needs_clarification"];
  if (!detail.reason_code || !validReasonCodes.includes(detail.reason_code)) {
    return false;
  }

  // Validate message exists and is a string
  if (!detail.message || typeof detail.message !== "string") {
    return false;
  }

  // suggested_prompt is optional, but if present must be string or null
  if (detail.suggested_prompt !== null && detail.suggested_prompt !== undefined && typeof detail.suggested_prompt !== "string") {
    return false;
  }

  return true;
}

/**
 * Handles a prompt validation error response.
 * 
 * This function checks if the response is a prompt validation error (422),
 * and if so, throws a PromptValidationError with all the validation details.
 * 
 * If it's not a validation error, this function does nothing (returns false).
 * 
 * @param status - HTTP status code from the response
 * @param errorText - Raw error response text (will be parsed as JSON)
 * @returns True if this was a prompt validation error and an error was thrown, false otherwise
 * @throws PromptValidationError if this is a prompt validation error
 */
export function handlePromptValidationError(
  status: number,
  errorText: string
): boolean {
  // Only handle 422 status codes
  if (status !== 422) {
    return false;
  }

  // Try to parse the error response
  let errorData: unknown;
  try {
    errorData = errorText ? JSON.parse(errorText) : null;
  } catch {
    // If parsing fails, it's not a structured validation error
    return false;
  }

  // Check if this is a prompt validation error
  if (!isPromptValidationError(status, errorData)) {
    return false;
  }

  // Extract validation details
  const detail = (errorData as { detail: PromptValidationErrorDetail }).detail;

  // Throw a custom error with all validation details
  throw new PromptValidationError(detail);
}

