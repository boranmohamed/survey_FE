import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  isCompleted: boolean;
  isActive: boolean;
}

interface StepperProps {
  steps: Step[];
  onStepClick?: (stepId: string) => void;
}

export function Stepper({ steps, onStepClick }: StepperProps) {
  return (
    <div className="relative">
      {/* Connecting Line */}
      <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-200 -z-10" />

      <div className="flex justify-between items-center w-full px-2">
        {steps.map((step) => (
          <div 
            key={step.id} 
            className="flex flex-col items-center group cursor-pointer"
            onClick={() => onStepClick?.(step.id)}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background",
                step.isActive 
                  ? "border-primary bg-primary text-white shadow-lg shadow-primary/20 scale-110" 
                  : step.isCompleted 
                    ? "border-primary text-primary" 
                    : "border-gray-200 text-gray-400 group-hover:border-primary/50"
              )}
            >
              {step.isCompleted ? (
                <Check className="w-5 h-5" />
              ) : (
                <span className="text-sm font-semibold">{steps.indexOf(step) + 1}</span>
              )}
            </div>
            <span 
              className={cn(
                "mt-2 text-xs font-medium uppercase tracking-wider transition-colors duration-300",
                step.isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
