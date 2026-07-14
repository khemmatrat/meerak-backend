import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TourPillar = 
  | 'cleaning'      // จ้างแม่บ้าน - Blue
  | 'party'         // ดินเนอร์หรู/ปาร์ตี้ - Purple
  | 'driver'        // ไรเดอร์รับส่ง - Green
  | 'technical'     // ช่างล้างแอร์ - Gray
  | 'advance_jobs'  // AdvanceJobs JobBoard
  | 'match_job';    // Match Job ด่วน

export interface TutorialState {
  activeTour: TourPillar | null;
  guidedMode: boolean;
  currentStepIndex: number;
}

interface TutorialContextType {
  activeTour: TourPillar | null;
  guidedMode: boolean;
  currentStepIndex: number;
  chaiTip: string | null;
  startTour: (tour: TourPillar) => void;
  endTour: () => void;
  setChaiTip: (tip: string | null) => void;
  setStepIndex: (index: number) => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const CHAI_TIPS: Record<TourPillar, string[]> = {
  cleaning: [
    'กดตรงนี้เพื่อเลือกแม่บ้านที่ผ่านการตรวจประวัติครับเจ้านาย!',
    'เลือกรายการที่ต้องการให้แม่บ้านทำ แล้วกดต่อไป',
    'กดสร้างงานเพื่อยืนยันครับ',
  ],
  party: [
    'เลือก Vibe ของงานปาร์ตี้ของคุณเลยครับ',
    'เลือกวันและเวลาที่ต้องการ',
    'ชำระเงินมัดจำเพื่อจองครับ',
  ],
  driver: [
    'ใส่ปลายทางบนแผนที่ครับ',
    'เลือกประเภทยานพาหนะ แล้วกด Request ครับ',
  ],
  technical: [
    'ตรวจสอบใบรับรองช่างครับ',
    'เลือกรายการวินิจฉัยปัญหา',
    'ราคาคงที่ - ชำระได้เลยครับ',
  ],
  advance_jobs: [
    'โพสต์งานของคุณบน Job Board ครับ',
    'รอ Talent ส่ง Price Bidding มา',
    'เลือกผู้รับงานที่เหมาะสมครับ',
  ],
  match_job: [
    'กดปุ่ม Match ด่วนเลยครับ!',
    'ระบบกำลังค้นหาคนรับงานให้คุณ...',
    'กดยอมรับเมื่อพบแมทช์ครับ',
  ],
};

export const TutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTour, setActiveTour] = useState<TourPillar | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [chaiTip, setChaiTip] = useState<string | null>(null);

  const startTour = useCallback((tour: TourPillar) => {
    setActiveTour(tour);
    setGuidedMode(true);
    setCurrentStepIndex(0);
    const tips = CHAI_TIPS[tour];
    setChaiTip(tips?.[0] ?? null);
  }, []);

  const endTour = useCallback(() => {
    setActiveTour(null);
    setGuidedMode(false);
    setCurrentStepIndex(0);
    setChaiTip(null);
  }, []);

  const setStepIndex = useCallback((index: number) => {
    setCurrentStepIndex(index);
    if (activeTour) {
      const tips = CHAI_TIPS[activeTour];
      setChaiTip(tips?.[index] ?? null);
    }
  }, [activeTour]);

  return (
    <TutorialContext.Provider
      value={{
        activeTour,
        guidedMode,
        currentStepIndex,
        chaiTip,
        startTour,
        endTour,
        setChaiTip,
        setStepIndex,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = (): TutorialContextType => {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return ctx;
};

export const useTutorialOptional = (): TutorialContextType | undefined => {
  return useContext(TutorialContext) ?? undefined;
};
