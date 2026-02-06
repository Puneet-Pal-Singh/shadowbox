import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarHeader } from "./SidebarHeader";
import { ChangesPanel } from "./ChangesPanel";
import FilesPanel from "./FilesPanel";
import { useGitStatus } from "../../hooks/useGitStatus";

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand: () => void;
  defaultTab?: "changes" | "files";
}

export function RightSidebar({
  isOpen,
  onClose,
  onExpand,
  defaultTab = "changes",
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "files">(defaultTab);
  const { status } = useGitStatus();

  // Reset tab when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  const changesCount = status?.files.length || 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="fixed right-0 top-12 bottom-12 w-full md:w-[320px] lg:w-[400px] z-40 bg-gray-950 border-l border-gray-800 flex flex-col shadow-xl"
          >
            <SidebarHeader
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={onClose}
              onExpand={onExpand}
              changesCount={changesCount}
            />

            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {activeTab === "changes" ? (
                  <motion.div
                    key="changes"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <ChangesPanel />
                  </motion.div>
                ) : (
                  <motion.div
                    key="files"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <FilesPanel />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
