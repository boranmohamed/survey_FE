import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateSurveyRequest, type UpdateSurveyRequest, type GenerateSurveyRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ============================================
// SURVEY HOOKS
// ============================================

export function useSurveys() {
  return useQuery({
    queryKey: [api.surveys.list.path],
    queryFn: async () => {
      const res = await fetch(api.surveys.list.path);
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return api.surveys.list.responses[200].parse(await res.json());
    },
  });
}

export function useSurvey(id: number | null) {
  return useQuery({
    queryKey: [api.surveys.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("ID required");
      const url = buildUrl(api.surveys.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch survey");
      return api.surveys.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: CreateSurveyRequest) => {
      const res = await fetch(api.surveys.create.path, {
        method: api.surveys.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.surveys.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error('Failed to create survey');
      }
      return api.surveys.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      toast({ title: "Survey Created", description: "Your draft has been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useUpdateSurvey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSurveyRequest) => {
      const url = buildUrl(api.surveys.update.path, { id });
      const res = await fetch(url, {
        method: api.surveys.update.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update survey');
      return api.surveys.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, data.id] });
      toast({ title: "Survey Updated", description: "Changes saved successfully." });
    },
  });
}

// ============================================
// AI GENERATION HOOKS
// ============================================

export function useGenerateSurvey() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: GenerateSurveyRequest) => {
      const res = await fetch(api.ai.generate.path, {
        method: api.ai.generate.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) throw new Error("AI Generation failed");
      return api.ai.generate.responses[200].parse(await res.json());
    },
    onError: (error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    }
  });
}

export function useRephrasePrompt() {
  return useMutation({
    mutationFn: async (data: { prompt: string, language: string }) => {
      const res = await fetch(api.ai.rephrase.path, {
        method: api.ai.rephrase.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Rephrasing failed");
      return api.ai.rephrase.responses[200].parse(await res.json());
    }
  });
}
