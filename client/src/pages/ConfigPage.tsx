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
});

type Step = "metadata" | "ai-config" | "blueprint";

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
    },
  });

  const handleMetadataSubmit = async (values: z.infer<typeof metadataSchema>) => {
    try {
      if (surveyId) {
        await updateSurvey.mutateAsync({ id: surveyId, ...values });
      } else {
        const newSurvey = await createSurvey.mutateAsync(values);
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
        const newSurvey = await createSurvey.mutateAsync({
          name: formValues.name || "Untitled Survey",
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
        const createRequest = {
          prompt: aiPrompt,
          title: formValues.name,
          type: formValues.type,
          language: plannerLanguage,
          numQuestions,
          numPages,
        };

        // Step 1: Create the plan and get thread_id
        console.log("🔵 Creating survey plan with planner API...");
        const createResponse = await createSurveyPlan.mutateAsync(createRequest);
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
          const transformedPlan = {
            sections: planResponse.plan.pages.map((page, idx) => ({
              title: page.name || `Section ${idx + 1}`,
              questions: page.question_specs.map((spec) => ({
                text: spec.intent,
                type: spec.question_type,
                options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
              })),
            })),
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
            } catch (e) {
              console.warn("Failed to save to localStorage:", e);
            }
          }
          setLocation(`/builder/${currentSurveyId}`);
        }
      } else {
        // Toggle OFF: Use existing external backend (Anomaly)
        const request = {
          prompt: aiPrompt,
          numQuestions,
          numPages,
          language: formValues.language,
          // Include title and type for external backend (required fields)
          title: formValues.name,
          type: formValues.type,
        } as const;

        const plan = await generateSurveyFast.mutateAsync(request);

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

        // Call generate-validate-fix endpoint after approval succeeds
        // This endpoint returns the actual rendered questions with full text, options, validation, etc.
        let generateResult: Awaited<ReturnType<typeof generateValidateFixQuestions>> | null = null;
        try {
          console.log("🔵 Calling generate-validate-fix endpoint...", threadId);
          generateResult = await generateValidateFixQuestions(threadId, true);
          console.log("✅ Generate-validate-fix completed:", generateResult);
          
          // Log validation results if available
          if (generateResult.validation) {
            console.log(`📊 Validation: ${generateResult.validation.passed ? 'PASSED' : 'FAILED'}, Issues: ${generateResult.validation.issue_count}`);
            if (generateResult.validation.issues && generateResult.validation.issues.length > 0) {
              console.log("⚠️ Validation issues:", generateResult.validation.issues);
            }
          }
          
          // Log save status
          if (generateResult.saved !== undefined) {
            console.log(`💾 Questions saved to database: ${generateResult.saved}`);
          }
          
          // Log total questions generated
          const totalQuestions = generateResult.rendered_pages.reduce(
            (sum, page) => sum + page.questions.length,
            0
          );
          console.log(`📝 Total questions generated: ${totalQuestions} across ${generateResult.rendered_pages.length} pages`);
        } catch (generateError) {
          // Log error but don't break the approval flow
          console.warn("⚠️ Generate-validate-fix failed, but approval succeeded:", generateError);
          // Continue with the flow even if generate-validate-fix fails
        }

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
                    options: (q.options && Array.isArray(q.options) && q.options.length > 0) ? q.options : undefined,
                    required: q.required !== undefined ? q.required : undefined,
                    spec_id: q.spec_id || undefined,
                    scale: q.scale || undefined,
                    validation: q.validation || undefined,
                    skip_logic: q.skip_logic || undefined,
                  })),
                };
              });
              
              return { sections, suggestedName: approvedPlan.plan.title };
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
                    options: (q.options && Array.isArray(q.options) && q.options.length > 0) ? q.options : undefined,
                    required: q.required !== undefined ? q.required : undefined,
                    spec_id: q.spec_id || undefined,
                    scale: q.scale || undefined,
                    validation: q.validation || undefined,
                    skip_logic: q.skip_logic || undefined,
                  })),
                };
              });
              
              return { sections, suggestedName: approvedPlan.plan.title };
            }
            
            return null;
          } catch (error) {
            console.warn("Failed to convert generated_questions to sections:", error);
            return null;
          }
        };
        
        let transformedPlan;
        if (generateResult?.rendered_pages) {
          // Use rendered_pages: contains actual question_text, full options array, validation, skip_logic, etc.
          transformedPlan = {
            sections: generateResult.rendered_pages.map((page, idx) => ({
              title: page.name || `Section ${idx + 1}`,
              questions: page.questions.map((question) => ({
                text: question.question_text, // Use actual rendered question text
                type: question.question_type,
                options: question.options && question.options.length > 0 ? question.options : undefined,
                required: question.required,
                // Include additional metadata fields: spec_id, scale, validation, skip_logic
                spec_id: question.spec_id || undefined,
                scale: question.scale || undefined,
                validation: question.validation || undefined,
                skip_logic: question.skip_logic || undefined,
              })),
            })),
            suggestedName: approvedPlan.plan.title,
          };
        } else if (approvedPlan.generated_questions) {
          // Use generated_questions from approved plan (actual questions generated during approval)
          const converted = convertGeneratedQuestionsToSections(approvedPlan.generated_questions);
          if (converted) {
            transformedPlan = converted;
            console.log("✅ Using generated_questions from approved plan");
          } else {
            // Fallback to original plan structure
            transformedPlan = {
              sections: approvedPlan.plan.pages.map((page, idx) => ({
                title: page.name || `Section ${idx + 1}`,
                questions: page.question_specs.map((spec) => ({
                  text: spec.intent,
                  type: spec.question_type,
                  options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
                })),
              })),
              suggestedName: approvedPlan.plan.title,
            };
          }
        } else {
          // Fallback to original plan structure (only has intent and options_hint)
          transformedPlan = {
            sections: approvedPlan.plan.pages.map((page, idx) => ({
              title: page.name || `Section ${idx + 1}`,
              questions: page.question_specs.map((spec) => ({
                text: spec.intent,
                type: spec.question_type,
                options: spec.options_hint && spec.options_hint.length > 0 ? spec.options_hint : undefined,
              })),
            })),
            suggestedName: approvedPlan.plan.title,
          };
        }

        // Save to survey structure
        try {
          await updateSurvey.mutateAsync({ 
            id: surveyId, 
            structure: transformedPlan 
          });
        } catch (updateError) {
          console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
        }

        // Store structure in localStorage as fallback for mock mode
        try {
          localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(transformedPlan));
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
                              placeholder="e.g. Employee Satisfaction Survey Q3" 
                              className="input-field text-lg" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                              <SelectItem value="customer_feedback">Customer Feedback</SelectItem>
                              <SelectItem value="employee_satisfaction">Employee Satisfaction</SelectItem>
                              <SelectItem value="market_research">Market Research</SelectItem>
                              <SelectItem value="product_feedback">Product Feedback</SelectItem>
                              <SelectItem value="event_feedback">Event Feedback</SelectItem>
                              <SelectItem value="general">General Survey</SelectItem>
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
                            <Globe className="w-5 h-5 text-primary" /> Language
                          </FormLabel>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {["English", "Arabic", "Bilingual"].map((lang) => (
                              <div
                                key={lang}
                                onClick={() => field.onChange(lang)}
                                className={`
                                  cursor-pointer p-4 rounded-xl border-2 text-center font-medium transition-all
                                  ${field.value === lang 
                                    ? "border-primary bg-primary/5 text-primary shadow-sm" 
                                    : "border-gray-200 hover:border-primary/50 text-gray-600"}
                                `}
                              >
                                {lang}
                              </div>
                            ))}
                          </div>
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
                    <label className="text-lg font-semibold text-secondary flex justify-between items-center">
                      Prompt Description
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary hover:text-primary/80 hover:bg-primary/5"
                        onClick={handleRephraseClick}
                        // Smart rephrase uses the built-in AI flow.
                        // When the toggle is OFF, we are using the external backend and we disable this.
                        disabled={!isPromptEnabled || !aiPrompt.trim() || rephrasePrompt.isPending}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${rephrasePrompt.isPending ? 'animate-spin' : ''}`} /> 
                        {rephrasePrompt.isPending ? 'Rephrasing...' : 'Smart Rephrase'}
                      </Button>
                    </label>
                    {/* Textarea container with toggle inside */}
                    <div className="relative">
                      <Textarea 
                        placeholder="e.g. Create a customer satisfaction survey for a luxury hotel chain focusing on check-in experience, room cleanliness, and dining options." 
                        className="min-h-[160px] text-lg p-6 rounded-xl border-border bg-white shadow-sm resize-none focus:ring-2 focus:ring-primary/20"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />
                      {/* Toggle switch positioned inside textarea area at the bottom */}
                      <div className="absolute bottom-4 right-4">
                        <Switch
                          checked={isPromptEnabled}
                          onCheckedChange={setIsPromptEnabled}
                          id="prompt-toggle"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Generate Button - Now positioned below the textarea */}
                  <div className="relative z-10">
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
                  </div>
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
            {/* Original Prompt Section */}
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
                {/* Rewritten Prompt Section */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-primary font-bold">Rewritten Prompt:</p>
                    <Badge variant="outline" className="text-primary border-primary">AI Enhanced</Badge>
                  </div>
                  <p className="text-base">
                    {rephrasePrompt.data.rewritten_prompt || rephrasePrompt.data.rephrased || aiPrompt}
                  </p>
                </div>
                
                {/* Rewrite Notes Section - Show if available */}
                {rephrasePrompt.data.rewrite_notes && rephrasePrompt.data.rewrite_notes.length > 0 && (
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
            ) : (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Click 'Smart Rephrase' to improve your prompt for better AI results.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRephraseDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleApplyRephrase} 
              disabled={rephrasePrompt.isPending || !rephrasePrompt.data}
              className="btn-primary"
            >
              Use This Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
