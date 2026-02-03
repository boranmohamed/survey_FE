import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Smartphone, Link as LinkIcon, Sparkles, Wand2, Lightbulb, ArrowRight, Save, Layout, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useCreateSurvey, useUpdateSurvey, useGenerateSurvey, useRephrasePrompt } from "@/hooks/use-surveys";
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

  // Hooks
  const createSurvey = useCreateSurvey();
  const updateSurvey = useUpdateSurvey();
  const generateSurvey = useGenerateSurvey();
  const rephrasePrompt = useRephrasePrompt();

  const form = useForm<z.infer<typeof metadataSchema>>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      name: "",
      language: "English",
      collectionMode: "web",
    },
  });

  const handleMetadataSubmit = async (values: z.infer<typeof metadataSchema>) => {
    if (surveyId) {
      await updateSurvey.mutateAsync({ id: surveyId, ...values });
    } else {
      const newSurvey = await createSurvey.mutateAsync(values);
      setSurveyId(newSurvey.id);
    }
    setCurrentStep("ai-config");
  };

  const handleGenerate = async () => {
    if (!surveyId) return;

    try {
      const plan = await generateSurvey.mutateAsync({
        prompt: aiPrompt,
        numQuestions,
        numPages,
        language: form.getValues("language")
      });

      if (reviewPlan) {
        setBlueprint(plan);
        setCurrentStep("blueprint");
      } else {
        // Direct save and proceed
        await updateSurvey.mutateAsync({ 
          id: surveyId, 
          structure: plan 
        });
        setLocation(`/builder/${surveyId}`);
      }
    } catch (err) {
      // Error handled by hook toast
    }
  };

  const handleRephrase = async () => {
    if (!aiPrompt) return;
    const result = await rephrasePrompt.mutateAsync({
      prompt: aiPrompt,
      language: form.getValues("language")
    });
    setAiPrompt(result.rephrased);
    setShowRephraseDialog(false);
  };

  const handleBlueprintApprove = async () => {
    if (surveyId && blueprint) {
      await updateSurvey.mutateAsync({ 
        id: surveyId, 
        structure: blueprint 
      });
      setLocation(`/builder/${surveyId}`);
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

                <div className="grid md:grid-cols-12 gap-8">
                  <div className="md:col-span-8 space-y-6">
                    {/* Prompt Input */}
                    <div className="space-y-3">
                      <label className="text-lg font-semibold text-secondary flex justify-between items-center">
                        Prompt Description
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-primary hover:text-primary/80 hover:bg-primary/5"
                          onClick={() => setShowRephraseDialog(true)}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" /> Smart Rephrase
                        </Button>
                      </label>
                      <Textarea 
                        placeholder="e.g. Create a customer satisfaction survey for a luxury hotel chain focusing on check-in experience, room cleanliness, and dining options." 
                        className="min-h-[160px] text-lg p-6 rounded-xl border-border bg-white shadow-sm resize-none focus:ring-2 focus:ring-primary/20"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />
                    </div>

                    {/* Example Prompts */}
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
                  </div>

                  {/* Sidebar Controls */}
                  <div className="md:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-border space-y-6">
                      <h3 className="font-bold text-lg text-secondary border-b pb-2 mb-4">Configuration</h3>
                      
                      <CounterInput 
                        label="Questions" 
                        value={numQuestions} 
                        onChange={setNumQuestions} 
                        min={3} 
                        max={20} 
                      />
                      
                      <CounterInput 
                        label="Pages" 
                        value={numPages} 
                        onChange={setNumPages} 
                        min={1} 
                        max={5} 
                      />

                      <div className="flex items-center justify-between pt-4 border-t">
                        <label className="text-sm font-medium text-foreground cursor-pointer" htmlFor="review-toggle">
                          Review Blueprint
                        </label>
                        <Switch 
                          id="review-toggle" 
                          checked={reviewPlan} 
                          onCheckedChange={setReviewPlan} 
                        />
                      </div>
                    </div>

                    <Button 
                      className="w-full btn-primary py-6 text-lg shadow-xl shadow-primary/20" 
                      onClick={handleGenerate}
                      disabled={generateSurvey.isPending || !aiPrompt.length}
                    >
                      {generateSurvey.isPending ? (
                        <>Generating <span className="animate-pulse">...</span></>
                      ) : (
                        <>Generate Structure <Wand2 className="ml-2 w-5 h-5" /></>
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
              />
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* Right Sidebar - History */}
      <HistorySidebar />

      {/* Rephrase Dialog */}
      <Dialog open={showRephraseDialog} onOpenChange={setShowRephraseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smart Rephrase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Original:</p>
              <p>{aiPrompt || "No prompt entered yet."}</p>
            </div>
            {rephrasePrompt.isPending ? (
              <div className="flex justify-center p-8 text-primary">Rephrasing...</div>
            ) : (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm text-primary font-bold">Suggested:</p>
                  <Badge variant="outline" className="text-primary border-primary">AI Enhanced</Badge>
                </div>
                <p>
                  {rephrasePrompt.data?.rephrased || "Click 'Rephrase' to improve your prompt for better AI results."}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRephraseDialog(false)}>Cancel</Button>
            <Button onClick={handleRephrase} disabled={rephrasePrompt.isPending}>
              Apply Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
