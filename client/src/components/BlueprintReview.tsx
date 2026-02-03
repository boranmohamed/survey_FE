import { GeneratedSurveyResponse } from "@shared/routes";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Check, Edit2, RotateCcw, ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface BlueprintReviewProps {
  plan: GeneratedSurveyResponse;
  onApprove: () => void;
  onRetry: () => void;
}

export function BlueprintReview({ plan, onApprove, onRetry }: BlueprintReviewProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-primary mb-2">
            AI Blueprint Ready
          </h2>
          <p className="text-muted-foreground">
            We've generated a structure based on your prompt. Review and approve to build the full survey.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onRetry} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Re-Generate
          </Button>
          <Button onClick={onApprove} className="btn-primary gap-2">
            <Check className="w-4 h-4" /> Approve Blueprint
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-12 gap-8">
        {/* Structure Map */}
        <div className="md:col-span-8 space-y-6">
          {plan.sections.map((section, idx) => (
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
                {section.questions.map((q, qIdx) => (
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

        {/* Feedback Panel */}
        <div className="md:col-span-4 space-y-6">
          <div className="bg-white rounded-xl shadow-lg border border-border p-6 sticky top-24">
            <h3 className="font-bold text-lg mb-4">Blueprint Feedback</h3>
            
            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-lg bg-green-50 border border-green-100 flex gap-3">
                <ThumbsUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900 text-sm">Strong Structure</p>
                  <p className="text-green-700 text-xs mt-1">
                    Good logical flow from general to specific questions.
                  </p>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-100 flex gap-3">
                <ThumbsDown className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 text-sm">Consider Adding</p>
                  <p className="text-amber-700 text-xs mt-1">
                    Maybe add a demographic section at the end?
                  </p>
                </div>
              </div>
            </div>

            <Button className="w-full justify-between" variant="outline">
              Customize Structure <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
