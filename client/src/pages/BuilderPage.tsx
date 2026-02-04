import { useRoute, useLocation } from "wouter";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { HistorySidebar } from "@/components/HistorySidebar";
import { QuestionCard } from "@/components/QuestionCard";
import { useSurvey } from "@/hooks/use-surveys";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

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
  
  // Fetch survey data
  const { data: survey, isLoading } = useSurvey(surveyId);

  // Extract survey structure - check both API response and localStorage fallback
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
  const sections = structure?.sections || [];

  // Calculate total questions across all sections
  const totalQuestions = sections.reduce((sum, section) => sum + section.questions.length, 0);

  // Handle regenerate - navigate back to config page
  const handleRegenerate = () => {
    setLocation("/config");
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

            {/* Title and Regenerate Button */}
            <div className="flex items-center justify-between">
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
              <Button
                variant="outline"
                onClick={handleRegenerate}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Regenerate
              </Button>
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

                    {/* Questions */}
                    <div className="space-y-4">
                      {section.questions.map((question, qIdx) => {
                        const currentQuestionNumber = questionNumber + qIdx;
                        return (
                          <QuestionCard
                            key={qIdx}
                            question={question.text}
                            type={question.type as "rating" | "text" | "choice"}
                            options={question.options}
                            questionNumber={currentQuestionNumber}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar />
    </div>
  );
}
