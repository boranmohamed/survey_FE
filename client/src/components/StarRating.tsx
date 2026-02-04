import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  /**
   * Current selected rating (1-5)
   * If undefined, component is in display-only mode
   */
  value?: number;
  /**
   * Callback when rating is selected
   */
  onChange?: (rating: number) => void;
  /**
   * If true, component is read-only
   */
  readOnly?: boolean;
}

/**
 * StarRating - Interactive star rating component
 * 
 * Displays 5 rows of 5 stars each, where each row represents a rating level.
 * Users can click on a row to select that rating.
 * Stars are orange when filled, gray when empty.
 */
export function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const handleRowClick = (rating: number) => {
    if (!readOnly && onChange) {
      onChange(rating);
    }
  };

  const handleRowHover = (rating: number | null) => {
    if (!readOnly) {
      setHoveredRow(rating);
    }
  };

  return (
    <div className="space-y-2">
      {[5, 4, 3, 2, 1].map((rating) => {
        const isSelected = value === rating;
        const isHovered = hoveredRow === rating;
        const shouldHighlight = isSelected || isHovered;

        return (
          <div
            key={rating}
            onClick={() => handleRowClick(rating)}
            onMouseEnter={() => handleRowHover(rating)}
            onMouseLeave={() => handleRowHover(null)}
            className={cn(
              "flex gap-1 cursor-pointer transition-opacity",
              readOnly && "cursor-default",
              shouldHighlight && !readOnly && "opacity-100",
              !shouldHighlight && !readOnly && "opacity-70 hover:opacity-100"
            )}
          >
            {[1, 2, 3, 4, 5].map((star) => {
              // Each row represents a rating level visually
              // Row 1 (rating 5): all 5 stars filled
              // Row 2 (rating 4): all 5 stars filled  
              // Row 3 (rating 3): all 5 stars filled
              // Row 4 (rating 2): 3 stars filled, 2 empty
              // Row 5 (rating 1): 1 star filled, 4 empty
              let shouldFill = false;
              if (rating === 5) shouldFill = true; // All 5 stars
              else if (rating === 4) shouldFill = true; // All 5 stars
              else if (rating === 3) shouldFill = true; // All 5 stars
              else if (rating === 2) shouldFill = star <= 3; // First 3 stars
              else if (rating === 1) shouldFill = star === 1; // First star only
              
              return (
                <Star
                  key={star}
                  className={cn(
                    "w-5 h-5 transition-colors",
                    shouldFill
                      ? "fill-orange-500 text-orange-500"
                      : "fill-gray-200 text-gray-300"
                  )}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

