import { useState } from "react";
import { StarRating } from "./StarRating";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

interface QuestionCardProps {
  /**
   * Question text to display
   */
  question: string;
  /**
   * Question type: rating, text, or choice
   */
  type: "rating" | "text" | "choice";
  /**
   * Options for choice type questions
   */
  options?: string[];
  /**
   * Question number/index
   */
  questionNumber?: number;
}

/**
 * QuestionCard - Displays a survey question with appropriate input component
 * 
 * Handles three question types:
 * - Rating: Interactive star rating component
 * - Text: Text input or textarea
 * - Choice: Radio buttons or checkboxes with options
 */
export function QuestionCard({ question, type, options = [], questionNumber }: QuestionCardProps) {
  const [rating, setRating] = useState<number | undefined>();
  const [textValue, setTextValue] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<string>("");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-6 space-y-4">
      {/* Question Text */}
      <div className="flex items-start gap-3">
        {questionNumber && (
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm">
            {questionNumber}
          </div>
        )}
        <h3 className="text-lg font-semibold text-secondary flex-1">
          {question}
        </h3>
      </div>

      {/* Question Input Based on Type */}
      <div className="pl-11">
        {type === "rating" && (
          <StarRating
            value={rating}
            onChange={setRating}
            readOnly={false}
          />
        )}

        {type === "text" && (
          <Textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Type your answer here..."
            className="min-h-[100px] resize-none"
          />
        )}

        {type === "choice" && options.length > 0 && (
          <RadioGroup value={selectedChoice} onValueChange={setSelectedChoice}>
            <div className="space-y-3">
              {options.map((option, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`option-${idx}`} />
                  <Label
                    htmlFor={`option-${idx}`}
                    className="text-base font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        )}
      </div>
    </div>
  );
}

