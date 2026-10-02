import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ReportSheet, type ReportSubject } from '../components/feed/ReportSheet';

const ReportFlowContext = createContext<((subject: ReportSubject) => void) | null>(null);

/** Mounted above virtualized rows and keyed by the signed-in member at the app boundary. */
export function ReportFlowProvider({ children }: { children: React.ReactNode }) {
  const [subject, setSubject] = useState<ReportSubject | null>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const openReport = useCallback((next: ReportSubject) => {
    if (visibleRef.current) return;
    visibleRef.current = true;
    setSubject(next);
    setVisible(true);
  }, []);
  const closeReport = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
  }, []);
  return (
    <ReportFlowContext.Provider value={openReport}>
      {children}
      {subject ? <ReportSheet {...subject} visible={visible} onClose={closeReport} /> : null}
    </ReportFlowContext.Provider>
  );
}

export function useReportFlow() {
  const open = useContext(ReportFlowContext);
  if (!open) throw new Error('ReportFlowProvider is required');
  return open;
}
