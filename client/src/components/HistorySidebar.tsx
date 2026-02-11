import { ChevronRight, Clock, MoreVertical, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useSurveys } from "@/hooks/use-surveys";

interface HistorySidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function HistorySidebar({ isOpen, onToggle }: HistorySidebarProps) {
  const { data: surveys } = useSurveys();

  return (
    <div 
      className={cn(
        "fixed right-0 top-0 h-full bg-white border-l border-border shadow-2xl transition-all duration-300 z-50 flex flex-col",
        isOpen ? "w-80" : "w-12"
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -left-3 top-20 bg-white border border-border rounded-full p-1 shadow-md hover:text-primary"
      >
        <ChevronRight className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-0" : "rotate-180")} />
      </button>

      {/* Header */}
      <div className={cn(
        "p-6 border-b border-border flex items-center justify-between",
        !isOpen && "hidden"
      )}>
        <h3 className="font-display font-bold text-lg text-secondary flex items-center gap-2">
          <Clock className="w-5 h-5" /> Survey History
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isOpen ? (
          <div className="p-4 space-y-3">
            {surveys?.map((survey) => (
              <div 
                key={survey.id}
                className="group p-4 rounded-xl border border-transparent hover:border-border hover:bg-gray-50 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                    V{survey.id}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
                <h4 className="font-semibold text-foreground mb-1 line-clamp-2">{survey.name}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {survey.createdAt ? format(new Date(survey.createdAt), 'MMM d, h:mm a') : 'Unknown'}
                </div>
              </div>
            ))}
            
            {(!surveys || surveys.length === 0) && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No history yet
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center gap-4">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div className="w-8 h-[1px] bg-border" />
            {surveys?.slice(0, 5).map(s => (
              <div key={s.id} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-muted-foreground hover:bg-primary hover:text-white cursor-pointer transition-colors" title={s.name}>
                {s.id}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
