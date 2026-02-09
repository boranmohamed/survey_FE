import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Trash2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistorySidebar } from "@/components/HistorySidebar";
import { QuestionCard } from "@/components/QuestionCard";
import { useSurvey, useUpdateSurvey, useUpdateSurveyPlan } from "@/hooks/use-surveys";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * BuilderPage - Visual editor for survey structure
 * 
 * Displays generated survey questions with interactive components.
 * Shows questions grouped by sections/pages with breadcrumb navigation.
 */
export default function BuilderPage() {
  const [, params] = useRoute("/builder/:id");
  const [, setLocation] = useLocation();
  const surveyId = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  
  // State for delete confirmation dialog
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  // Local state for structure to enable immediate UI updates
  const [localStructure, setLocalStructure] = useState<any>(null);
  // Ref to track previous structure to avoid unnecessary updates
  const prevStructureRef = useRef<string>("");
  // State for edit input value
  const [editInputValue, setEditInputValue] = useState<string>("");
  // State to track if thread_id is available (for enabling/disabling edit feature)
  const [hasThreadId, setHasThreadId] = useState<boolean>(false);
  
  // Fetch survey data
  const { data: survey, isLoading } = useSurvey(surveyId);
  const updateSurvey = useUpdateSurvey();
  const updateSurveyPlan = useUpdateSurveyPlan();

  // Check if thread_id is available on mount and when surveyId changes
  useEffect(() => {
    let threadId: string | null = null;
    if (surveyId) {
      try {
        const storedThreadId = localStorage.getItem(`survey_${surveyId}_thread_id`);
        if (storedThreadId) {
          threadId = storedThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }
    
    // Also check general storage
    if (!threadId) {
      try {
        const generalThreadId = localStorage.getItem("current_thread_id");
        if (generalThreadId) {
          threadId = generalThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }
    
    setHasThreadId(!!threadId);
  }, [surveyId]);

  // Extract survey structure - check both API response and localStorage fallback
  // Use local structure if available, otherwise use survey structure
  useEffect(() => {
    let structure = survey?.structure;
    if (!structure && surveyId) {
      // Fallback to localStorage for mock mode
      try {
        const stored = localStorage.getItem(`survey_${surveyId}_structure`);
        if (stored) {
          structure = JSON.parse(stored);
        }
      } catch (e) {
        console.warn("Failed to read from localStorage:", e);
      }
    }
    // Only update local structure if it's different from the previous one
    // This prevents overwriting local changes with stale API data
    if (structure) {
      const structureStr = JSON.stringify(structure);
      if (structureStr !== prevStructureRef.current) {
        prevStructureRef.current = structureStr;
        setLocalStructure(structure);
      }
    }
  }, [survey?.structure, surveyId]);

  // Use local structure if available, otherwise fallback to survey structure
  const structure = localStructure || survey?.structure;
  const sections = structure?.sections || [];

  // Calculate total questions across all sections
  const totalQuestions = sections.reduce((sum, section) => sum + section.questions.length, 0);

  /**
   * Handle page deletion - removes a section from the survey structure
   * Updates both API (if available) and localStorage for persistence
   * Also updates local state immediately for responsive UI
   */
  const handleDeletePage = async () => {
    if (pageToDelete === null || !surveyId || !structure) return;

    // Create new sections array without the deleted page
    const newSections = sections.filter((_, idx) => idx !== pageToDelete);
    
    // Create updated structure
    const updatedStructure = {
      ...structure,
      sections: newSections
    };

    // Update local state immediately for responsive UI
    setLocalStructure(updatedStructure);
    // Update ref to prevent overwriting with stale API data
    prevStructureRef.current = JSON.stringify(updatedStructure);

    try {
      // Update via API if available
      if (survey?.id) {
        await updateSurvey.mutateAsync({
          id: survey.id,
          structure: updatedStructure
        });
      }

      // Also update localStorage as fallback
      if (surveyId) {
        localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(updatedStructure));
      }

      toast({
        title: "Page deleted",
        description: `Page ${pageToDelete + 1} has been removed from the survey.`,
      });

      // Close dialog
      setPageToDelete(null);
    } catch (error) {
      console.error("Failed to delete page:", error);
      // Revert local state on error
      setLocalStructure(structure);
      toast({
        title: "Error",
        description: "Failed to delete page. Please try again.",
        variant: "destructive",
      });
    }
  };

  /**
   * Handle submit edit - calls the update survey plan API
   * Updates the survey plan based on natural language instructions
   */
  const handleSubmitEdit = async () => {
    if (!editInputValue.trim()) {
      toast({
        title: "Empty input",
        description: "Please enter some text before submitting.",
        variant: "destructive",
      });
      return;
    }

    // Get thread_id from localStorage (stored when survey is generated)
    // Check both survey-specific and general thread_id storage
    let threadId: string | null = null;
    if (surveyId) {
      try {
        const storedThreadId = localStorage.getItem(`survey_${surveyId}_thread_id`);
        if (storedThreadId) {
          threadId = storedThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }

    // If not found in survey-specific storage, try general storage
    if (!threadId) {
      try {
        const generalThreadId = localStorage.getItem("current_thread_id");
        if (generalThreadId) {
          threadId = generalThreadId;
        }
      } catch (e) {
        console.warn("Failed to read thread_id from localStorage:", e);
      }
    }

    if (!threadId) {
      toast({
        title: "Update not available",
        description: "This survey was generated using fast mode (without planner API). The edit feature only works for surveys generated with the planner API (toggle ON in config page). Please regenerate the survey with the planner API enabled to use this feature.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the update API
      const result = await updateSurveyPlan.mutateAsync({
        thread_id: threadId,
        update_instructions: editInputValue.trim(),
      });

      // Convert rendered_pages to the structure format expected by the UI
      const updatedStructure = {
        sections: result.rendered_pages.map((page) => ({
          title: page.name,
          questions: page.questions.map((q) => ({
            text: q.question_text,
            type: q.question_type,
            options: q.options || [],
            spec_id: q.spec_id,
            required: q.required,
            validation: q.validation,
            skip_logic: q.skip_logic,
            scale: q.scale,
          })),
        })),
      };

      // Update local structure immediately for responsive UI
      setLocalStructure(updatedStructure);
      prevStructureRef.current = JSON.stringify(updatedStructure);

      // Update via API if available
      if (survey?.id) {
        await updateSurvey.mutateAsync({
          id: survey.id,
          structure: updatedStructure,
        });
      }

      // Also update localStorage as fallback
      if (surveyId) {
        localStorage.setItem(`survey_${surveyId}_structure`, JSON.stringify(updatedStructure));
      }

      // Show success message
      toast({
        title: "Survey updated",
        description: result.status?.message || "Survey has been updated successfully.",
      });

      // Clear the input
      setEditInputValue("");
    } catch (error) {
      // Error handling is done by the hook, but we can add additional logging
      console.error("Failed to update survey plan:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex font-sans">
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 pr-12 lg:pr-80">
        {/* Header */}
        <header className="bg-white border-b border-border sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-6 py-4">
            {/* Breadcrumb Navigation */}
            <Breadcrumb className="mb-4">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/config" className="hover:text-foreground">
                      Basic Settings
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/config" className="hover:text-foreground">
                      AI Configuration
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Generated Results</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            {/* Title */}
            <div className="flex items-center gap-4">
              <Link href="/config">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              </Link>
              <h1 className="text-2xl font-display font-bold text-secondary">
                Generated Survey Questions
              </h1>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-border p-8 text-center">
              <p className="text-muted-foreground">Loading survey...</p>
            </div>
          ) : !survey || sections.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-border p-8 text-center">
              <h2 className="text-2xl font-semibold text-secondary mb-4">
                No Survey Data
              </h2>
              <p className="text-muted-foreground mb-6">
                Survey ID: {surveyId}
              </p>
              <p className="text-muted-foreground">
                No survey structure found. Please generate a survey first.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Render each section as a page */}
              {sections.map((section, sectionIdx) => {
                const questionCount = section.questions.length;
                let questionNumber = 1;
                
                // Calculate question number across all previous sections
                for (let i = 0; i < sectionIdx; i++) {
                  questionNumber += sections[i].questions.length;
                }

                return (
                  <div key={sectionIdx} className="space-y-4">
                    {/* Page Header with Green Bar */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-primary rounded-full"></div>
                        <div className="flex items-center gap-4">
                          <h2 className="text-xl font-display font-bold text-secondary">
                            Page {sectionIdx + 1}
                          </h2>
                          <span className="text-sm text-muted-foreground">
                            {questionCount} Questions
                          </span>
                        </div>
                      </div>
                      {/* Delete button for page */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPageToDelete(sectionIdx)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>

                    {/* Questions */}
                    <div className="space-y-4">
                      {section.questions.map((question, qIdx) => {
                        const currentQuestionNumber = questionNumber + qIdx;
                        return (
                          <QuestionCard
                            key={qIdx}
                            question={question.text}
                            type={question.type}
                            options={question.options}
                            questionNumber={currentQuestionNumber}
                            // Pass metadata fields if available
                            spec_id={question.spec_id}
                            required={question.required}
                            validation={question.validation}
                            skip_logic={question.skip_logic}
                            scale={question.scale}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Edit input box at the bottom of the page */}
          <div className="mt-8 space-y-2">
            <label className="text-sm font-medium text-secondary">edit</label>
            <div className="flex items-center gap-2">
              <Input 
                type="text" 
                placeholder={hasThreadId ? "Enter your update instructions here..." : "Edit feature requires planner API (generate with toggle ON)"}
                className="flex-1"
                value={editInputValue}
                onChange={(e) => setEditInputValue(e.target.value)}
                disabled={!hasThreadId}
                onKeyDown={(e) => {
                  // Allow submitting with Enter key (only if thread_id is available)
                  if (e.key === "Enter" && hasThreadId && !updateSurveyPlan.isPending) {
                    handleSubmitEdit();
                  }
                }}
              />
              {/* Submit Edit button */}
              <Button
                onClick={handleSubmitEdit}
                disabled={updateSurveyPlan.isPending || !hasThreadId || !editInputValue.trim()}
                className="min-w-[120px]"
                aria-label="Submit edit"
              >
                {updateSurveyPlan.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  "Submit Edit"
                )}
              </Button>
            </div>
            {!hasThreadId && (
              <p className="text-xs text-muted-foreground">
                This survey was generated using fast mode. To use the edit feature, regenerate the survey with the planner API enabled (toggle ON in config page).
              </p>
            )}
          </div>

          {/* Proceed to rules button */}
          <div className="mt-6">
            <Button
              onClick={() => {
                if (surveyId) {
                  setLocation(`/rules/${surveyId}`);
                } else {
                  toast({
                    title: "Error",
                    description: "Survey ID not found. Cannot navigate to rules page.",
                    variant: "destructive",
                  });
                }
              }}
              className="w-full"
            >
              proceed to rules
            </Button>
          </div>
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={pageToDelete !== null} onOpenChange={(open) => !open && setPageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Page {pageToDelete !== null ? pageToDelete + 1 : ''}? 
              This will remove {pageToDelete !== null ? sections[pageToDelete]?.questions.length || 0 : 0} question(s) 
              and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
