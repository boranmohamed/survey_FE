import { useState } from "react";
import { Trash2 } from "lucide-react";
import { StarRating } from "./StarRating";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

// All supported question types from the API
type QuestionType =
  | "scale"
  | "radio"
  | "text_field"
  | "text_area"
  | "checkbox"
  | "checkbox_list"
  | "dropdown_list"
  | "star_rating"
  | "emoji_question"
  | "rank"
  | "number"
  | "email"
  // Legacy types for backward compatibility
  | "rating"
  | "text"
  | "choice";

interface QuestionCardProps {
  /**
   * Question text to display
   */
  question: string;
  /**
   * Question type: supports all API question types
   */
  type: QuestionType;
  /**
   * Options for choice type questions (radio, checkbox_list, dropdown_list, rank)
   */
  options?: string[];
  /**
   * Question number/index
   */
  questionNumber?: number;
  /**
   * Question specification ID from the planner API
   */
  spec_id?: string;
  /**
   * Whether the question is required
   */
  required?: boolean;
  /**
   * Validation rules for the question
   */
  validation?: any;
  /**
   * Skip logic conditions for the question
   */
  skip_logic?: any;
  /**
   * Scale information for scale and emoji_question types
   */
  scale?: {
    min: number;
    max: number;
    labels?: {
      min?: string;
      max?: string;
    };
  };
  /**
   * Whether to show the metadata accordion section (default: false)
   */
  showMetadata?: boolean;
  /**
   * Callback function called when delete button is clicked
   * Only shown if this prop is provided
   */
  onDelete?: () => void;
  /**
   * Whether the delete action is in progress
   */
  isDeleting?: boolean;
}

/**
 * QuestionCard - Displays a survey question with appropriate input component
 * 
 * Handles all question types from the API:
 * - scale: Slider with min/max labels
 * - radio: Radio button group
 * - text_field: Single-line text input
 * - text_area: Multi-line textarea
 * - checkbox: Single checkbox (for agreement/consent)
 * - checkbox_list: Multiple checkboxes (multi-select)
 * - dropdown_list: Select dropdown
 * - star_rating: Interactive star rating component
 * - emoji_question: Emoji buttons with scale
 * - rank: Ranking interface for ordering items
 * - number: Number input
 * - email: Email input
 * 
 * Also supports legacy types for backward compatibility:
 * - rating → star_rating
 * - text → text_area
 * - choice → radio
 * 
 * Optionally displays metadata fields (spec_id, required, validation, skip_logic, scale)
 * in an expandable accordion section below the question input.
 * Use the showMetadata prop to control whether metadata is displayed (default: false).
 */
export function QuestionCard({ 
  question, 
  type, 
  options = [], 
  questionNumber,
  spec_id,
  required,
  validation,
  skip_logic,
  scale,
  showMetadata = false,
  onDelete,
  isDeleting = false
}: QuestionCardProps) {
  // Map legacy types to new types for backward compatibility
  const normalizedType: QuestionType = 
    type === "rating" ? "star_rating" :
    type === "text" ? "text_area" :
    type === "choice" ? "radio" :
    type;

  // State management for different question types
  const [rating, setRating] = useState<number | undefined>();
  const [textValue, setTextValue] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<string>("");
  const [scaleValue, setScaleValue] = useState<number[]>([scale?.min || 1]);
  const [selectedCheckboxes, setSelectedCheckboxes] = useState<string[]>([]);
  const [selectedDropdown, setSelectedDropdown] = useState<string>("");
  const [emojiValue, setEmojiValue] = useState<number | undefined>();
  const [rankedItems, setRankedItems] = useState<string[]>([]);
  const [numberValue, setNumberValue] = useState<string>("");
  const [emailValue, setEmailValue] = useState<string>("");
  const [checkboxValue, setCheckboxValue] = useState<boolean>(false);

  // Extract scale configuration
  const scaleMin = scale?.min ?? 1;
  const scaleMax = scale?.max ?? 5;
  const scaleLabels = scale?.labels ?? {};

  // Get max length from validation
  const maxLength = validation?.max_length;

  // Check if there's any metadata to display and if metadata display is enabled
  const hasMetadata = showMetadata && (spec_id || required !== undefined || validation || skip_logic || scale);

  // Handle checkbox list selection
  const handleCheckboxToggle = (option: string) => {
    setSelectedCheckboxes(prev => 
      prev.includes(option)
        ? prev.filter(item => item !== option)
        : [...prev, option]
    );
  };

  // Handle rank question - simple implementation with buttons
  const handleRankItem = (item: string) => {
    if (!rankedItems.includes(item)) {
      setRankedItems(prev => [...prev, item]);
    } else {
      setRankedItems(prev => prev.filter(i => i !== item));
    }
  };

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
          {required && <span className="text-destructive ml-1">*</span>}
        </h3>
        {/* Delete button - only shown if onDelete callback is provided */}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
            aria-label="Delete question"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {/* Question Input Based on Type */}
      <div className="pl-11">
        {/* Scale Question - Slider with labels */}
        {normalizedType === "scale" && (
          <div className="space-y-3">
            <Slider
              value={scaleValue}
              onValueChange={setScaleValue}
              min={scaleMin}
              max={scaleMax}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{scaleLabels.min || scaleMin}</span>
              <span>{scaleLabels.max || scaleMax}</span>
            </div>
            <div className="text-center text-sm font-medium">
              Selected: {scaleValue[0]}
            </div>
          </div>
        )}

        {/* Radio Question - Radio button group */}
        {normalizedType === "radio" && options.length > 0 && (
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

        {/* Text Field - Single-line text input */}
        {normalizedType === "text_field" && (
          <Input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Type your answer here..."
            maxLength={maxLength}
            required={required}
          />
        )}

        {/* Text Area - Multi-line textarea */}
        {normalizedType === "text_area" && (
          <div className="space-y-2">
            <Textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[100px] resize-none"
              maxLength={maxLength}
              required={required}
            />
            {maxLength && (
              <div className="text-xs text-muted-foreground text-right">
                {textValue.length} / {maxLength} characters
              </div>
            )}
          </div>
        )}

        {/* Checkbox - Single checkbox (for agreement/consent) */}
        {normalizedType === "checkbox" && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="checkbox-single"
              checked={checkboxValue}
              onCheckedChange={(checked) => setCheckboxValue(checked === true)}
            />
            <Label
              htmlFor="checkbox-single"
              className="text-base font-normal cursor-pointer"
            >
              {options[0] || "I agree"}
            </Label>
          </div>
        )}

        {/* Checkbox List - Multiple checkboxes (multi-select) */}
        {normalizedType === "checkbox_list" && options.length > 0 && (
          <div className="space-y-3">
            {options.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <Checkbox
                  id={`checkbox-${idx}`}
                  checked={selectedCheckboxes.includes(option)}
                  onCheckedChange={() => handleCheckboxToggle(option)}
                />
                <Label
                  htmlFor={`checkbox-${idx}`}
                  className="text-base font-normal cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            ))}
          </div>
        )}

        {/* Dropdown List - Select dropdown */}
        {normalizedType === "dropdown_list" && options.length > 0 && (
          <Select value={selectedDropdown} onValueChange={setSelectedDropdown}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option, idx) => (
                <SelectItem key={idx} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Star Rating - Interactive star rating component */}
        {normalizedType === "star_rating" && (
          <StarRating
            value={rating}
            onChange={setRating}
            readOnly={false}
          />
        )}

        {/* Emoji Question - Emoji buttons with scale */}
        {normalizedType === "emoji_question" && (
          <div className="space-y-3">
            <div className="flex gap-4 justify-center">
              {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => {
                const value = scaleMin + i;
                const emoji = value === scaleMin 
                  ? (scaleLabels.min || "😞")
                  : value === scaleMax
                  ? (scaleLabels.max || "😊")
                  : "😐";
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEmojiValue(value)}
                    className={`text-4xl transition-transform hover:scale-110 ${
                      emojiValue === value ? "scale-125" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{scaleLabels.min || scaleMin}</span>
              <span>{scaleLabels.max || scaleMax}</span>
            </div>
          </div>
        )}

        {/* Rank Question - Simple ranking interface */}
        {normalizedType === "rank" && options.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-2">
              {options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRankItem(option)}
                    className={`px-4 py-2 rounded-md border transition-colors ${
                      rankedItems.includes(option)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-accent"
                    }`}
                  >
                    {rankedItems.indexOf(option) !== -1
                      ? `Rank ${rankedItems.indexOf(option) + 1}`
                      : "Select"}
                  </button>
                  <span className="flex-1">{option}</span>
                </div>
              ))}
            </div>
            {rankedItems.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Ranked: {rankedItems.join(" → ")}
              </div>
            )}
          </div>
        )}

        {/* Number Input */}
        {normalizedType === "number" && (
          <Input
            type="number"
            value={numberValue}
            onChange={(e) => setNumberValue(e.target.value)}
            placeholder="Enter a number..."
            required={required}
          />
        )}

        {/* Email Input */}
        {normalizedType === "email" && (
          <Input
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="Enter your email..."
            required={required}
          />
        )}
      </div>

      {/* Expandable Metadata Section */}
      {hasMetadata && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="metadata" className="border-none">
            <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline py-2">
              <span>View Question Metadata</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pl-11 space-y-3 pt-2 border-t border-border">
                {/* Spec ID */}
                {spec_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Spec ID:
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {spec_id}
                    </Badge>
                  </div>
                )}

                {/* Required Status */}
                {required !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Required:
                    </span>
                    <Badge variant={required ? "default" : "secondary"}>
                      {required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                )}

                {/* Scale Information */}
                {scale && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                      Scale:
                    </span>
                    <div className="bg-muted/50 rounded-md p-2 font-mono text-xs">
                      {typeof scale === "object" ? (
                        <pre className="whitespace-pre-wrap">{JSON.stringify(scale, null, 2)}</pre>
                      ) : (
                        <span>{String(scale)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Validation Rules */}
                {validation && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                      Validation:
                    </span>
                    <div className="bg-muted/50 rounded-md p-2 font-mono text-xs">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(validation, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {/* Skip Logic */}
                {skip_logic && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                      Skip Logic:
                    </span>
                    <div className="bg-muted/50 rounded-md p-2 font-mono text-xs">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(skip_logic, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

