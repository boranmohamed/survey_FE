import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Trash2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistorySidebar } from "@/components/HistorySidebar";
import { QuestionCard } from "@/components/QuestionCard";
import { useSurvey, useUpdateSurvey, useUpdateSurveyPlan, useDeleteQuestion, useDeletePage } from "@/hooks/use-surveys";
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
import { cn } from "@/lib/utils";
import { getText, getTextArray, getUserLanguagePreference, getBothLanguages, getBothLanguagesArray, shouldUseBilingual, isBilingualContent } from "@/lib/bilingual";

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
  
  // ALWAYS log when component renders - this will help verify console is working
  console.log("🚀 BuilderPage rendered", { surveyId, timestamp: new Date().toISOString() });
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // State for delete confirmation dialog
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  // Local state for structure to enable immediate UI updates
  const [localStructure, setLocalStructure] = useState<any>(null);
  // Ref to track previous structure to avoid unnecessary updates
  const prevStructureRef = useRef<string>("");
  // Ref to track if we've manually updated the structure (to prevent overwriting)
  const manualUpdateRef = useRef<boolean>(false);
  // State for edit input value
  const [editInputValue, setEditInputValue] = useState<string>("");
  // State to track if thread_id is available (for enabling/disabling edit feature)
  const [hasThreadId, setHasThreadId] = useState<boolean>(false);
  // State to track which question is being deleted (by spec_id)
  const [deletingSpecId, setDeletingSpecId] = useState<string | null>(null);
  
  // Fetch survey data
  const { data: survey, isLoading } = useSurvey(surveyId);
  const updateSurvey = useUpdateSurvey();
  const updateSurveyPlan = useUpdateSurveyPlan();
  const deleteQuestion = useDeleteQuestion();
  const deletePageMutation = useDeletePage();
  
  // Debug: Log survey data when it loads
  useEffect(() => {
    if (survey) {
      console.log("🔍 Survey loaded in BuilderPage:", {
        id: survey.id,
        name: survey.name,
        language: survey.language,
        hasStructure: !!survey.structure,
        structureType: typeof survey.structure,
        structureSectionsCount: survey.structure?.sections?.length || 0,
      });
    }
  }, [survey]);

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
    // Don't overwrite if we've manually updated the structure
    if (manualUpdateRef.current) {
      console.log("⏭️ Skipping structure sync - manual update in progress");
      return;
    }

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
      // Debug: Log the structure format when loading
      if (structure.sections && structure.sections[0]?.questions?.[0]) {
        console.log("🔍 Structure loaded in BuilderPage:", {
          firstQuestionText: structure.sections[0].questions[0].text,
          firstQuestionTextType: typeof structure.sections[0].questions[0].text,
          firstQuestionIsBilingual: typeof structure.sections[0].questions[0].text === 'object' && structure.sections[0].questions[0].text !== null && 'en' in structure.sections[0].questions[0].text,
          firstOption: structure.sections[0].questions[0].options?.[0],
          firstOptionType: typeof structure.sections[0].questions[0].options?.[0],
          firstOptionIsBilingual: typeof structure.sections[0].questions[0].options?.[0] === 'object' && structure.sections[0].questions[0].options?.[0] !== null && 'en' in structure.sections[0].questions[0].options?.[0],
        });
      }
      const structureStr = JSON.stringify(structure);
      if (structureStr !== prevStructureRef.current) {
        console.log("🔄 Syncing structure from survey data");
        prevStructureRef.current = structureStr;
        setLocalStructure(structure);
      }
    }
  }, [survey?.structure, surveyId]);

  // Use local structure if available, otherwise fallback to survey structure
  const structure = localStructure || survey?.structure;
  const sections = structure?.sections || [];

  // Get user language preference from survey language
  const userLang = getUserLanguagePreference(survey?.language || "English");
  
  // Check if survey is bilingual - check both the language field AND the actual content
  // This handles cases where survey language is "English" but content is actually bilingual
  const surveyLanguageBilingual = shouldUseBilingual(survey?.language || "English");
  // Also check if the content itself is bilingual (even if survey language says "English")
  const firstQuestionText = sections.length > 0 && sections[0]?.questions?.[0]?.text;
  const contentIsBilingual = firstQuestionText ? isBilingualContent(firstQuestionText) : false;
  const isBilingual = surveyLanguageBilingual || contentIsBilingual;
  
  // Debug: Log bilingual detection
  console.log("🔍 Bilingual detection:", {
    surveyLanguage: survey?.language,
    surveyLanguageBilingual,
    firstQuestionText: typeof firstQuestionText === 'string' 
      ? firstQuestionText.substring(0, 100)
      : (typeof firstQuestionText === 'object' && firstQuestionText !== null && 'en' in firstQuestionText)
        ? `${firstQuestionText.en} / ${firstQuestionText.ar}`.substring(0, 100)
        : String(firstQuestionText || ''),
    contentIsBilingual,
    isBilingual,
  });
  
  // Debug: Log survey language and bilingual status
  if (survey) {
    console.log("🔍 Survey language check:", {
      surveyLanguage: survey.language,
      isBilingual: isBilingual,
      userLang: userLang,
      hasStructure: !!structure,
      sectionsCount: structure?.sections?.length || 0,
    });
  }

  // Calculate total questions across all sections
  const totalQuestions = sections.reduce((sum, section) => sum + section.questions.length, 0);

  /**
   * Handle page deletion - calls the delete page API
   * Deletes a page from the survey plan and updates the structure
   */
  const handleDeletePage = async () => {
    if (pageToDelete === null || !surveyId || !structure) return;

    // Get thread_id from localStorage (stored when survey is generated)
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

    // If thread_id is available, use the planner API
    if (threadId) {
      try {
        // Page numbers are 1-indexed in the API (pageToDelete is 0-indexed)
        const pageNumber = pageToDelete + 1;
        
        // Call the delete page API
        const result = await deletePageMutation.mutateAsync({
          thread_id: threadId,
          page_number: pageNumber,
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
          title: "Page deleted",
          description: result.status?.message || `Page ${pageNumber} has been deleted successfully.`,
        });

        // Close dialog
        setPageToDelete(null);
      } catch (error) {
        // Error handling is done by the hook, but we can add additional logging
        console.error("Failed to delete page:", error);
        // Close dialog even on error
        setPageToDelete(null);
      }
    } else {
      // Fallback to local deletion if thread_id is not available
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
    }
  };

  /**
   * Handle question deletion - calls the delete question API
   * Deletes a question from the survey plan and updates the structure
   */
  const handleDeleteQuestion = async (spec_id: string) => {
    if (!spec_id) {
      toast({
        title: "Error",
        description: "Question spec_id is required for deletion.",
        variant: "destructive",
      });
      return;
    }

    // Set the deleting spec_id to show loader only on this question
    setDeletingSpecId(spec_id);

    // Get thread_id from localStorage (stored when survey is generated)
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
      setDeletingSpecId(null); // Clear deleting state on error
      toast({
        title: "Delete not available",
        description: "This survey was generated using fast mode (without planner API). The delete feature only works for surveys generated with the planner API (toggle ON in config page).",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the delete API
      const result = await deleteQuestion.mutateAsync({
        thread_id: threadId,
        spec_id: spec_id,
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
        title: "Question deleted",
        description: result.status?.message || "Question has been deleted successfully.",
      });

      // Clear deleting state after successful deletion
      setDeletingSpecId(null);
    } catch (error) {
      // Error handling is done by the hook, but we can add additional logging
      console.error("Failed to delete question:", error);
      // Clear deleting state on error
      setDeletingSpecId(null);
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

      console.log("✅ Update API response received:", {
        renderedPagesCount: result.rendered_pages?.length || 0,
        firstPageQuestionsCount: result.rendered_pages?.[0]?.questions?.length || 0,
        firstQuestionHasOptions: !!result.rendered_pages?.[0]?.questions?.[0]?.options,
        firstQuestionOptionsCount: result.rendered_pages?.[0]?.questions?.[0]?.options?.length || 0,
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

      // Debug: Log the updated structure
      const questionsWithOptions = updatedStructure.sections.flatMap(s => 
        s.questions.filter(q => q.options && Array.isArray(q.options) && q.options.length > 0)
      );
      console.log("📊 Updated structure:", {
        sectionsCount: updatedStructure.sections.length,
        totalQuestions: updatedStructure.sections.reduce((sum, s) => sum + s.questions.length, 0),
        questionsWithOptionsCount: questionsWithOptions.length,
        sampleQuestion: questionsWithOptions[0] ? {
          text: questionsWithOptions[0].text?.substring(0, 50),
          type: questionsWithOptions[0].type,
          optionsCount: questionsWithOptions[0].options?.length,
          options: questionsWithOptions[0].options,
        } : null,
      });

      // Mark that we're doing a manual update to prevent useEffect from overwriting
      manualUpdateRef.current = true;

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

      // Reset manual update flag after a short delay to allow API updates to complete
      setTimeout(() => {
        manualUpdateRef.current = false;
      }, 1000);

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
      <div className={cn("flex-1 flex flex-col min-w-0 transition-all duration-300", isSidebarOpen ? "pr-80" : "pr-12")}>
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

        {/* Main Content - Wider for bilingual surveys */}
        <main className={`flex-1 p-6 md:p-10 mx-auto w-full ${isBilingual ? 'max-w-7xl' : 'max-w-5xl'}`}>
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
                        
                        // For bilingual surveys, extract both languages separately
                        // For non-bilingual, use single language extraction
                        // Debug: Log the question text format
                        if (isBilingual && qIdx === 0 && sectionIdx === 0) {
                          console.log("🔍 Debug bilingual question:", {
                            rawText: question.text,
                            textType: typeof question.text,
                            isString: typeof question.text === 'string',
                            isObject: typeof question.text === 'object',
                            hasEn: typeof question.text === 'object' && question.text !== null && 'en' in question.text,
                            hasAr: typeof question.text === 'object' && question.text !== null && 'ar' in question.text,
                          });
                        }
                        const questionTextBilingual = isBilingual ? getBothLanguages(question.text) : null;
                        const questionText = isBilingual ? null : getText(question.text, userLang);
                        
                        // Debug: Log the extracted bilingual text
                        if (isBilingual && qIdx === 0 && sectionIdx === 0) {
                          console.log("🔍 Extracted bilingual question:", questionTextBilingual);
                        }
                        
                        // Extract options - bilingual or single language
                        if (isBilingual && question.options && qIdx === 0 && sectionIdx === 0) {
                          console.log("🔍 Debug bilingual options:", {
                            rawOptions: question.options,
                            firstOption: question.options[0],
                            firstOptionType: typeof question.options[0],
                          });
                        }
                        const questionOptionsBilingual = isBilingual && question.options ? getBothLanguagesArray(question.options) : null;
                        const questionOptions = isBilingual ? null : (question.options ? getTextArray(question.options, userLang) : undefined);
                        
                        // Debug: Log the extracted bilingual options
                        if (isBilingual && questionOptionsBilingual && qIdx === 0 && sectionIdx === 0) {
                          console.log("🔍 Extracted bilingual options:", questionOptionsBilingual.slice(0, 2));
                        }
                        
                        // Extract scale labels from bilingual objects if needed
                        const questionScale = question.scale ? {
                          ...question.scale,
                          labels: question.scale.labels ? {
                            min: question.scale.labels.min ? (isBilingual ? getBothLanguages(question.scale.labels.min) : getText(question.scale.labels.min, userLang)) : undefined,
                            max: question.scale.labels.max ? (isBilingual ? getBothLanguages(question.scale.labels.max) : getText(question.scale.labels.max, userLang)) : undefined,
                          } : undefined,
                        } : undefined;
                        
                        // Debug logging for questions with options
                        if (['radio', 'checkbox_list', 'dropdown_list', 'select'].includes(question.type)) {
                          console.log(`🔍 BuilderPage - Question ${currentQuestionNumber} (${question.type}):`, {
                            text: question.text?.substring(0, 50),
                            hasOptions: !!question.options,
                            optionsType: Array.isArray(question.options) ? 'array' : typeof question.options,
                            optionsLength: Array.isArray(question.options) ? question.options.length : 'N/A',
                            options: question.options?.slice(0, 3),
                          });
                        }
                        
                        // Ensure we always have bilingual data when survey is bilingual
                        // Fallback to re-extracting if questionTextBilingual is null
                        const finalQuestionBilingual = isBilingual ? (questionTextBilingual || getBothLanguages(question.text)) : null;
                        const finalOptionsBilingual = isBilingual && question.options ? (questionOptionsBilingual || getBothLanguagesArray(question.options)) : [];
                        
                        // Debug: Log what we're passing to QuestionCard for first question
                        if (qIdx === 0 && sectionIdx === 0) {
                          console.log("🔍 Passing to QuestionCard:", {
                            isBilingual: isBilingual,
                            questionTextBilingual: finalQuestionBilingual,
                            hasOptionsBilingual: finalOptionsBilingual.length > 0,
                            firstOptionBilingual: finalOptionsBilingual[0],
                            rawQuestionText: question.text,
                            rawFirstOption: question.options?.[0],
                            willShowSeparate: isBilingual && finalQuestionBilingual !== null,
                          });
                        }
                        
                        // For bilingual surveys, render two separate question cards side by side
                        if (isBilingual && finalQuestionBilingual) {
                          return (
                            <div key={qIdx} className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                              {/* English Question Card */}
                              <QuestionCard
                                question={finalQuestionBilingual.en}
                                questionBilingual={null}
                                type={question.type}
                                options={finalOptionsBilingual.map(opt => opt.en)}
                                optionsBilingual={[]}
                                isBilingual={false}
                                questionNumber={currentQuestionNumber}
                                spec_id={question.spec_id}
                                required={question.required}
                                validation={question.validation}
                                skip_logic={question.skip_logic}
                                scale={questionScale ? {
                                  ...questionScale,
                                  labels: questionScale.labels ? {
                                    min: typeof questionScale.labels.min === 'object' && questionScale.labels.min !== null && 'en' in questionScale.labels.min
                                      ? questionScale.labels.min.en
                                      : questionScale.labels.min,
                                    max: typeof questionScale.labels.max === 'object' && questionScale.labels.max !== null && 'en' in questionScale.labels.max
                                      ? questionScale.labels.max.en
                                      : questionScale.labels.max,
                                  } : undefined,
                                } : undefined}
                                onDelete={question.spec_id && hasThreadId ? () => handleDeleteQuestion(question.spec_id) : undefined}
                                isDeleting={deleteQuestion.isPending && deletingSpecId === question.spec_id}
                              />
                              {/* Arabic Question Card */}
                              <QuestionCard
                                question={finalQuestionBilingual.ar}
                                questionBilingual={null}
                                type={question.type}
                                options={finalOptionsBilingual.map(opt => opt.ar)}
                                optionsBilingual={[]}
                                isBilingual={false}
                                questionNumber={null} // Don't show number for Arabic version
                                spec_id={question.spec_id}
                                required={question.required}
                                validation={question.validation}
                                skip_logic={question.skip_logic}
                                scale={questionScale ? {
                                  ...questionScale,
                                  labels: questionScale.labels ? {
                                    min: typeof questionScale.labels.min === 'object' && questionScale.labels.min !== null && 'ar' in questionScale.labels.min
                                      ? questionScale.labels.min.ar
                                      : questionScale.labels.min,
                                    max: typeof questionScale.labels.max === 'object' && questionScale.labels.max !== null && 'ar' in questionScale.labels.max
                                      ? questionScale.labels.max.ar
                                      : questionScale.labels.max,
                                  } : undefined,
                                } : undefined}
                                onDelete={undefined} // Only show delete on English version
                                isDeleting={false}
                              />
                            </div>
                          );
                        }
                        
                        // For non-bilingual surveys, render single question card
                        return (
                          <QuestionCard
                            key={qIdx}
                            question={questionText}
                            questionBilingual={finalQuestionBilingual}
                            type={question.type}
                            options={questionOptions || []} // Ensure options is always an array
                            optionsBilingual={finalOptionsBilingual}
                            isBilingual={isBilingual}
                            questionNumber={currentQuestionNumber}
                            // Pass metadata fields if available
                            spec_id={question.spec_id}
                            required={question.required}
                            validation={question.validation}
                            skip_logic={question.skip_logic}
                            scale={questionScale}
                            // Pass delete handler if thread_id is available
                            onDelete={question.spec_id && hasThreadId ? () => handleDeleteQuestion(question.spec_id) : undefined}
                            isDeleting={deleteQuestion.isPending && deletingSpecId === question.spec_id}
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
      <HistorySidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />

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
            <AlertDialogCancel disabled={deletePageMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              disabled={deletePageMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePageMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
