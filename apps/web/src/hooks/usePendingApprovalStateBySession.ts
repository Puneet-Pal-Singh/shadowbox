import { useCallback, useState } from "react";

export function usePendingApprovalStateBySession() {
  const [approvalStatesBySessionId, setApprovalStatesBySessionId] = useState<
    Record<string, boolean>
  >({});

  const handlePendingApprovalStateChange = useCallback(
    (sessionId: string, hasPendingApproval: boolean) => {
      setApprovalStatesBySessionId((current) => {
        if (hasPendingApproval) {
          if (current[sessionId]) {
            return current;
          }
          return { ...current, [sessionId]: true };
        }

        if (!current[sessionId]) {
          return current;
        }

        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    },
    [],
  );

  return {
    approvalStatesBySessionId,
    handlePendingApprovalStateChange,
  };
}
