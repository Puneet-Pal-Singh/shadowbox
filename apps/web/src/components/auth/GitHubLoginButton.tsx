import { motion } from "framer-motion";
import { Github } from "lucide-react";

interface GitHubLoginButtonProps {
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
}

export function GitHubLoginButton({
  onClick,
  size = "md",
  variant = "primary",
}: GitHubLoginButtonProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variantClasses = {
    primary: "bg-white text-black hover:bg-zinc-200",
    secondary:
      "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700",
    ghost: "bg-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50",
  };

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        flex items-center gap-2 rounded-lg font-medium
        transition-colors duration-200
        ${sizeClasses[size]}
        ${variantClasses[variant]}
      `}
    >
      <Github size={size === "sm" ? 14 : size === "md" ? 16 : 20} />
      <span>Connect GitHub</span>
    </motion.button>
  );
}
