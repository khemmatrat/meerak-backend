import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type TalentTourPillar =
  | 'cleaning'
  | 'party'
  | 'driver'
  | 'technical'
  | 'advance_jobs'
  | 'match_job';

interface TalentTutorialContextType {
  activeTour: TalentTourPillar | null;
  guidedMode: boolean;
  currentStepIndex: number;
  chaiTip: string | null;
  startTour: (tour: TalentTourPillar) => void;
  endTour: () => void;
  setChaiTip: (tip: string | null) => void;
  setStepIndex: (index: number) => void;
}

const TalentTutorialContext = createContext<TalentTutorialContextType | undefined>(undefined);

const TALENT_CHAI_TIPS: Record<TalentTourPillar, string[]> = {
  cleaning: [
    'เปิดหน้า Job Details เพื่อเช็กประเภทที่อยู่อาศัยและอุปกรณ์ที่ต้องเตรียมครับ',
    'ทำ Task Checklist ให้ครบก่อนจบงานครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
  party: [
    'ดู Vibe ที่ลูกค้าต้องการ แล้วกดปุ่ม ยืนยันรับงาน เพื่อรอรับเงินมัดจำครับ',
    'เช็ก Location & Dress Code เพื่อแต่งตัวให้ถูกกาลเทศะครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
  driver: [
    'ใช้ Start Navigation เพื่อไปหาลูกค้าตามหมุดครับ',
    'กดปุ่ม ถึงที่หมายแล้ว เมื่อถึงปลายทางครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
  technical: [
    'อัปโหลด ผลงาน/ใบเซอร์ เพื่ออัปเกรดโปรไฟล์ให้ดูน่าจ้างครับ',
    'ถ่ายรูป Before/After เก็บไว้ในแชทเพื่อป้องกันการเคลมครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
  advance_jobs: [
    'Place a Bid — เสนอราคาที่คุ้มค่าแข่งกับคนอื่นครับ',
    'เขียนข้อเสนอให้น่าสนใจครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
  match_job: [
    'Slide to Accept ภายใน 30 วินาที เพื่อไม่ให้พลาดงานครับ',
    'Standby หน้าจอรอเสียงแจ้งเตือน แล้วกดรับให้ไวที่สุดครับ',
    'สแกน QR ก่อนเริ่มงานเสมอนะครับเจ้านาย จะได้ได้รับเงินและประกันคุ้มครองเต็มที่!',
  ],
};

export const TalentTutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTour, setActiveTour] = useState<TalentTourPillar | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [chaiTip, setChaiTip] = useState<string | null>(null);

  const startTour = useCallback((tour: TalentTourPillar) => {
    setActiveTour(tour);
    setGuidedMode(true);
    setCurrentStepIndex(0);
    const tips = TALENT_CHAI_TIPS[tour];
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
      const tips = TALENT_CHAI_TIPS[activeTour];
      setChaiTip(tips?.[index] ?? null);
    }
  }, [activeTour]);

  return (
    <TalentTutorialContext.Provider
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
    </TalentTutorialContext.Provider>
  );
};

export const useTalentTutorial = (): TalentTutorialContextType => {
  const ctx = useContext(TalentTutorialContext);
  if (!ctx) {
    throw new Error('useTalentTutorial must be used within TalentTutorialProvider');
  }
  return ctx;
};

export const useTalentTutorialOptional = (): TalentTutorialContextType | undefined => {
  return useContext(TalentTutorialContext) ?? undefined;
};
