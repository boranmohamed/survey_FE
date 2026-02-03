import { Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";

interface CounterInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  label: string;
}

export function CounterInput({ value, onChange, min = 0, max = 100, label }: CounterInputProps) {
  const handleDecrement = () => {
    if (value > min) onChange(value - 1);
  };

  const handleIncrement = () => {
    if (value < max) onChange(value + 1);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
      <div className="text-sm font-medium text-muted-foreground mb-3 text-center uppercase tracking-wider">
        {label}
      </div>
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={value <= min}
          className="h-10 w-10 rounded-full border-2 hover:border-primary hover:text-primary"
        >
          <Minus className="w-4 h-4" />
        </Button>
        
        <div className="flex-1 text-center">
          <span className="text-3xl font-bold text-foreground font-display tabular-nums">
            {value}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={value >= max}
          className="h-10 w-10 rounded-full border-2 hover:border-primary hover:text-primary"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
