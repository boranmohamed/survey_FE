/**
 * Bilingual text extraction utilities.
 * 
 * The API returns bilingual JSON structures when language is "ar" or "both".
 * Text fields can be either:
 * - String (when language === "en") - backward compatible
 * - Bilingual object {"en": "...", "ar": "..."} (when language === "ar" or "both")
 * 
 * These helpers extract the appropriate text based on user language preference.
 */

export type BilingualText = string | { en: string; ar: string };
export type UserLanguage = "en" | "ar";

/**
 * Extract text from bilingual field based on user's language preference.
 * 
 * @param field - Can be string or bilingual object
 * @param userLang - User's preferred language ("en" or "ar")
 * @returns The text in the requested language, or fallback to English
 */
export function getText(field: BilingualText | null | undefined, userLang: UserLanguage = "en"): string {
  if (!field) return "";
  
  // If it's already a string, return as-is (backward compatible)
  if (typeof field === "string") {
    return field;
  }
  
  // If it's a bilingual object, return the requested language
  if (typeof field === "object" && "en" in field && "ar" in field) {
    return userLang === "ar" ? field.ar : field.en;
  }
  
  // Fallback
  return "";
}

/**
 * Extract text from an array of bilingual fields.
 * 
 * @param fields - Array of bilingual text fields
 * @param userLang - User's preferred language ("en" or "ar")
 * @returns Array of strings in the requested language
 */
export function getTextArray(fields: BilingualText[] | null | undefined, userLang: UserLanguage = "en"): string[] {
  if (!fields || !Array.isArray(fields)) return [];
  return fields.map(field => getText(field, userLang));
}

/**
 * Determine user language preference from plan language.
 * For "both" language plans, defaults to "en" but can be overridden.
 * 
 * @param planLanguage - The language from the plan ("en" | "ar" | "both")
 * @param overrideLang - Optional override for user preference
 * @returns User language preference ("en" or "ar")
 */
export function getUserLanguagePreference(planLanguage: string, overrideLang?: UserLanguage): UserLanguage {
  if (overrideLang) return overrideLang;
  
  // If plan is Arabic-only, prefer Arabic
  if (planLanguage === "ar") return "ar";
  
  // Default to English for "en" and "both"
  return "en";
}

/**
 * Check if a plan should use bilingual text extraction.
 * 
 * @param planLanguage - The language from the plan
 * @returns True if plan uses bilingual format
 */
export function shouldUseBilingual(planLanguage: string): boolean {
  return planLanguage === "ar" || planLanguage === "both";
}

