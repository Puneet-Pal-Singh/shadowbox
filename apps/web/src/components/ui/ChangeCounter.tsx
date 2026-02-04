import { Plus, Minus } from "lucide-react";

interface ChangeCounterProps {
  added?: number;
  removed?: number;
}

export function ChangeCounter({ added = 0, removed = 0 }: ChangeCounterProps) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-mono">
      <span className="flex items-center gap-1 text-emerald-400">
        <Plus size={12} />
        {added.toLocaleString()}
      </span>
      <span className="flex items-center gap-1 text-red-400">
        <Minus size={12} />
        {removed.toLocaleString()}
      </span>
    </div>
  );
}
