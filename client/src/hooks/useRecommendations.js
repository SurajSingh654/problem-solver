import { useQuery } from "@tanstack/react-query";
import { recommendationsApi } from "@services/recommendations.api.js";

export function useRecommendations() {
  return useQuery({
    queryKey: ["recommendations"],
    queryFn: async () => {
      const res = await recommendationsApi.get();
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
