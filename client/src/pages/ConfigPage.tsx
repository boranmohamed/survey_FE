import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Smartphone, Link as LinkIcon, Sparkles, Wand2, Lightbulb, ArrowRight, Save, Layout, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toPlannerLanguageCode } from "@/lib/language";

import {
  useCreateSurvey,
  useUpdateSurvey,
  useGenerateSurvey,
  useGenerateSurveyFast,
  useRephrasePrompt,
  useCreateSurveyPlan,
  useApproveSurveyPlan,
  useRejectSurveyPlan,
  PromptValidationError,
} from "@/hooks/use-surveys";
import { SurveyPlanResponse } from "@shared/routes";
import { getSurveyPlan, generateValidateFixQuestions } from "@/lib/plannerBackend";
import { Stepper } from "@/components/Stepper";
import { HistorySidebar } from "@/components/HistorySidebar";
import { CollectionModeCard } from "@/components/CollectionModeCard";
import { CounterInput } from "@/components/CounterInput";
import { BlueprintReview } from "@/components/BlueprintReview";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Form schemas
const metadataSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  type: z.string().min(1, "Type is required"),
  language: z.enum(["English", "Arabic", "Bilingual"]),
  collectionMode: z.enum(["field", "web"]),
  nameEnglish: z.string().optional(),
  nameArabic: z.string().optional(),
}).refine((data) => {
  // If bilingual, both names are required
  // Note: 'name' field contains English name when bilingual, 'nameArabic' contains Arabic name
  if (data.language === "Bilingual") {
    return data.name && data.name.length >= 3 && data.nameArabic && data.nameArabic.length >= 3;
  }
  return true;
}, {
  message: "Both English and Arabic names are required for bilingual surveys",
  path: ["name"],
});

type Step = "metadata" | "ai-config" | "blueprint";

/**
 * Combines English and Arabic titles for bilingual surveys.
 * Format: "English/Arabic" (no spaces around slash).
 * Handles empty strings gracefully - returns only the non-empty title if one is missing.
 * 
 * @param english - English title (from 'name' field when bilingual)
 * @param arabic - Arabic title (from 'nameArabic' field when bilingual)
 * @returns Combined title in format "English/Arabic", or single title if one is empty
 */
function combineBilingualTitle(english: string, arabic: string): string {
  const englishTrimmed = english?.trim() || "";
  const arabicTrimmed = arabic?.trim() || "";
  
  // If both are provided, combine with slash
  if (englishTrimmed && arabicTrimmed) {
    return `${englishTrimmed}/${arabicTrimmed}`;
  }
  
  // If only one is provided, return that one
  if (englishTrimmed) {
    return englishTrimmed;
  }
  
  if (arabicTrimmed) {
    return arabicTrimmed;
  }
  
  // If both are empty, return empty string (validation should catch this)
  return "";
}

export default function ConfigPage() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<Step>("metadata");
  const [surveyId, setSurveyId] = useState<number | null>(null);
  const [showRephraseDialog, setShowRephraseDialog] = useState(false);
  
  // AI Config State
  const [aiPrompt, setAiPrompt] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [numPages, setNumPages] = useState(1);
  const [reviewPlan, setReviewPlan] = useState(true);
  const [blueprint, setBlueprint] = useState<any>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  /**
   * Toggle behavior:
   * - ON  => use the planner API (POST to create plan, then GET to retrieve it)
   * - OFF => call the external backend endpoint (Anomaly) that you provided
   *
   * Important: We keep the textarea always editable.
   * The toggle only controls which backend we call on "Generate".
   */
  const [isPromptEnabled, setIsPromptEnabled] = useState(true);

  // Hooks
  const createSurvey = useCreateSurvey();
  const updateSurvey = useUpdateSurvey();
  const generateSurvey = useGenerateSurvey();
  const generateSurveyFast = useGenerateSurveyFast();
  const rephrasePrompt = useRephrasePrompt();
  const createSurveyPlan = useCreateSurveyPlan();
  const approveSurveyPlan = useApproveSurveyPlan();
  const rejectSurveyPlan = useRejectSurveyPlan();

  const form = useForm<z.infer<typeof metadataSchema>>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      name: "",
      type: "",
      language: "English",
      collectionMode: "web",
      nameArabic: "",
    },
  });

  // Watch language field to conditionally show bilingual inputs
  const selectedLanguage = form.watch("language");

  const handleMetadataSubmit = async (values: z.infer<typeof metadataSchema>) => {
    try {
      // Prepare payload for backend
      // If bilingual, combine English and Arabic names into single 'name' field
      // Database schema only has a single 'name' field, so we combine them here
      const payload: any = { ...values };
      
      if (values.language === "Bilingual") {
        // Combine English (from 'name' field) and Arabic (from 'nameArabic' field) titles
        payload.name = combineBilingualTitle(values.name, values.nameArabic || "");
        // Remove nameArabic from payload as database doesn't have this field
        delete payload.nameArabic;
        delete payload.nameEnglish; // Also remove nameEnglish if present
      } else {
        // For non-bilingual surveys, ensure nameArabic is not sent
        delete payload.nameArabic;
        delete payload.nameEnglish;
      }
      
      if (surveyId) {
        await updateSurvey.mutateAsync({ id: surveyId, ...payload });
      } else {
        const newSurvey = await createSurvey.mutateAsync(payload);
        setSurveyId(newSurvey.id);
      }
    } catch (error) {
      // If database is not configured, use a temporary ID for frontend-only flow
      if (!surveyId) {
        setSurveyId(Date.now()); // Temporary ID for frontend-only mode
      }
      console.warn("Survey creation/update failed, continuing in frontend-only mode:", error);
    }
    // Always move to next step, even if API call failed
    setCurrentStep("ai-config");
  };

  const handleGenerate = async () => {
    // Ensure we have a surveyId before generating
    // If surveyId is null, create a survey first with current form values
    let currentSurveyId = surveyId;
    
    if (!currentSurveyId) {
      try {
        const formValues = form.getValues();
        // Combine titles if bilingual before creating survey
        let surveyName = formValues.name || "Untitled Survey";
        if (formValues.language === "Bilingual") {
          surveyName = combineBilingualTitle(formValues.name, formValues.nameArabic || "");
        }
        const newSurvey = await createSurvey.mutateAsync({
          name: surveyName,
          language: formValues.language,
          collectionMode: formValues.collectionMode
        });
        currentSurveyId = newSurvey.id;
        setSurveyId(currentSurveyId);
      } catch (error) {
        // If database is not configured, use a temporary ID for frontend-only flow
        currentSurveyId = Date.now();
        setSurveyId(currentSurveyId);
        console.warn("Survey creation failed, continuing in frontend-only mode:", error);
      }
    }

    try {
      const formValues = form.getValues();
      
      if (isPromptEnabled) {
        // Toggle ON: Use planner API (POST then GET)
        // Important: planner backend expects strict language codes: "en" | "ar" | "both".
        // The UI stores labels like "English" | "Arabic" | "Bilingual".
        // We normalize here to keep the backend contract clean and predictable.
        const plannerLanguage = toPlannerLanguageCode(formValues.language);
        // Combine titles if bilingual before sending to planner backend
        let surveyTitle = formValues.name;
        if (formValues.language === "Bilingual") {
          surveyTitle = combineBilingualTitle(formValues.name, formValues.nameArabic || "");
        }
        const createRequest = {
          prompt: aiPrompt,
          title: surveyTitle,
          type: formValues.type,
          language: plannerLanguage,
          numQuestions,
          numPages,
        };

        // Step 1: Create the plan and get thread_id
        console.log("🔵 Creating survey plan with planner API...");
        let createResponse;
        try {
          createResponse = await createSurveyPlan.mutateAsync(createRequest);
        } catch (error) {
          // Check if this is a prompt validation error with a suggested prompt
          if (error instanceof PromptValidationError && error.suggestedPrompt) {
            // Update the prompt input with the suggested prompt
            setAiPrompt(error.suggestedPrompt);
            // The error toast is already shown by the hook's onError handler
            console.log("📝 Updated prompt with suggestion:", error.suggestedPrompt);
          }
          // Re-throw the error so it's handled by the hook's onError
          throw error;
        }
        const newThreadId = createResponse.thread_id;
        // Defensive check: backend contract should always return a thread_id,
        // but the shared type marks it as optional for backward compatibility.
        // Failing early here avoids passing an undefined thread_id downstream.
        if (!newThreadId) {
          throw new Error("Planner API did not return a thread_id. Please try again.");
        }
        console.log("✅ Plan created, thread_id:", newThreadId);

        // Step 2: Retrieve the full plan
        setThreadId(newThreadId);
        // Call the backend function directly
        const planResponse = await getSurveyPlan(newThreadId);
        console.log("📋 Received plan from planner API:", planResponse);
        console.log("📋 Plan pages:", planResponse?.plan?.pages);
        console.log("📋 Approval status:", planResponse?.approval_status);

        // Validate that plan has the expected structure
        if (!planResponse || !planResponse.plan || !planResponse.plan.pages || !Array.isArray(planResponse.plan.pages) || planResponse.plan.pages.length === 0) {
          console.error("❌ Invalid plan structure received:", planResponse);
          throw new Error("The generated plan does not have the expected structure. Please try again.");
        }

        if (reviewPlan) {
          // Store the full planner response
          console.log("✅ Setting blueprint and moving to review step");
          console.log("📋 Blueprint data:", planResponse);
          setBlueprint(planResponse);
          setCurrentStep("blueprint");
          console.log("✅ Step changed to blueprint");
        } else {
          // Direct save and proceed
          // Transform planner response to sections format for backward compatibility
          // Handle both section_brief (new format) and question_specs (legacy format)
          const transformedPlan = {
            sections: planResponse.plan.pages.map((page, idx) => {
              // If page has section_brief, create placeholder questions based on the brief
              // Otherwise, use question_specs (legacy format)
              if (page.section_brief) {
                // For section_brief format, create a placeholder structure
                // The actual questions will be generated later during approval
                const questionCount = page.section_brief.question_count || 0;
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: Array.from({ length: questionCount }, (_, qIdx) => ({
                    text: `Question ${qIdx + 1} (to be generated)`,
                    type: 'text', // Default type, will be determined during generation
                    // Include section_brief metadata for later use
                    section_brief: page.section_brief,
                  })),
                };
              } else if (page.question_specs && page.question_specs.length > 0) {
                // Legacy format: use question_specs
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: page.question_specs.map((spec) => ({
                    text: spec.intent,
                    type: spec.question_type,
                    options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
                  })),
                };
              } else {
                // No section_brief or question_specs - create empty section
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: [],
                };
              }
            }),
            suggestedName: planResponse.plan.title,
          };

          try {
            await updateSurvey.mutateAsync({ 
              id: currentSurveyId, 
              structure: transformedPlan 
            });
          } catch (updateError) {
            console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
          }
          // Store structure in localStorage as fallback for mock mode
          if (currentSurveyId) {
            try {
              localStorage.setItem(`survey_${currentSurveyId}_structure`, JSON.stringify(transformedPlan));
              // Store thread_id for later use in BuilderPage
              if (newThreadId) {
                localStorage.setItem(`survey_${currentSurveyId}_thread_id`, newThreadId);
              }
            } catch (e) {
              console.warn("Failed to save to localStorage:", e);
            }
          }
          setLocation(`/builder/${currentSurveyId}`);
        }
      } else {
        // Toggle OFF: Use existing external backend (Anomaly)
        // Combine titles if bilingual before sending to external backend
        let surveyTitle = formValues.name;
        if (formValues.language === "Bilingual") {
          surveyTitle = combineBilingualTitle(formValues.name, formValues.nameArabic || "");
        }
        const request = {
          prompt: aiPrompt,
          numQuestions,
          numPages,
          language: formValues.language,
          // Include title and type for external backend (required fields)
          title: surveyTitle,
          type: formValues.type,
        } as const;

        let plan;
        try {
          plan = await generateSurveyFast.mutateAsync(request);
        } catch (error) {
          // Check if this is a prompt validation error with a suggested prompt
          if (error instanceof PromptValidationError && error.suggestedPrompt) {
            // Update the prompt input with the suggested prompt
            setAiPrompt(error.suggestedPrompt);
            // The error toast is already shown by the hook's onError handler
            console.log("📝 Updated prompt with suggestion:", error.suggestedPrompt);
          }
          // Re-throw the error so it's handled by the hook's onError
          throw error;
        }

        console.log("📋 Received plan from backend:", plan);
        console.log("📋 Plan sections:", plan?.sections);
        console.log("📋 Plan sections length:", plan?.sections?.length);

        // Validate that plan has the expected structure
        if (!plan || !plan.sections || !Array.isArray(plan.sections) || plan.sections.length === 0) {
          console.error("❌ Invalid plan structure received:", plan);
          throw new Error("The generated plan does not have the expected structure. Please try again.");
        }

        // Fast mode (toggle OFF): Always skip blueprint review and go directly to builder
        // Blueprint review is only available when toggle is ON (planner API mode)
        // Direct save and proceed to builder
        try {
          await updateSurvey.mutateAsync({ 
            id: currentSurveyId, 
            structure: plan 
          });
        } catch (updateError) {
          // If update fails, continue anyway in frontend-only mode
          console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
        }
        // Store structure in localStorage as fallback for mock mode
        if (currentSurveyId) {
          try {
            localStorage.setItem(`survey_${currentSurveyId}_structure`, JSON.stringify(plan));
          } catch (e) {
            console.warn("Failed to save to localStorage:", e);
          }
        }
        setLocation(`/builder/${currentSurveyId}`);
      }
    } catch (err) {
      // Error handled by hook toast
      console.error("❌ Error in handleGenerate:", err);
    }
  };

  /**
   * Handle the rephrase button click - opens dialog and triggers API call
   */
  const handleRephraseClick = async () => {
    if (!aiPrompt.trim()) {
      // Show error if prompt is empty
      return;
    }
    // Open dialog first
    setShowRephraseDialog(true);
    // Trigger the API call
    try {
      await rephrasePrompt.mutateAsync({
        prompt: aiPrompt,
        language: form.getValues("language")
      });
    } catch (error) {
      // Error is handled by the hook's onError handler
      console.error("Rephrase failed:", error);
    }
  };

  /**
   * Apply the rewritten prompt to the textarea
   */
  const handleApplyRephrase = () => {
    if (rephrasePrompt.data?.rewritten_prompt || rephrasePrompt.data?.rephrased) {
      // Use rewritten_prompt if available, otherwise fall back to rephrased for compatibility
      setAiPrompt(rephrasePrompt.data.rewritten_prompt || rephrasePrompt.data.rephrased);
      setShowRephraseDialog(false);
    }
  };

  /**
   * Type guard to check if plan is from planner API
   */
  const isPlannerResponse = (plan: any): plan is SurveyPlanResponse => {
    return plan && 'plan' in plan && 'approval_status' in plan && 'thread_id' in plan;
  };

  const handleBlueprintApprove = async () => {
    if (!surveyId || !blueprint) return;

    // Check if blueprint is from planner API (has thread_id)
    if (isPlannerResponse(blueprint) && threadId) {
      try {
        // Call approve API endpoint
        console.log("🔵 Approving survey plan with planner API...", threadId);
        const approvedPlan = await approveSurveyPlan.mutateAsync(threadId);
        console.log("✅ Plan approved, received response:", approvedPlan);

        // Update blueprint state with approved plan (includes generated_questions)
        setBlueprint(approvedPlan);

        // The new API response structure already contains all the questions in generated_questions.rendered_pages
        // So we can use that directly without waiting for generate-validate-fix
        // Optionally call generate-validate-fix in the background (non-blocking)
        generateValidateFixQuestions(threadId, true).then((generateResult) => {
          console.log("✅ Generate-validate-fix completed (background):", generateResult);
          // Log validation results if available
          if (generateResult.validation) {
            console.log(`📊 Validation: ${generateResult.validation.passed ? 'PASSED' : 'FAILED'}, Issues: ${generateResult.validation.issue_count}`);
          }
        }).catch((generateError) => {
          // Log error but don't break the approval flow
          console.warn("⚠️ Generate-validate-fix failed (background):", generateError);
        });

        // Transform to sections format for backward compatibility
        // Priority order:
        // 1. rendered_pages from generate-validate-fix (validated and fixed questions with full metadata)
        // 2. generated_questions from approved plan (actual questions generated during approval)
        // 3. Original plan structure (only has intent and options_hint)
        
        // Helper to convert generated_questions to sections format
        // Backend returns: { generated_questions: { rendered_pages: [...] } }
        const convertGeneratedQuestionsToSections = (generatedQuestions: any): { sections: any[], suggestedName: string } | null => {
          if (!generatedQuestions || typeof generatedQuestions !== 'object') return null;
          
          try {
            // Check if generated_questions has rendered_pages array (new format)
            if (generatedQuestions.rendered_pages && Array.isArray(generatedQuestions.rendered_pages)) {
              const sections = generatedQuestions.rendered_pages.map((page: any, idx: number) => {
                const pageName = page.name || page.title || `Section ${idx + 1}`;
                const questions = Array.isArray(page.questions) ? page.questions : [];
                
                return {
                  title: pageName,
                  questions: questions.map((q: any) => ({
                    text: q.question_text || q.text || q.intent || '',
                    type: q.question_type || q.type || 'text',
                    // Always include options if they exist (even if empty array)
                    // For question types that need options (radio, checkbox_list, dropdown_list), 
                    // the array should be populated from the API response
                    options: (q.options && Array.isArray(q.options)) ? q.options : undefined,
                    required: q.required !== undefined ? q.required : undefined,
                    spec_id: q.spec_id || undefined,
                    scale: q.scale || undefined,
                    validation: q.validation || undefined,
                    skip_logic: q.skip_logic || undefined,
                  })),
                };
              });
              
              return { sections, suggestedName: approvedPlan.plan?.title || '' };
            }
            
            // Fallback: try treating generated_questions as a record (old format)
            // where keys are page IDs and values are page objects with questions
            const pages = Object.values(generatedQuestions) as any[];
            if (Array.isArray(pages) && pages.length > 0 && pages[0]?.questions) {
              const sections = pages.map((page: any, idx: number) => {
                const pageName = page.name || page.title || `Section ${idx + 1}`;
                const questions = Array.isArray(page.questions) ? page.questions : [];
                
                return {
                  title: pageName,
                  questions: questions.map((q: any) => ({
                    text: q.question_text || q.text || q.intent || '',
                    type: q.question_type || q.type || 'text',
                    // Always include options if they exist (even if empty array)
                    options: (q.options && Array.isArray(q.options)) ? q.options : undefined,
                    required: q.required !== undefined ? q.required : undefined,
                    spec_id: q.spec_id || undefined,
                    scale: q.scale || undefined,
                    validation: q.validation || undefined,
                    skip_logic: q.skip_logic || undefined,
                  })),
                };
              });
              
              return { sections, suggestedName: approvedPlan.plan?.title || '' };
            }
            
            return null;
          } catch (error) {
            console.warn("Failed to convert generated_questions to sections:", error);
            return null;
          }
        };
        
        let transformedPlan;
        // Priority: Use generated_questions from approved plan first (new API structure already has all questions)
        if (approvedPlan.generated_questions) {
          // Use generated_questions from approved plan (actual questions generated during approval)
          const converted = convertGeneratedQuestionsToSections(approvedPlan.generated_questions);
          if (converted) {
            transformedPlan = converted;
            console.log("✅ Using generated_questions from approved plan");
            // Debug: Check if options are present
            const questionsWithOptions = transformedPlan.sections.flatMap(s => 
              s.questions.filter(q => q.options && q.options.length > 0)
            );
            console.log(`📊 Found ${questionsWithOptions.length} questions with options out of ${transformedPlan.sections.reduce((sum, s) => sum + s.questions.length, 0)} total questions`);
            if (questionsWithOptions.length > 0) {
              console.log("📋 Sample question with options:", {
                text: questionsWithOptions[0].text?.substring(0, 50),
                type: questionsWithOptions[0].type,
                optionsCount: questionsWithOptions[0].options?.length,
                options: questionsWithOptions[0].options?.slice(0, 3),
              });
            }
          } else {
            // Fallback to original plan structure
            // Handle both section_brief and question_specs formats
            transformedPlan = {
              sections: (approvedPlan.plan?.pages || []).map((page, idx) => {
                if (page.section_brief) {
                  // For section_brief format, create placeholder structure
                  const questionCount = page.section_brief.question_count || 0;
                  return {
                    title: page.name || `Section ${idx + 1}`,
                    questions: Array.from({ length: questionCount }, (_, qIdx) => ({
                      text: `Question ${qIdx + 1} (to be generated)`,
                      type: 'text',
                      section_brief: page.section_brief,
                    })),
                  };
                } else if (page.question_specs && page.question_specs.length > 0) {
                  return {
                    title: page.name || `Section ${idx + 1}`,
                    questions: page.question_specs.map((spec) => ({
                      text: spec.intent,
                      type: spec.question_type,
                      options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
                    })),
                  };
                } else {
                  return {
                    title: page.name || `Section ${idx + 1}`,
                    questions: [],
                  };
                }
              }),
              suggestedName: approvedPlan.plan?.title || '',
            };
          }
        } else {
          // Fallback to original plan structure (only has intent and options_hint)
          // Handle both section_brief and question_specs formats
          transformedPlan = {
            sections: (approvedPlan.plan?.pages || []).map((page, idx) => {
              if (page.section_brief) {
                // For section_brief format, create placeholder structure
                const questionCount = page.section_brief.question_count || 0;
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: Array.from({ length: questionCount }, (_, qIdx) => ({
                    text: `Question ${qIdx + 1} (to be generated)`,
                    type: 'text',
                    section_brief: page.section_brief,
                  })),
                };
              } else if (page.question_specs && page.question_specs.length > 0) {
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: page.question_specs.map((spec) => ({
                    text: spec.intent,
                    type: spec.question_type,
                    options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
                  })),
                };
              } else {
                return {
                  title: page.name || `Section ${idx + 1}`,
                  questions: [],
                };
              }
            }),
            suggestedName: approvedPlan.plan?.title || '',
          };
        }

        // Debug: Log the transformed plan before saving
        const questionsWithOptions = transformedPlan.sections.flatMap(s => 
          s.questions.filter(q => q.options && Array.isArray(q.options) && q.options.length > 0)
        );
        console.log("💾 About to save structure:", {
          sectionsCount: transformedPlan.sections.length,
          totalQuestions: transformedPlan.sections.reduce((sum, s) => sum + s.questions.length, 0),
          questionsWithOptionsCount: questionsWithOptions.length,
          sampleQuestion: questionsWithOptions[0] ? {
            text: questionsWithOptions[0].text?.substring(0, 50),
            type: questionsWithOptions[0].type,
            optionsCount: questionsWithOptions[0].options?.length,
            options: questionsWithOptions[0].options,
          } : null,
        });

        // Save to survey structure
        try {
          await updateSurvey.mutateAsync({ 
            id: surveyId, 
            structure: transformedPlan 
          });
          console.log("✅ Survey structure saved successfully");
        } catch (updateError) {
          console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
        }

        // Store structure in localStorage as fallback for mock mode
        try {
          localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(transformedPlan));
          console.log("✅ Survey structure saved to localStorage");
          // Store thread_id for later use in BuilderPage
          if (threadId) {
            localStorage.setItem(`survey_${surveyId}_thread_id`, threadId);
          }
        } catch (e) {
          console.warn("Failed to save to localStorage:", e);
        }

        // Navigate to builder
        setLocation(`/builder/${surveyId}`);
      } catch (error) {
        // Error is handled by the hook's onError handler (toast notification)
        console.error("❌ Error approving plan:", error);
        // Don't navigate on error - let user see the error and try again
      }
    } else {
      // Legacy mode: handle non-planner plans
      try {
        await updateSurvey.mutateAsync({ 
          id: surveyId, 
          structure: blueprint 
        });
      } catch (updateError) {
        console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
      }
      // Store structure in localStorage as fallback for mock mode
      if (surveyId) {
        try {
          localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(blueprint));
          // Store thread_id for later use in BuilderPage (if available from rejected plan)
          if (threadId) {
            localStorage.setItem(`survey_${surveyId}_thread_id`, threadId);
          }
        } catch (e) {
          console.warn("Failed to save to localStorage:", e);
        }
      }
      setLocation(`/builder/${surveyId}`);
    }
  };

  const handleBlueprintReject = async (feedback: string) => {
    if (!threadId) {
      console.error("❌ Cannot reject plan: threadId is missing");
      return;
    }

    try {
      // Call reject API endpoint
      console.log("🔵 Rejecting survey plan with planner API...", threadId, feedback);
      const rejectedPlan = await rejectSurveyPlan.mutateAsync({ thread_id: threadId, feedback });
      console.log("✅ Plan rejected, received response:", rejectedPlan);

      // Update blueprint state with regenerated plan
      setBlueprint(rejectedPlan);

      // The plan will be automatically refreshed in the UI since we updated the blueprint state
      // The approval_status should now be "awaiting_approval" if regeneration was successful
    } catch (error: any) {
      // Check for MAX_PLAN_ATTEMPTS_REACHED error
      if (error.message && error.message.includes("Maximum attempts")) {
        // Error toast is already shown by the hook
        // Keep the current plan visible so user can see it
        console.error("❌ Max attempts reached, cannot regenerate plan");
      } else {
        // Other errors are handled by the hook's onError handler
        console.error("❌ Error rejecting plan:", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex font-sans">
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 pr-12 lg:pr-80">
        
        {/* Top Navigation / Stepper */}
        <header className="bg-white border-b border-border sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <Stepper 
              steps={[
                { id: "config", label: "Configuration", isCompleted: currentStep !== "metadata", isActive: currentStep === "metadata" },
                { id: "ai", label: "AI Builder", isCompleted: currentStep === "blueprint", isActive: currentStep === "ai-config" },
                { id: "blueprint", label: "Review Plan", isCompleted: false, isActive: currentStep === "blueprint" },
                { id: "editor", label: "Visual Editor", isCompleted: false, isActive: false },
                { id: "publish", label: "Publish", isCompleted: false, isActive: false },
              ]}
            />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: METADATA */}
            {currentStep === "metadata" && (
              <motion.div
                key="metadata"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="text-center mb-10">
                  <h1 className="text-3xl md:text-4xl font-display font-bold text-secondary mb-3">
                    Let's start with the basics
                  </h1>
                  <p className="text-muted-foreground text-lg">
                    Configure your survey details to get started.
                  </p>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleMetadataSubmit)} className="space-y-8">
                    
                    {/* Survey Name */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-secondary">Survey Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={selectedLanguage === "Bilingual" ? "Survey Name in English*" : "e.g. Employee Satisfaction Survey Q3"} 
                              className="input-field text-lg" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Arabic Name Field - Only show when Bilingual is selected */}
                    {selectedLanguage === "Bilingual" && (
                      <FormField
                        control={form.control}
                        name="nameArabic"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input 
                                placeholder="Survey Name in Arabic*" 
                                className="input-field text-lg" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Survey Type */}
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-secondary">Survey Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="text-lg h-12">
                                <SelectValue placeholder="Select a survey type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="population">Population</SelectItem>
                              <SelectItem value="labor">Labor</SelectItem>
                              <SelectItem value="education">Education</SelectItem>
                              <SelectItem value="health">Health</SelectItem>
                              <SelectItem value="income_and_consumption">Income and Consumption</SelectItem>
                              <SelectItem value="social">Social</SelectItem>
                              <SelectItem value="justice_and_crime">Justice and Crime</SelectItem>
                              <SelectItem value="culture">Culture</SelectItem>
                              <SelectItem value="political_and_other_community_activities">Political and Other Community Activities</SelectItem>
                              <SelectItem value="economic">Economic</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="agriculture">Agriculture</SelectItem>
                              <SelectItem value="energy">Energy</SelectItem>
                              <SelectItem value="transport">Transport</SelectItem>
                              <SelectItem value="tourism">Tourism</SelectItem>
                              <SelectItem value="financial_and_banking">Financial and Banking</SelectItem>
                              <SelectItem value="government">Government</SelectItem>
                              <SelectItem value="prices">Prices</SelectItem>
                              <SelectItem value="technology_and_science">Technology and Science</SelectItem>
                              <SelectItem value="environment">Environment</SelectItem>
                              <SelectItem value="regional">Regional</SelectItem>
                              <SelectItem value="multi_domain">Multi Domain</SelectItem>
                              <SelectItem value="happiness">Happiness</SelectItem>
                              <SelectItem value="online_research">Online Research</SelectItem>
                              <SelectItem value="human_resources">Human Resources</SelectItem>
                              <SelectItem value="events">Events</SelectItem>
                              <SelectItem value="community">Community</SelectItem>
                              <SelectItem value="demographics">Demographics</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Language Selection */}
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-secondary flex items-center gap-2">
                            <Globe className="w-5 h-5 text-primary" /> Survey Language*
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a language" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="English">English</SelectItem>
                              <SelectItem value="Arabic">Arabic</SelectItem>
                              <SelectItem value="Bilingual">Bilingual</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />


                    {/* Collection Mode */}
                    <FormField
                      control={form.control}
                      name="collectionMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-secondary mb-4 block">
                            Collection Mode
                          </FormLabel>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <CollectionModeCard
                              icon={Smartphone}
                              title="Field Survey"
                              description="Optimized for tablets and offline data collection by field agents."
                              selected={field.value === "field"}
                              onClick={() => field.onChange("field")}
                            />
                            <CollectionModeCard
                              icon={LinkIcon}
                              title="Web Link"
                              description="Standard web survey distributed via email, social media, or QR code."
                              selected={field.value === "web"}
                              onClick={() => field.onChange("web")}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end pt-8 gap-4">
                      <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground">
                        <Save className="w-4 h-4 mr-2" /> Save Draft
                      </Button>
                      <Button type="submit" className="btn-primary text-lg px-8 py-6 h-auto" disabled={createSurvey.isPending || updateSurvey.isPending}>
                        {createSurvey.isPending ? "Creating..." : "Next Step"} <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </motion.div>
            )}

            {/* STEP 2: AI CONFIGURATION */}
            {currentStep === "ai-config" && (
              <motion.div
                key="ai-config"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="bg-gradient-to-r from-secondary to-primary p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
                  <Sparkles className="absolute top-4 right-4 text-white/20 w-32 h-32 rotate-12" />
                  <h2 className="text-3xl font-display font-bold mb-2 flex items-center gap-3">
                    <Wand2 className="w-8 h-8" /> AI Survey Architect
                  </h2>
                  <p className="text-white/90 text-lg max-w-xl">
                    Describe your goals, and our AI will construct a professional survey structure for you in seconds.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Example Prompts - Moved to top */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      "Employee engagement survey for tech startup",
                      "Post-event feedback for a medical conference",
                      "Product market fit for new coffee brand"
                    ].map((example) => (
                      <div 
                        key={example}
                        onClick={() => setAiPrompt(example)}
                        className="bg-white p-3 rounded-lg border border-dashed border-border hover:border-primary/50 cursor-pointer text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-2"
                      >
                        <Lightbulb className="w-4 h-4 flex-shrink-0" />
                        {example}
                      </div>
                    ))}
                  </div>

                  {/* Prompt Input */}
                  <div className="space-y-3">
                    <label className="text-lg font-semibold text-secondary">
                      Prompt Description
                    </label>
                    {/* Textarea container with toggle inside */}
                    <div className="relative">
                      <Textarea 
                        placeholder="e.g. Create a customer satisfaction survey for a luxury hotel chain focusing on check-in experience, room cleanliness, and dining options." 
                        className="min-h-[160px] text-lg p-6 pr-24 rounded-xl border-border bg-white shadow-sm resize-none focus:ring-2 focus:ring-primary/20"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />
                      {/* Toggle switch and sparkle icon positioned inside textarea area at the bottom - Hidden when dialog is open */}
                      {!showRephraseDialog && (
                        <div 
                          className="absolute bottom-4 right-4 flex items-center gap-3"
                          style={{ 
                            pointerEvents: 'auto',
                            zIndex: 9999,
                            isolation: 'isolate'
                          }}
                        >
                          {/* Sparkle icon - clickable - calls Smart Rephrase API */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isPromptEnabled || !aiPrompt.trim() || rephrasePrompt.isPending) {
                                return;
                              }
                              handleRephraseClick();
                            }}
                            disabled={!isPromptEnabled || !aiPrompt.trim() || rephrasePrompt.isPending}
                            className="relative p-1.5 rounded-md hover:bg-primary/10 active:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white shadow-md"
                            style={{ 
                              pointerEvents: 'auto',
                              zIndex: 10000,
                              position: 'relative'
                            }}
                            aria-label="Smart Rephrase"
                            title="Click to rephrase prompt"
                          >
                            <Sparkles className={`w-5 h-5 text-primary/60 hover:text-primary transition-colors ${rephrasePrompt.isPending ? 'animate-pulse' : ''}`} />
                          </button>
                          <div style={{ pointerEvents: 'auto', zIndex: 10000 }}>
                            <Switch
                              checked={isPromptEnabled}
                              onCheckedChange={setIsPromptEnabled}
                              id="prompt-toggle"
                            />
                          </div>
                          {/* Generate button - positioned in corner, vertically aligned */}
                          {/* This button calls the same handleGenerate function as the Generate button below */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Call the same handleGenerate function that the Generate button uses
                              handleGenerate();
                            }}
                            disabled={
                              (isPromptEnabled ? createSurveyPlan.isPending : generateSurveyFast.isPending) ||
                              !aiPrompt.trim().length
                            }
                            className="relative px-4 py-2 rounded-md hover:bg-primary/10 active:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white shadow-md text-sm font-medium text-primary/60 hover:text-primary flex items-center gap-1.5"
                            style={{ 
                              pointerEvents: 'auto',
                              zIndex: 10000,
                              position: 'relative'
                            }}
                            aria-label="Generate"
                            title="Generate survey"
                          >
                            <Wand2 className="w-4 h-4" />
                            Generate
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Generate Button - Now positioned below the textarea */}
                  {/* COMMENTED OUT: Generate button */}
                  {/* <div className="relative z-10">
                    <Button 
                      className="w-full btn-primary py-3 text-base shadow-md shadow-primary/20 cursor-pointer relative z-10" 
                      onClick={handleGenerate}
                      disabled={
                        (isPromptEnabled ? createSurveyPlan.isPending : generateSurveyFast.isPending) ||
                        !aiPrompt.trim().length
                      }
                      type="button"
                    >
                      {(isPromptEnabled ? createSurveyPlan.isPending : generateSurveyFast.isPending) ? (
                        <>Generating <span className="animate-pulse">...</span></>
                      ) : (
                        <>Generate <Wand2 className="ml-2 w-4 h-4" /></>
                      )}
                    </Button>
                  </div> */}
                </div>
              </motion.div>
            )}

            {/* STEP 3: BLUEPRINT REVIEW */}
            {currentStep === "blueprint" && blueprint && (
              <BlueprintReview 
                plan={blueprint}
                onApprove={handleBlueprintApprove}
                onRetry={() => setCurrentStep("ai-config")}
                onReject={isPlannerResponse(blueprint) && threadId ? handleBlueprintReject : undefined}
                threadId={threadId || undefined}
                isRejecting={rejectSurveyPlan.isPending}
                isApproving={approveSurveyPlan.isPending}
              />
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar />

      {/* Rephrase Dialog - Shows original vs rewritten prompt with notes */}
      <Dialog open={showRephraseDialog} onOpenChange={setShowRephraseDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Smart Rephrase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Original Prompt Section - Always show */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2 font-semibold">Original Prompt:</p>
              <p className="text-base">{aiPrompt || "No prompt entered yet."}</p>
            </div>
            
            {/* Loading State */}
            {rephrasePrompt.isPending ? (
              <div className="flex flex-col items-center justify-center p-8 text-primary">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <p>Rephrasing your prompt...</p>
              </div>
            ) : rephrasePrompt.data ? (
              <>
                {/* Rewritten Prompt Section - Only show when data is available */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-primary font-bold">Rewritten Prompt:</p>
                    <Badge variant="outline" className="text-primary border-primary">AI Enhanced</Badge>
                  </div>
                  <p className="text-base">
                    {rephrasePrompt.data.rewritten_prompt || rephrasePrompt.data.rephrased || aiPrompt}
                  </p>
                </div>
                
                {/* Rewrite Notes Section - Only show if notes are available */}
                {rephrasePrompt.data.rewrite_notes && Array.isArray(rephrasePrompt.data.rewrite_notes) && rephrasePrompt.data.rewrite_notes.length > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 font-semibold mb-2">Improvements Made:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {rephrasePrompt.data.rewrite_notes.map((note: string, index: number) => (
                        <li key={index} className="text-sm text-blue-800">{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRephraseDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleApplyRephrase} 
              disabled={rephrasePrompt.isPending || !rephrasePrompt.data}
              className="btn-primary"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Use Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
