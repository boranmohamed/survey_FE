import { useState } from "react";
import { GenerateSurveyResponse, SurveyPlanResponse } from "@shared/routes";
import { Button } from "./ui/button";
import { Check, Edit2, RotateCcw, Info, FileText, X } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "./ui/badge";
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
}

/**
 * Type guard to check if plan is from planner API
 */
function isPlannerResponse(plan: GenerateSurveyResponse | SurveyPlanResponse): plan is SurveyPlanResponse {
  return 'plan' in plan && 'approval_status' in plan && 'thread_id' in plan;
}

export function BlueprintReview({ plan, onApprove, onRetry, onReject, threadId, isRejecting = false }: BlueprintReviewProps) {
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
    const planData = plannerPlan.plan;

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
              Attempt: {plannerPlan.attempt}
            </Badge>
          </div>
        </div>

        {/* Plan Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" /> Plan Overview
            </CardTitle>
            <CardDescription>Basic information about the survey plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Title</p>
                <p className="text-base font-semibold">{planData.title}</p>
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
        </Card>

        {/* Limits & Distribution (Collapsible) */}
        {(planData.limits || planData.distribution) && (
          <Accordion type="single" collapsible>
            <AccordionItem value="limits-distribution">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" /> Limits & Distribution
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {planData.limits && (
                    <div>
                      <h4 className="font-semibold mb-2">Limits</h4>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                        {JSON.stringify(planData.limits, null, 2)}
                      </pre>
                    </div>
                  )}
                  {planData.distribution && (
                    <div>
                      <h4 className="font-semibold mb-2">Distribution</h4>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                        {JSON.stringify(planData.distribution, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Pages Structure */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-secondary">Pages Structure</h3>
          {planData.pages.map((page, pageIdx) => (
            <motion.div
              key={pageIdx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pageIdx * 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-border overflow-hidden"
            >
              <div className="bg-gray-50 px-6 py-4 border-b border-border flex justify-between items-center">
                <h3 className="font-bold text-lg text-secondary">
                  Page {pageIdx + 1}: {page.name}
                </h3>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-white px-3 py-1 rounded-full border border-border">
                  {page.question_specs.length} Questions
                </span>
              </div>
              <div className="p-6 space-y-4">
                {page.question_specs.map((spec, specIdx) => (
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
                          {spec.options_hint.map((option, optIdx) => (
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
                ))}
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
            disabled={plannerPlan.approval_status === "approved"}
          >
            <Check className="w-4 h-4" /> Approve Plan
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
        <Button onClick={onApprove} className="btn-primary gap-2">
          <Check className="w-4 h-4" /> Approve plan
        </Button>
      </div>
    </div>
  );
}
