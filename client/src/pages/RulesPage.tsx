import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Type, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HistorySidebar } from "@/components/HistorySidebar";
import { useGenerateSurveyRules, useGenerateQuestions, useUpdateSurvey, PromptValidationError } from "@/hooks/use-surveys";
import { RulesGenerationValidationError } from "@/lib/rulesGenerationError";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * RulesPage - Page for generating survey rules
 * 
 * Allows users to input rule requirements and generate rules for their survey.
 * Features a large textarea with character counter and generate button.
 * Calls the API endpoint POST /api/agentic-survey/{thread_id}/rules/generate
 * to generate validation and conditional rules based on user input.
 */
export default function RulesPage() {
  const [, params] = useRoute("/rules/:id");
  const [, setLocation] = useLocation();
  const surveyId = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // State for rule requirements input
  const [ruleRequirements, setRuleRequirements] = useState<string>("");
  const maxCharacters = 1000;
  const characterCount = ruleRequirements.length;
  
  // State for thread_id (required for API call)
  const [threadId, setThreadId] = useState<string | null>(null);
  
  // State for generated rules
  const [generatedRules, setGeneratedRules] = useState<{
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
  } | null>(null);
  
  // Hooks for generating rules and questions
  const generateRules = useGenerateSurveyRules();
  const generateQuestions = useGenerateQuestions();
  const updateSurvey = useUpdateSurvey();

  /**
   * Get thread_id from localStorage on mount and when surveyId changes
   * Similar to how BuilderPage retrieves thread_id
   */
  useEffect(() => {
    let foundThreadId: string | null = null;
    
    // First, try survey-specific storage
    if (surveyId) {
      try {
        const storedThreadId = localStorage.getItem(`survey_${surveyId}_thread_id`);
        if (storedThreadId) {
          foundThreadId = storedThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }
    
    // If not found, try general storage
    if (!foundThreadId) {
      try {
        const generalThreadId = localStorage.getItem("current_thread_id");
        if (generalThreadId) {
          foundThreadId = generalThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }
    
    setThreadId(foundThreadId);
  }, [surveyId]);

  /**
   * Handle generate rules button click
   * Calls the API to generate rules based on user requirements
   */
  const handleGenerateRules = async () => {
    if (!ruleRequirements.trim()) {
      toast({
        title: "Empty input",
        description: "Please enter rule requirements before generating.",
        variant: "destructive",
      });
      return;
    }

    // Check if thread_id is available
    if (!threadId) {
      toast({
        title: "Thread ID not found",
        description: "This survey was generated using fast mode (without planner API). Rules generation requires a survey generated with the planner API (toggle ON in config page). Please regenerate the survey with the planner API enabled.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the API with user prompt and optional expected rules count
      // Always send the trimmed prompt value - backend handles empty strings correctly
      const trimmedPrompt = ruleRequirements.trim();
      console.log("📤 Sending user_prompt:", {
        original: ruleRequirements,
        trimmed: trimmedPrompt,
        length: trimmedPrompt.length,
        willSend: trimmedPrompt || undefined
      });
      
      const response = await generateRules.mutateAsync({
        thread_id: threadId,
        user_prompt: trimmedPrompt || undefined, // Send undefined only if truly empty (after trim)
        // You can optionally set expected_rules_count here if needed
        // expected_rules_count: 8,
      });
      
      // Store the generated rules to display them
      setGeneratedRules(response);
    } catch (error) {
      // Check if this is a prompt validation error with a suggested prompt
      if (error instanceof PromptValidationError && error.suggestedPrompt) {
        // Update the prompt input with the suggested prompt
        setRuleRequirements(error.suggestedPrompt);
        // The error toast is already shown by the hook's onError handler
        console.log("📝 Updated rule requirements with suggestion:", error.suggestedPrompt);
      }
      // Don't log 422 validation errors as console errors - they're user-facing validation issues
      if (!(error instanceof RulesGenerationValidationError)) {
        // Only log real errors (500+, network errors, etc.)
        console.error("Error generating rules:", error);
      }
      // Error is handled by the hook's onError callback (toast notification)
      // Clear rules on error
      setGeneratedRules(null);
    }
  };

  /**
   * Handle generate survey button click
   * Generates questions, combines with rules, saves the complete survey, and navigates to builder
   */
  const handleGenerateSurvey = async () => {
    // Validate required data
    if (!threadId) {
      toast({
        title: "Thread ID not found",
        description: "This survey was generated using fast mode (without planner API). Survey generation requires a survey generated with the planner API (toggle ON in config page). Please regenerate the survey with the planner API enabled.",
        variant: "destructive",
      });
      return;
    }

    if (!surveyId) {
      toast({
        title: "Survey ID not found",
        description: "Cannot generate survey without a survey ID. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!generatedRules || !generatedRules.rules?.survey_rules || generatedRules.rules.survey_rules.length === 0) {
      toast({
        title: "Rules not found",
        description: "Please generate rules before generating the survey.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Step 1: Generate questions
      console.log("🔵 Generating survey questions...");
      const questionsResponse = await generateQuestions.mutateAsync(threadId);
      
      if (!questionsResponse.rendered_pages || questionsResponse.rendered_pages.length === 0) {
        throw new Error("No questions were generated. Please try again.");
      }

      // Step 2: Transform rendered_pages to survey structure format
      // Follow the pattern from ConfigPage.tsx handleBlueprintApprove()
      const transformedPlan = {
        sections: questionsResponse.rendered_pages.map((page, idx) => ({
          title: page.name || `Section ${idx + 1}`,
          questions: page.questions.map((question) => ({
            text: question.question_text,
            type: question.question_type,
            options: question.options && question.options.length > 0 ? question.options : undefined,
            required: question.required,
            // Include additional metadata fields
            spec_id: question.spec_id || undefined,
            scale: question.scale || undefined,
            validation: question.validation || undefined,
            skip_logic: question.skip_logic || undefined,
          })),
        })),
        // Add rules to the structure
        rules: generatedRules.rules.survey_rules,
        rules_metadata: {
          thread_id: generatedRules.thread_id,
          critique_summary: generatedRules.critique_summary,
        },
      };

      // Step 3: Save the complete survey structure (questions + rules)
      try {
        await updateSurvey.mutateAsync({ 
          id: surveyId, 
          structure: transformedPlan 
        });
      } catch (updateError) {
        // Show warning but continue - similar to ConfigPage pattern
        console.warn("Survey update failed, continuing in frontend-only mode:", updateError);
        toast({
          title: "Warning",
          description: "Survey structure saved locally but may not have been saved to the database.",
          variant: "default",
        });
      }

      // Step 4: Store structure in localStorage as fallback
      try {
        localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(transformedPlan));
        // Store thread_id for later use in BuilderPage
        if (threadId) {
          localStorage.setItem(`survey_${surveyId}_thread_id`, threadId);
        }
      } catch (e) {
        console.warn("Failed to save to localStorage:", e);
      }

      // Step 5: Navigate to builder page
      console.log("✅ Survey generated successfully, navigating to builder...");
      setLocation(`/builder/${surveyId}`);
    } catch (error) {
      // Error handling - the hook's onError will show a toast, but we can add additional context
      console.error("❌ Error generating survey:", error);
      // Don't navigate on error - let user see the error and try again
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex font-sans">
      <div className={cn("flex-1 flex flex-col min-w-0 transition-all duration-300", isSidebarOpen ? "pr-80" : "pr-12")}>
        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
          {/* Title */}
          <h1 className="text-3xl font-display font-bold text-secondary text-center mb-8">
            Generated Survey Rules
          </h1>

          {/* Content Container */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6 md:p-8">
            {/* Header with prompt */}
            <div className="flex items-start justify-between mb-6">
              <label className="text-base font-medium text-secondary">
                Let us know what rules you want to create:
              </label>
            </div>

            {/* Textarea Container with relative positioning for button */}
            <div className="relative">
              <Textarea
                value={ruleRequirements}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= maxCharacters) {
                    setRuleRequirements(value);
                  }
                }}
                placeholder="Enter your rule requirements here"
                className="min-h-[300px] resize-none border-2 border-[#4FD1C7] focus-visible:border-[#38B2AC] focus-visible:ring-2 focus-visible:ring-[#4FD1C7]/20 pr-32 pb-16"
                maxLength={maxCharacters}
              />
              
              {/* Character Counter - positioned at bottom left */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-muted-foreground">
                <Type className="w-3 h-3" />
                <span>
                  {characterCount} / {maxCharacters}
                </span>
              </div>

              {/* Generate Rules Button - positioned at bottom right */}
              <div className="absolute bottom-3 right-3">
                <Button
                  onClick={handleGenerateRules}
                  disabled={!ruleRequirements.trim() || generateRules.isPending || !threadId}
                  className="bg-[#4FD1C7] hover:bg-[#38B2AC] text-white border-0 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generateRules.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Rules"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Generated Rules Display Section */}
          {generatedRules && generatedRules.rules?.survey_rules && generatedRules.rules.survey_rules.length > 0 && (
            <div className="mt-8 space-y-4">
              <h2 className="text-2xl font-semibold text-secondary mb-4">
                Generated Rules ({generatedRules.rules.survey_rules.length})
              </h2>
              
              <div className="space-y-4">
                {generatedRules.rules.survey_rules.map((rule, index) => {
                  // Map rule types to icons and colors
                  const getRuleTypeInfo = (ruleType: string) => {
                    switch (ruleType) {
                      case "error_message":
                        return { icon: AlertCircle, color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200" };
                      case "warning_message":
                        return { icon: AlertCircle, color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" };
                      case "hide_question":
                      case "hide_answer":
                        return { icon: EyeOff, color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-200" };
                      case "show_question":
                      case "show_answer":
                        return { icon: Eye, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200" };
                      case "disable_question":
                        return { icon: Lock, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
                      case "enable_question":
                        return { icon: Unlock, color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200" };
                      default:
                        return { icon: CheckCircle2, color: "text-primary", bgColor: "bg-primary/5", borderColor: "border-primary/20" };
                    }
                  };

                  const typeInfo = getRuleTypeInfo(rule.meta_rule.rule_type);
                  const Icon = typeInfo.icon;

                  return (
                    <Card key={index} className={`${typeInfo.bgColor} ${typeInfo.borderColor} border-2`}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Icon className={`w-5 h-5 ${typeInfo.color}`} />
                          <span className={typeInfo.color}>
                            {rule.meta_rule.rule_id}: {rule.meta_rule.rule_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Description */}
                        <div>
                          <p className="text-sm font-medium text-secondary mb-1">Description:</p>
                          <p className="text-sm text-muted-foreground">{rule.meta_rule.description_en}</p>
                          {rule.meta_rule.description_ar && (
                            <p className="text-sm text-muted-foreground mt-1" dir="rtl">{rule.meta_rule.description_ar}</p>
                          )}
                        </div>

                        {/* Conditions */}
                        {rule.conditions && rule.conditions.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-secondary mb-2">Conditions:</p>
                            <div className="space-y-2">
                              {rule.conditions.map((condition, condIdx) => (
                                <div key={condIdx} className="bg-white/50 rounded-md p-3 border border-border/50">
                                  <div className="text-sm">
                                    <span className="font-medium">{condition.left_side.question_id}</span>
                                    {" "}
                                    <span className="text-muted-foreground">
                                      {condition.operator.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                                    </span>
                                    {" "}
                                    <span className="font-medium">
                                      {typeof condition.right_side.value === "object" 
                                        ? JSON.stringify(condition.right_side.value)
                                        : String(condition.right_side.value)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {rule.actions && rule.actions.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-secondary mb-2">Actions:</p>
                            <div className="space-y-2">
                              {rule.actions.map((action, actionIdx) => (
                                <div key={actionIdx} className="bg-white/50 rounded-md p-3 border border-border/50">
                                  <div className="text-sm">
                                    <span className="font-medium">{action.type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                                    {" "}
                                    <span className="text-muted-foreground">on</span>
                                    {" "}
                                    <span className="font-medium">{action.action_element}</span>
                                    {action.message_en && (
                                      <div className="mt-1 text-muted-foreground">
                                        <span className="text-xs">EN: </span>{action.message_en}
                                      </div>
                                    )}
                                    {action.message_ar && (
                                      <div className="mt-1 text-muted-foreground" dir="rtl">
                                        <span className="text-xs">AR: </span>{action.message_ar}
                                      </div>
                                    )}
                                    {action.action_answer && (
                                      <div className="mt-1 text-xs text-muted-foreground">
                                        Answer: {action.action_answer}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Critique Summary (if available) */}
              {generatedRules.critique_summary && (
                <Card className="mt-6 bg-blue-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-lg text-blue-900">Validation Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Initial Valid</p>
                        <p className="font-semibold text-green-600">{generatedRules.critique_summary.initial_validation.valid_count}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Initial Invalid</p>
                        <p className="font-semibold text-red-600">{generatedRules.critique_summary.initial_validation.invalid_count}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">After Fixing Valid</p>
                        <p className="font-semibold text-green-600">{generatedRules.critique_summary.after_fixing.valid_count}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Final Rules Count</p>
                        <p className="font-semibold text-blue-600">{generatedRules.critique_summary.final_rules_count}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />

      {/* Fixed Generate Survey Button - Bottom Right Corner */}
      {/* Only show button when rules have been generated */}
      {generatedRules && generatedRules.rules?.survey_rules && generatedRules.rules.survey_rules.length > 0 && (
        <Button
          className="fixed bottom-6 right-6 bg-[#4FD1C7] hover:bg-[#38B2AC] text-white border-0 shadow-lg z-50 px-6 py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleGenerateSurvey}
          disabled={generateQuestions.isPending || !threadId || !surveyId}
        >
          {generateQuestions.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate survey"
          )}
        </Button>
      )}
    </div>
  );
}

