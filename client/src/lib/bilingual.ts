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
  return planLanguage === "ar" || planLanguage === "both" || planLanguage === "Bilingual";
}

/**
 * Check if content appears to be bilingual (contains both English and Arabic).
 * This helps detect bilingual content even when survey language is set to "English".
 */
export function isBilingualContent(text: string | { en: string; ar: string } | null | undefined): boolean {
  if (!text) return false;
  
  // If it's already a bilingual object, it's bilingual
  if (typeof text === 'object' && text !== null && 'en' in text && 'ar' in text) {
    return !!(text.en && text.ar);
  }
  
  // If it's a string, check if it contains both English and Arabic characters
  if (typeof text === 'string') {
    const arabicPattern = /[\u0600-\u06FF]/;
    const englishPattern = /[a-zA-Z]/;
    
    // Check if string contains both Arabic and English characters
    const hasArabic = arabicPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasArabic && hasEnglish) {
      // Also check for the combined format "English / Arabic" as a stronger indicator
      const combinedPattern = /^(.+?)\s*\/\s*(.+)$/;
      const match = text.match(combinedPattern);
      if (match && match[1] && match[2]) {
        const enText = match[1].trim();
        const arText = match[2].trim();
        // If it matches the pattern and has Arabic in the second part, it's definitely bilingual
        if (enText && arText && enText !== arText && arabicPattern.test(arText)) {
          return true;
        }
      }
      // Even without the "/" separator, if it has both Arabic and English, it's likely bilingual
      // But be more conservative - check if there's a reasonable amount of both
      const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
      const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
      // If there's a significant amount of both, consider it bilingual
      if (arabicCount > 5 && englishCount > 5) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Extract both English and Arabic text from a bilingual field.
 * 
 * @param field - Can be string or bilingual object
 * @returns Object with en and ar properties, or both set to the string value if it's a plain string
 */
export function getBothLanguages(field: BilingualText | null | undefined): { en: string; ar: string } {
  if (!field) return { en: "", ar: "" };
  
  // If it's already a string, check if it's in combined format "English / Arabic"
  if (typeof field === "string") {
    // Check if string contains " / " pattern (English / Arabic format)
    // Pattern matches: "English / Arabic" or "English/Arabic" or "English /Arabic" etc.
    // Use a more flexible pattern that handles various spacing
    const combinedPattern = /^(.+?)\s*\/\s*(.+)$/;
    const match = field.match(combinedPattern);
    if (match && match[1] && match[2]) {
      // Split combined format: "English / Arabic" -> {en: "English", ar: "Arabic"}
      const enText = match[1].trim();
      const arText = match[2].trim();
      // Only split if both parts are non-empty and different
      if (enText && arText && enText !== arText) {
        console.log("✅ Split combined string:", { original: field.substring(0, 50), en: enText.substring(0, 30), ar: arText.substring(0, 30) });
        return { en: enText, ar: arText };
      }
    }
    // If not combined format, return it for both languages (backward compatible)
    return { en: field, ar: field };
  }
  
  // If it's a bilingual object, return both languages
  if (typeof field === "object" && "en" in field && "ar" in field) {
    return { en: field.en || "", ar: field.ar || "" };
  }
  
  // Fallback
  return { en: "", ar: "" };
}

/**
 * Extract both languages from an array of bilingual fields.
 * 
 * @param fields - Array of bilingual text fields (can be strings, objects, or mixed)
 * @returns Array of objects with en and ar properties
 */
export function getBothLanguagesArray(fields: Array<BilingualText | { en: string; ar: string } | string> | null | undefined): Array<{ en: string; ar: string }> {
  if (!fields || !Array.isArray(fields)) return [];
  return fields.map(field => {
    // If it's already a bilingual object with en/ar, use it directly
    if (typeof field === 'object' && field !== null && 'en' in field && 'ar' in field) {
      return { en: field.en || '', ar: field.ar || '' };
    }
    // If it's a string, check if it's in combined format "English / Arabic"
    if (typeof field === 'string') {
      const combinedPattern = /^(.+?)\s*\/\s*(.+)$/;
      const match = field.match(combinedPattern);
      if (match && match[1] && match[2]) {
        const enText = match[1].trim();
        const arText = match[2].trim();
        // Only split if both parts are non-empty and different
        if (enText && arText && enText !== arText) {
          // Split combined format: "English / Arabic" -> {en: "English", ar: "Arabic"}
          return { en: enText, ar: arText };
        }
      }
      // If not combined, return same string for both languages
      return { en: field, ar: field };
    }
    // Otherwise, use getBothLanguages which handles other formats
    return getBothLanguages(field as BilingualText);
  });
}

