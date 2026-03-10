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
      className="flex h-full flex-col overflow-hidden border-r border-zinc-900 bg-[#0c0c0e]"
      style={{ width }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="font-mono text-sm text-zinc-300">&lt;_</div>
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

      <div className="border-b border-zinc-900 px-2.5 pb-2.5">{utility}</div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5">{children}</div>

      <div className="border-t border-zinc-900 px-2.5 py-2">{footer}</div>
      <div className="border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">{version}</div>
    </aside>
  );
}
