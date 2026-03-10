import { motion } from "framer-motion";
import { PanelLeftClose } from "lucide-react";

interface SidebarShellProps {
  width?: number;
  utility: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  version?: string;
}

export function SidebarShell({
  width = 240,
  utility,
  children,
  footer,
  onClose,
  version = "v1.0.0",
}: SidebarShellProps) {
  return (
    <aside
      className="flex h-full flex-col overflow-hidden border-r border-[#1a1a1a] bg-[#0c0c0e]"
      style={{ width }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-mono text-sm text-zinc-300">&gt;_</div>
        {onClose ? (
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
            title="Close sidebar"
          >
            <PanelLeftClose size={16} />
          </motion.button>
        ) : null}
      </div>

      <div className="border-b border-[#1a1a1a] px-4 pb-3">{utility}</div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>

      {footer ? <div className="border-t border-[#1a1a1a] px-4 py-2">{footer}</div> : null}
      <div className="border-t border-[#1a1a1a] px-4 py-2 text-[10px] text-zinc-600">{version}</div>
    </aside>
  );
}
