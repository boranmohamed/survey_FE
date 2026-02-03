import { LucideIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectionModeCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

export function CollectionModeCard({ 
  icon: Icon, 
  title, 
  description, 
  selected, 
  onClick 
}: CollectionModeCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 group hover:-translate-y-1",
        selected 
          ? "border-primary bg-primary/5 shadow-xl shadow-primary/10" 
          : "border-gray-100 bg-white hover:border-primary/30 hover:shadow-lg"
      )}
    >
      {selected && (
        <div className="absolute top-4 right-4 text-primary animate-in zoom-in duration-200">
          <CheckCircle2 className="w-6 h-6 fill-current" />
        </div>
      )}
      
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
        selected ? "bg-primary text-white" : "bg-gray-100 text-gray-500 group-hover:bg-primary/10 group-hover:text-primary"
      )}>
        <Icon className="w-6 h-6" />
      </div>
      
      <h3 className={cn(
        "text-lg font-bold mb-2",
        selected ? "text-primary" : "text-foreground"
      )}>
        {title}
      </h3>
      
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
