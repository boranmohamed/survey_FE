import { useState } from "react";
import { GenerateSurveyResponse, SurveyPlanResponse, PlanPage, PlanQuestionSpec } from "@shared/routes";
import { Button } from "./ui/button";
import { Check, Edit2, RotateCcw, Info, FileText, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "./ui/badge";
import { getText, getTextArray, getUserLanguagePreference } from "@/lib/bilingual";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";

interface BlueprintReviewProps {
  plan: GenerateSurveyResponse | SurveyPlanResponse;
  onApprove: () => void;
  onRetry: () => void;
  onReject?: (feedback: string) => void;
  threadId?: string;
  isRejecting?: boolean;
  isApproving?: boolean;
  attachedFile?: File | null; // File that was uploaded by the user
}

/**
 * Type guard to check if plan is from planner API
 */
function isPlannerResponse(plan: GenerateSurveyResponse | SurveyPlanResponse): plan is SurveyPlanResponse {
  return 'plan' in plan && 'approval_status' in plan && 'thread_id' in plan;
}

export function BlueprintReview({ plan, onApprove, onRetry, onReject, threadId, isRejecting = false, isApproving = false, attachedFile = null }: BlueprintReviewProps) {
  // State for reject feedback dialog
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");

  // Handle reject button click - open dialog
  const handleRejectClick = () => {
    if (onReject && threadId) {
      setShowRejectDialog(true);
    } else {
      // Fallback to onRetry if onReject is not provided (legacy mode)
      onRetry();
    }
  };

  // Handle reject dialog submit
  const handleRejectSubmit = () => {
    if (rejectFeedback.trim() && onReject) {
      onReject(rejectFeedback.trim());
      setShowRejectDialog(false);
      setRejectFeedback("");
    }
  };

  // Handle planner API response format
  if (isPlannerResponse(plan)) {
    const plannerPlan = plan;
    // Handle both normalized (plan.plan) and wrapped (plan.data.plan) response structures
    const planData = plannerPlan.plan || (plannerPlan as any).data?.plan;
    
    // Determine user language preference for bilingual text extraction
    const userLang = getUserLanguagePreference(planData?.language || "en");

    // Safety check: ensure plan has pages
    if (!planData || !planData.pages || !Array.isArray(planData.pages) || planData.pages.length === 0) {
      console.error("BlueprintReview: Invalid planner plan structure", plan);
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h2 className="text-2xl font-display font-bold text-red-600 mb-2">
              Invalid Plan Structure
            </h2>
            <p className="text-muted-foreground mb-4">
              The generated plan does not have the expected structure. Please try regenerating.
            </p>
            <p className="text-xs text-muted-foreground font-mono bg-white p-2 rounded">
              {JSON.stringify(plan, null, 2).substring(0, 500)}
            </p>
            <Button variant="outline" onClick={onRetry} className="gap-2 mt-4">
              <RotateCcw className="w-4 h-4" /> Re-Generate
            </Button>
          </div>
        </div>
      );
    }

    // Get approval status badge color
    const getApprovalStatusBadge = (status: string) => {
      switch (status) {
        case "approved":
          return "bg-green-100 text-green-800 border-green-300";
        case "rejected":
          return "bg-red-100 text-red-800 border-red-300";
        case "awaiting_approval":
        default:
          return "bg-yellow-100 text-yellow-800 border-yellow-300";
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header with metadata */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-display font-bold text-primary mb-2">
              AI Plan Ready
            </h2>
            <p className="text-muted-foreground">
              Review the generated survey plan with all metadata and approve to build the full survey.
            </p>
          </div>

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">
              Attempt: {plannerPlan.attempt}:3
            </Badge>
          </div>
        </div>

        {/* Plan Overview - Collapsible */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="plan-overview" className="border-none">
            <Card>
              <CardHeader className="pb-3">
                <AccordionTrigger className="hover:no-underline py-0">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" /> Plan Overview
                  </CardTitle>
                </AccordionTrigger>
                <CardDescription className="pt-1">Basic information about the survey plan</CardDescription>
              </CardHeader>
              <AccordionContent>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Title</p>
                      <p className="text-base font-semibold">{getText(planData.title, userLang)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Type</p>
                      <p className="text-base font-semibold">{planData.type}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Language</p>
                      <p className="text-base font-semibold">{planData.language}</p>
                    </div>
                  </div>
                  {/* Display uploaded file information if a file was attached */}
                  {attachedFile && (
                    <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Attached File</p>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <p className="text-base font-semibold text-primary">{attachedFile.name}</p>
                        <span className="text-xs text-muted-foreground">
                          ({(attachedFile.size / 1024).toFixed(2)} KB)
                        </span>
                      </div>
                    </div>
                  )}
                  {planData.estimated_question_count && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Estimated Questions</p>
                      <p className="text-base font-semibold">{planData.estimated_question_count}</p>
                    </div>
                  )}
                  {(planData.suggested_number_of_pages !== null || planData.final_number_of_pages !== null) && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Pages</p>
                      <div className="space-y-1">
                        {planData.suggested_number_of_pages !== null && (
                          <p className="text-base font-semibold text-primary">Suggested: {planData.suggested_number_of_pages}</p>
                        )}
                        {planData.final_number_of_pages !== null && (
                          <p className="text-base font-semibold text-green-600">Final: {planData.final_number_of_pages}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {planData.notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Notes</p>
                      <p className="text-base">{planData.notes}</p>
                    </div>
                  )}
                </CardContent>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>

        {/* Plan Rationale - Complete Planning Explanation - Collapsible */}
        {planData.plan_rationale && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="planning-rationale" className="border-none">
              <Card>
                <CardHeader className="pb-3">
                  <AccordionTrigger className="hover:no-underline py-0">
                    <CardTitle className="flex items-center gap-2">
                      Planning Rationale
                    </CardTitle>
                  </AccordionTrigger>
                  <CardDescription className="pt-1">
                    Detailed explanation of the planning decisions and approach
                  </CardDescription>
                </CardHeader>
                <AccordionContent>
                  <CardContent className="space-y-6 pt-0">
                    {/* Summary Section - Combined: Summary text, Page and Count Reasoning, and Survey Context Insights */}
                    {(planData.plan_rationale.summary || 
                      (planData.plan_rationale.page_and_count_reasoning && planData.plan_rationale.page_and_count_reasoning.length > 0) ||
                      planData.plan_rationale.contextual_insights) && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-4">Summary</h4>
                        <div className="space-y-4">
                          {/* Summary text */}
                          {planData.plan_rationale.summary && (
                            <p className="text-base leading-relaxed text-foreground">
                              {getText(planData.plan_rationale.summary, userLang)}
                            </p>
                          )}

                          {/* Page and Count Reasoning */}
                          {planData.plan_rationale.page_and_count_reasoning && 
                           planData.plan_rationale.page_and_count_reasoning.length > 0 && (
                            <div>
                              <h5 className="font-medium text-foreground mb-2 text-sm">Page and Count Reasoning</h5>
                              <ul className="space-y-2">
                                {getTextArray(planData.plan_rationale.page_and_count_reasoning, userLang).map((reason: string, idx: number) => (
                                  <li key={idx} className="flex gap-2 text-foreground">
                                    <span className="text-primary mt-1">•</span>
                                    <span className="flex-1">{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {/* Question Style Guidance */}
                          {planData.plan_rationale.question_style_guidance && 
                           planData.plan_rationale.question_style_guidance.length > 0 && (
                            <div>
                              <h5 className="font-medium text-foreground mb-2 text-sm">Question Style Guidance</h5>
                              <ul className="space-y-2">
                                {getTextArray(planData.plan_rationale.question_style_guidance, userLang).map((guidance: string, idx: number) => (
                                  <li key={idx} className="flex gap-2 text-foreground">
                                    <span className="text-primary mt-1">•</span>
                                    <span className="flex-1">{guidance}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Survey Context Insights */}
                          {planData.plan_rationale.contextual_insights && (
                            <div>
                              <h5 className="font-medium text-foreground mb-2 text-sm">Survey Context Insights</h5>
                              <div className="space-y-2">
                                {planData.plan_rationale.contextual_insights.title && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Title:</p>
                                    <p className="text-base text-foreground">{getText(planData.plan_rationale.contextual_insights.title, userLang)}</p>
                                  </div>
                                )}
                                {planData.plan_rationale.contextual_insights.type && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Type:</p>
                                    <p className="text-base text-foreground">{getText(planData.plan_rationale.contextual_insights.type, userLang)}</p>
                                  </div>
                                )}
                                {planData.plan_rationale.contextual_insights.language && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Language:</p>
                                    <p className="text-base text-foreground">{getText(planData.plan_rationale.contextual_insights.language, userLang)}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Question Type Reasoning - Collapsible */}
                    {planData.plan_rationale.question_type_reasoning && 
                     Array.isArray(planData.plan_rationale.question_type_reasoning) &&
                     planData.plan_rationale.question_type_reasoning.length > 0 && (
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="question-type-reasoning" className="border-none">
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <h4 className="font-semibold text-foreground">Question Type Reasoning</h4>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2">
                            <div className="space-y-3">
                              {planData.plan_rationale.question_type_reasoning.map((reason: any, idx: number) => {
                                // Check if reason is an object with question_type and why
                                if (typeof reason === 'object' && reason !== null && 'question_type' in reason && 'why' in reason) {
                                  return (
                                    <div key={idx} className="bg-muted/50 rounded-lg p-4 border border-border">
                                      <div className="flex items-start gap-3">
                                        <Badge variant="secondary" className="mt-0.5 flex-shrink-0 capitalize">
                                          {reason.question_type}
                                        </Badge>
                                        <div className="flex-1">
                                          <p className="text-foreground leading-relaxed">{reason.why}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                // Fallback for string or other formats
                                return (
                                  <div key={idx} className="flex gap-2 text-foreground">
                                    <span className="text-primary mt-1">•</span>
                                    <span className="flex-1">
                                      {typeof reason === 'string' ? reason : JSON.stringify(reason, null, 2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {/* Assumptions */}
                    {planData.plan_rationale.assumptions && 
                     planData.plan_rationale.assumptions.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Assumptions</h4>
                        <ul className="space-y-2">
                          {getTextArray(planData.plan_rationale.assumptions, userLang).map((assumption: string, idx: number) => (
                            <li key={idx} className="flex gap-2 text-foreground">
                              <span className="text-primary mt-1">•</span>
                              <span className="flex-1">{assumption}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>
        )}

        {/* Debug card: Show what data we have to help diagnose missing plan_rationale */}
        {!planData.plan_rationale && (
          // Debug card: Show what data we have to help diagnose missing plan_rationale
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Info className="w-5 h-5" /> Debug: Plan Rationale Status
              </CardTitle>
              <CardDescription className="text-yellow-700">
                Checking if plan_rationale exists in the API response
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <p className="font-semibold text-yellow-900">Has plan_rationale:</p>
                <p className="text-yellow-800 font-mono">
                  {planData.plan_rationale ? "✅ YES" : "❌ NO"}
                </p>
              </div>
              {planData.plan_rationale && (
                <div className="text-sm">
                  <p className="font-semibold text-yellow-900">Has summary:</p>
                  <p className="text-yellow-800 font-mono">
                    {planData.plan_rationale.summary ? "✅ YES" : "❌ NO"}
                  </p>
                </div>
              )}
              <div className="text-sm">
                <p className="font-semibold text-yellow-900">Plan data keys:</p>
                <p className="text-yellow-800 font-mono text-xs">
                  {Object.keys(planData || {}).join(", ")}
                </p>
              </div>
              {planData.plan_rationale && (
                <div className="text-sm">
                  <p className="font-semibold text-yellow-900">plan_rationale keys:</p>
                  <p className="text-yellow-800 font-mono text-xs">
                    {Object.keys(planData.plan_rationale).join(", ")}
                  </p>
                </div>
              )}
              <div className="mt-4 p-3 bg-white rounded border border-yellow-300">
                <p className="text-xs font-semibold text-yellow-900 mb-2">Full plan_rationale object:</p>
                <pre className="text-xs text-yellow-800 overflow-auto max-h-40">
                  {JSON.stringify(planData.plan_rationale || "null", null, 2)}
                </pre>
              </div>
              <p className="text-xs text-yellow-700 mt-2">
                💡 If plan_rationale is missing, the backend API needs to include it in the response.
                Check the browser console for full API response details.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pages Structure */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-secondary">Pages Structure</h3>
          {planData.pages.map((page: PlanPage, pageIdx: number) => (
            <motion.div
              key={pageIdx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pageIdx * 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-border overflow-hidden"
            >
              <div className="bg-gray-50 px-6 py-4 border-b border-border flex justify-between items-center">
                <h3 className="font-bold text-lg text-secondary">
                  Page {pageIdx + 1}: {getText(page.name, userLang)}
                </h3>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-white px-3 py-1 rounded-full border border-border">
                  {/* Show question count from section_brief or question_specs */}
                  {page.section_brief?.question_count ?? (page.question_specs?.length ?? 0)} Questions
                </span>
              </div>
              <div className="p-6 space-y-4">
                {/* Check for section_brief first (new format) */}
                {page.section_brief ? (
                  <div className="bg-muted/50 rounded-lg p-6 border border-border">
                    <div className="font-semibold text-foreground mb-4 text-base">
                      Section Brief ({page.section_brief.question_count ?? 0} questions)
                    </div>
                    
                    {page.section_brief.summary && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Summary:</p>
                        <p className="text-base text-foreground">{getText(page.section_brief.summary, userLang)}</p>
                      </div>
                    )}
                    
                    {page.section_brief.topics && page.section_brief.topics.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Topics:</p>
                        <div className="flex flex-wrap gap-2">
                          {getTextArray(page.section_brief.topics, userLang).map((topic: string, topicIdx: number) => (
                            <Badge key={topicIdx} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {page.section_brief.guidance && page.section_brief.guidance.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Guidance:</p>
                        <ul className="space-y-1">
                          {getTextArray(page.section_brief.guidance, userLang).map((guideline: string, guideIdx: number) => (
                            <li key={guideIdx} className="flex gap-2 text-foreground text-sm">
                              <span className="text-primary mt-1">•</span>
                              <span className="flex-1">{guideline}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {page.section_brief.must_include && page.section_brief.must_include.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Must Include:</p>
                        <div className="flex flex-wrap gap-2">
                          {getTextArray(page.section_brief.must_include, userLang).map((item: string, itemIdx: number) => (
                            <Badge key={itemIdx} variant="secondary" className="text-xs bg-green-100 text-green-800">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {page.section_brief.avoid && page.section_brief.avoid.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Avoid:</p>
                        <div className="flex flex-wrap gap-2">
                          {getTextArray(page.section_brief.avoid, userLang).map((item: string, itemIdx: number) => (
                            <Badge key={itemIdx} variant="secondary" className="text-xs bg-red-100 text-red-800">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : page.question_specs && page.question_specs.length > 0 ? (
                  // Fall back to question_specs for backward compatibility
                  page.question_specs.map((spec: PlanQuestionSpec, specIdx: number) => (
                  <div key={specIdx} className="flex gap-4 items-start group">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm">
                      {specIdx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground mb-1">{spec.intent}</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">
                          {spec.question_type}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          {spec.language}
                        </span>
                        {spec.required && (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
                            Required
                          </span>
                        )}
                        {spec.spec_id && (
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {spec.spec_id}
                          </span>
                        )}
                        {spec.options_hint && spec.options_hint.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            • {spec.options_hint.length} option hints
                          </span>
                        )}
                      </div>
                      {spec.options_hint && spec.options_hint.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {spec.options_hint.map((option: string, optIdx: number) => (
                            <Badge key={optIdx} variant="outline" className="text-xs">
                              {option}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                  ))
                ) : (
                  // No section_brief or question_specs available
                  <div className="text-muted-foreground text-sm italic">
                    No questions or section brief available for this page
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Action Buttons - Moved to end of page */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6 border-t border-border">
          {onReject && threadId ? (
            <Button 
              variant="outline" 
              onClick={handleRejectClick} 
              className="gap-2"
              disabled={isRejecting || plannerPlan.approval_status === "approved"}
            >
              <X className="w-4 h-4" /> Reject Plan
            </Button>
          ) : (
            <Button variant="outline" onClick={onRetry} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Re-Generate
            </Button>
          )}
          <Button 
            onClick={onApprove} 
            className="btn-primary gap-2"
            disabled={plannerPlan.approval_status === "approved" || isApproving}
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Approving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" /> Approve Plan
              </>
            )}
          </Button>
        </div>

        {/* Reject Feedback Dialog */}
        {onReject && threadId && (
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Reject Plan</DialogTitle>
                <DialogDescription>
                  Please provide feedback explaining why you're rejecting this plan. 
                  The plan will be regenerated with your feedback (if attempts &lt; 3).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="reject-feedback">Feedback (required)</Label>
                  <Textarea
                    id="reject-feedback"
                    placeholder="e.g. The plan needs more questions about user demographics. Please add age, gender, and location questions."
                    className="min-h-[120px]"
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    disabled={isRejecting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your feedback will be used to improve the regenerated plan.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectDialog(false);
                    setRejectFeedback("");
                  }}
                  disabled={isRejecting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectSubmit}
                  disabled={!rejectFeedback.trim() || isRejecting}
                  className="btn-primary"
                >
                  {isRejecting ? "Rejecting..." : "Reject & Regenerate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // Handle legacy format (GenerateSurveyResponse)
  const legacyPlan = plan as GenerateSurveyResponse;
  
  // Safety check: ensure plan has sections
  if (!legacyPlan || !legacyPlan.sections || !Array.isArray(legacyPlan.sections) || legacyPlan.sections.length === 0) {
    console.error("BlueprintReview: Invalid plan structure", plan);
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-2xl font-display font-bold text-red-600 mb-2">
            Invalid Plan Structure
          </h2>
          <p className="text-muted-foreground mb-4">
            The generated plan does not have the expected structure. Please try regenerating.
          </p>
          <p className="text-xs text-muted-foreground font-mono bg-white p-2 rounded">
            {JSON.stringify(plan, null, 2).substring(0, 500)}
          </p>
          <Button variant="outline" onClick={onRetry} className="gap-2 mt-4">
            <RotateCcw className="w-4 h-4" /> Re-Generate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-primary mb-2">
            AI plan Ready
          </h2>
          <p className="text-muted-foreground">
            We've generated a structure based on your prompt. Review and approve to build the full survey.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Structure Map */}
        {legacyPlan.sections.map((section: GenerateSurveyResponse['sections'][number], idx: number) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-border overflow-hidden"
          >
            <div className="bg-gray-50 px-6 py-4 border-b border-border flex justify-between items-center">
              <h3 className="font-bold text-lg text-secondary">
                Section {idx + 1}: {section.title}
              </h3>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-white px-3 py-1 rounded-full border border-border">
                {section.questions.length} Questions
              </span>
            </div>
            <div className="p-6 space-y-4">
              {section.questions.map((q: GenerateSurveyResponse['sections'][number]['questions'][number], qIdx: number) => (
                <div key={qIdx} className="flex gap-4 items-start group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm">
                    {qIdx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground mb-1">{q.text}</p>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">
                        {q.type}
                      </span>
                      {q.options && (
                        <span className="text-xs text-muted-foreground">
                          • {q.options.length} options
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Action Buttons - Moved to end of page */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6 border-t border-border">
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RotateCcw className="w-4 h-4" /> Re-Generate
        </Button>
        <Button 
          onClick={onApprove} 
          className="btn-primary gap-2"
          disabled={isApproving}
        >
          {isApproving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Approving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" /> Approve plan
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
