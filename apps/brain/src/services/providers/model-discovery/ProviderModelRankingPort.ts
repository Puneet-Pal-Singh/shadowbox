import type {
  ProviderModelRankingInput,
  ProviderModelRankingResult,
} from "./types";

export interface ProviderModelRankingPort {
  computePopular(input: ProviderModelRankingInput): Promise<ProviderModelRankingResult>;
}
