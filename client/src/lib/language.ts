/**
 * Language mapping helpers.
 *
 * Why this exists:
 * - The UI uses human-readable labels: "English", "Arabic", "Bilingual".
 * - The planner backend contract expects strict codes: "en", "ar", or "both".
 * - Some backends may also accept variants like "english and arabic" (case-insensitive),
 *   but the safest, cleanest contract is to send "both".
 *
 * Keep this centralized so we don't duplicate mapping logic across the app.
 */

export type PlannerLanguageCode = "en" | "ar" | "both";

/**
 * Convert UI language label (or already-normalized code) into the planner contract.
 *
 * - "English"  -> "en"
 * - "Arabic"   -> "ar"
 * - "Bilingual"-> "both"
 *
 * Also supports:
 * - Already-normalized values: "en" | "ar" | "both"
 * - Legacy/accepted strings: "arabic and english" / "english and arabic" -> "both"
 *
 * If an unknown value is passed, we default to "en" to avoid hard crashes.
 * (The backend will still validate on its side if it is strict.)
 */
export function toPlannerLanguageCode(input: string): PlannerLanguageCode {
  const normalized = (input ?? "").trim().toLowerCase();

  // Idempotent: if we're already receiving the desired contract, keep it.
  if (normalized === "en" || normalized === "ar" || normalized === "both") {
    return normalized;
  }

  // UI labels.
  if (normalized === "english") return "en";
  if (normalized === "arabic") return "ar";
  if (normalized === "bilingual") return "both";

  // Also accepted by some controllers (but we normalize to "both").
  if (normalized === "arabic and english" || normalized === "english and arabic") {
    return "both";
  }

  // Fallback: be conservative.
  return "en";
}


