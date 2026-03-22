import { z } from "zod";

export const RunModeSchema = z.enum(["build", "plan"]);

export type RunMode = z.infer<typeof RunModeSchema>;

export const DEFAULT_RUN_MODE: RunMode = "build";
