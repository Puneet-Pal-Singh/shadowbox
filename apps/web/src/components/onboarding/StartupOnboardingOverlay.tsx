import { CheckCircle2, Circle, KeyRound, FolderGit2, X } from "lucide-react";
import { motion } from "framer-motion";
import type { ElementType } from "react";

interface StartupOnboardingOverlayProps {
  isRepositoryStepComplete: boolean;
  isProviderStepComplete: boolean;
  onOpenRepositoryPicker: () => void;
  onOpenProviderSetup: () => void;
  onDismiss: () => void;
}

interface StartupStep {
  id: "repository" | "provider";
  title: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  onAction: () => void;
  icon: ElementType;
}

export function StartupOnboardingOverlay({
  isRepositoryStepComplete,
  isProviderStepComplete,
  onOpenRepositoryPicker,
  onOpenProviderSetup,
  onDismiss,
}: StartupOnboardingOverlayProps) {
  const steps: StartupStep[] = [
    {
      id: "repository",
      title: "Connect a repository",
      description: "Select the repo you want this run to work in.",
      complete: isRepositoryStepComplete,
      actionLabel: "Choose repository",
      onAction: onOpenRepositoryPicker,
      icon: FolderGit2,
    },
    {
      id: "provider",
      title: "Add a BYOK provider",
      description: "Connect an API-key provider, then pick a model.",
      complete: isProviderStepComplete,
      actionLabel: "Open provider setup",
      onAction: onOpenProviderSetup,
      icon: KeyRound,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;
  const isCollapsed = completedCount === 1;
  const nextStep = steps.find((step) => !step.complete) ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 pointer-events-none"
    >
      <div className="absolute inset-0 bg-black/35" />
      <motion.section
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-auto absolute right-5 top-5 w-[22rem] rounded-2xl border border-zinc-700/80 bg-[#121316]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              First-Run Setup
            </p>
            <h2 className="mt-1 text-base font-semibold text-white">
              Finish two quick steps
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Complete GitHub repo setup and BYOK provider setup to start your
              first run.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Dismiss onboarding guide"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={`rounded-xl border px-3 py-2 ${
                  step.complete
                    ? "border-emerald-800/70 bg-emerald-950/30"
                    : "border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-zinc-300">
                    {step.complete ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <Circle size={14} className="text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="text-zinc-400" />
                      <p className="text-sm font-medium text-white">
                        {step.title}
                      </p>
                    </div>
                    {!isCollapsed || !step.complete ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        {step.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {nextStep ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={nextStep.onAction}
              className="w-full rounded-lg border border-cyan-700/80 bg-cyan-950/50 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:border-cyan-500 hover:bg-cyan-900/40"
            >
              {nextStep.actionLabel}
            </button>
          </div>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
