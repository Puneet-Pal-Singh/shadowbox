import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface UpgradeButtonProps {
  onClick?: () => void;
}

export function UpgradeButton({ onClick }: UpgradeButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 transition-all duration-300 shadow-lg shadow-purple-900/20 overflow-hidden group"
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <Sparkles size={14} className="text-purple-200 relative z-10" />
      <span className="relative z-10">Get Plus</span>
    </motion.button>
  );
}
