import { Link } from "wouter";
import { ArrowRight, Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full text-center space-y-8">
        <h1 className="text-5xl font-display font-bold text-secondary tracking-tight">
          Al-Khwarizmi Survey Platform
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Create powerful, AI-driven surveys in minutes. Designed for enterprise data collection.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-6 mt-12">
          <Link href="/config">
            <Button className="btn-primary h-auto py-4 px-8 text-lg group">
              <Plus className="w-5 h-5 mr-2" /> Create New Survey
              <ArrowRight className="ml-2 w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </Button>
          </Link>
          
          <Button variant="outline" className="btn-secondary h-auto py-4 px-8 text-lg">
            <FolderOpen className="w-5 h-5 mr-2" /> View Dashboard
          </Button>
        </div>

        {/* Decorative Image */}
        <div className="mt-16 relative rounded-xl overflow-hidden shadow-2xl border-4 border-white">
          {/* Using unspash image relevant to data/charts */}
          {/* dashboard analytics charts data visualization */}
          <img 
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop" 
            alt="Dashboard Preview" 
            className="w-full h-64 object-cover object-center opacity-90 hover:opacity-100 transition-opacity duration-700 hover:scale-105 transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 to-transparent flex items-end justify-center pb-8">
            <span className="text-white font-medium tracking-widest uppercase text-sm">
              Enterprise Grade Analytics
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
