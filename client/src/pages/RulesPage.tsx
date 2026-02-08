import { useState } from "react";
import { useRoute, Link } from "wouter";
import { RotateCw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HistorySidebar } from "@/components/HistorySidebar";

/**
 * RulesPage - Page for generating survey rules
 * 
 * Allows users to input rule requirements and generate rules for their survey.
 * Features a large textarea with character counter and generate button.
 */
export default function RulesPage() {
  const [, params] = useRoute("/rules/:id");
  const surveyId = params?.id ? Number(params.id) : null;
  
  // State for rule requirements input
  const [ruleRequirements, setRuleRequirements] = useState<string>("");
  const maxCharacters = 1000;
  const characterCount = ruleRequirements.length;

  /**
   * Handle generate rules button click
   * TODO: Implement rules generation logic
   */
  const handleGenerateRules = () => {
    if (!ruleRequirements.trim()) {
      return;
    }
    // TODO: Call API to generate rules
    console.log("Generating rules with requirements:", ruleRequirements);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex font-sans">
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 pr-12 lg:pr-80">
        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
          {/* Title */}
          <h1 className="text-3xl font-display font-bold text-secondary text-center mb-8">
            Generated Survey Rules
          </h1>

          {/* Content Container */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6 md:p-8">
            {/* Header with prompt and history link */}
            <div className="flex items-start justify-between mb-6">
              <label className="text-base font-medium text-secondary">
                Let us know what rules you want to create:
              </label>
              
              {/* History link */}
              <Link href={surveyId ? `/builder/${surveyId}` : "/config"}>
                <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <RotateCw className="w-4 h-4" />
                  History
                </button>
              </Link>
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
                  disabled={!ruleRequirements.trim()}
                  className="bg-[#4FD1C7] hover:bg-[#38B2AC] text-white border-0 shadow-sm"
                >
                  Generate Rules
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar />
    </div>
  );
}

