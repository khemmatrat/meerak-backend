import React, { useEffect, useState } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTalentTutorial } from '../context/TalentTutorialContext';
import type { TalentTourPillar } from '../context/TalentTutorialContext';

interface TalentTourConfig {
  steps: Step[];
  route: string;
}

const TALENT_TOUR_CONFIGS: Record<TalentTourPillar, TalentTourConfig> = {
  cleaning: {
    route: '/profile',
    steps: [
      { target: '[data-tour="talent-online-toggle"]', content: 'เปิดสวิตซ์รับงานเป็นสีเขียวก่อน งานถึงจะเข้ามาครับ (สำคัญมาก!)', disableBeacon: true, placement: 'bottom' },
      { target: 'body', content: 'แม่บ้าน: เปิดหน้า Job Details เพื่อเช็กประเภทที่อยู่อาศัยและอุปกรณ์ที่ต้องเตรียมครับ', placement: 'center' },
      { target: 'body', content: 'QR Check-in: เปิด QR Code ให้ลูกค้าสแกนเพื่อ "เริ่มงาน" — สำคัญต่อประกันครับ!', placement: 'center' },
      { target: 'body', content: 'Earnings Receipt: ดูใบเสร็จสรุปรายได้หลังหักคอมมิชชั่นในหน้า Wallet ครับ', placement: 'center' },
    ],
  },
  party: {
    route: '/profile',
    steps: [
      { target: '[data-tour="talent-online-toggle"]', content: 'เปิดรับงานก่อนนะครับ งานถึงจะเข้ามา!', disableBeacon: true, placement: 'bottom' },
      { target: 'body', content: 'ดินเนอร์/ปาร์ตี้: ดู Vibe ที่ลูกค้าต้องการ และกดปุ่ม ยืนยันรับงาน เพื่อรอรับเงินมัดจำครับ', placement: 'center' },
      { target: 'body', content: 'QR Check-in: เปิด QR Code ให้ลูกค้าสแกนเพื่อ "เริ่มงาน" — สำคัญต่อประกันครับ!', placement: 'center' },
      { target: 'body', content: 'Earnings Receipt: ดูใบเสร็จสรุปรายได้หลังหักคอมมิชชั่นในหน้า Wallet ครับ', placement: 'center' },
    ],
  },
  driver: {
    route: '/profile',
    steps: [
      { target: '[data-tour="talent-online-toggle"]', content: 'เปิดรับงานครับ!', disableBeacon: true, placement: 'bottom' },
      { target: 'body', content: 'ไรเดอร์: ใช้ Start Navigation เพื่อไปหาลูกค้าตามหมุด แล้วกดปุ่ม ถึงที่หมายแล้ว ครับ', placement: 'center' },
      { target: 'body', content: 'QR Check-in: เปิด QR Code ให้ลูกค้าสแกนเพื่อ "เริ่มงาน" — สำคัญต่อประกันครับ!', placement: 'center' },
      { target: 'body', content: 'Earnings Receipt: ดูใบเสร็จสรุปรายได้หลังหักคอมมิชชั่นในหน้า Wallet ครับ', placement: 'center' },
    ],
  },
  technical: {
    route: '/profile',
    steps: [
      { target: '[data-tour="talent-online-toggle"]', content: 'เปิดรับงานครับ!', disableBeacon: true, placement: 'bottom' },
      { target: 'body', content: 'ช่างแอร์: อัปโหลด ผลงาน/ใบเซอร์ เพื่ออัปเกรดโปรไฟล์ให้ดูน่าจ้างครับ', placement: 'center' },
      { target: 'body', content: 'QR Check-in: เปิด QR Code ให้ลูกค้าสแกนเพื่อ "เริ่มงาน" — สำคัญต่อประกันครับ!', placement: 'center' },
      { target: 'body', content: 'Earnings Receipt: ดูใบเสร็จสรุปรายได้หลังหักคอมมิชชั่นในหน้า Wallet ครับ', placement: 'center' },
    ],
  },
  advance_jobs: {
    route: '/job-board',
    steps: [
      { target: 'body', content: 'AdvanceJobs: เลือกงานจากรายการ แล้วกดเข้าไปดูรายละเอียดครับ', placement: 'center', disableBeacon: true },
      { target: 'body', content: 'Place a Bid — กดเข้าไปที่งานใดงานหนึ่ง แล้วกดปุ่มส่งข้อเสนอ วิเคราะห์ Budget ของลูกค้าแล้วเสนอราคาที่ "เราอยู่ได้ ลูกค้าโอเค" เขียนข้อเสนอให้น่าสนใจครับ', placement: 'center' },
      { target: 'body', content: 'หลังรับงาน: ไปที่ My Bookings กด "แสดง QR" ให้ลูกค้าสแกนก่อนเริ่มงาน สแกน QR ก่อนเริ่มงานทุกครั้งนะครับ จะได้ประกันคุ้มครองเต็มที่!', placement: 'center' },
      { target: 'body', content: 'หลังจบงาน: ดู Earnings Receipt ใน My Bookings เพื่อตรวจสอบยอดเงินที่เข้า Wallet ครับ', placement: 'center' },
    ],
  },
  match_job: {
    route: '/profile',
    steps: [
      { target: '[data-tour="talent-online-toggle"]', content: 'เปิดรับงานครับ!', disableBeacon: true, placement: 'bottom' },
      { target: 'body', content: 'Match Job ด่วน: Slide to Accept ภายใน 30 วินาที เพื่อไม่ให้พลาดงานครับ', placement: 'center' },
      { target: 'body', content: 'QR Check-in: เปิด QR Code ให้ลูกค้าสแกนเพื่อ "เริ่มงาน" — สำคัญต่อประกันครับ!', placement: 'center' },
      { target: 'body', content: 'Earnings Receipt: ดูใบเสร็จสรุปรายได้หลังหักคอมมิชชั่นในหน้า Wallet ครับ', placement: 'center' },
    ],
  },
};

export const TalentTourRunner: React.FC = () => {
  const { activeTour, guidedMode, endTour, setStepIndex } = useTalentTutorial();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);

  const config = activeTour ? TALENT_TOUR_CONFIGS[activeTour] : null;
  const currentRoute = location.pathname;
  const isOnCorrectRoute = config && (
    currentRoute === config.route ||
    (config.route === '/provider/dashboard' && (currentRoute === '/provider/dashboard' || currentRoute === '/dashboard/provider'))
  );

  useEffect(() => {
    if (activeTour && config && isOnCorrectRoute) {
      setRun(true);
    } else if (activeTour && config && !isOnCorrectRoute) {
      navigate(config.route, { state: { fromTalentTutorial: true, tourId: activeTour } });
    }
  }, [activeTour, config, isOnCorrectRoute, navigate]);

  const handleCallback = (data: CallBackProps) => {
    const { status, index, action } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      endTour();
    }
    if (action === 'next' || action === 'prev') {
      setStepIndex(index);
    }
  };

  if (!activeTour || !config || !guidedMode) return null;

  return (
    <Joyride
      steps={config.steps}
      run={run && isOnCorrectRoute}
      continuous
      showProgress
      showSkipButton
      spotlightPadding={12}
      callback={handleCallback}
      locale={{
        back: 'ย้อนกลับ',
        close: 'ปิด',
        last: 'เสร็จสิ้น',
        next: 'ถัดไป',
        skip: 'ข้าม',
      }}
      styles={{
        options: {
          primaryColor: '#059669',
          textColor: '#1e293b',
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(0,0,0,0.5)',
          arrowColor: '#ffffff',
          spotlightShadow: '0 0 0 4px rgba(5,150,105,0.4), 0 0 24px rgba(5,150,105,0.3)',
        },
        tooltip: { borderRadius: 16, padding: 20, fontSize: 15 },
        buttonNext: { backgroundColor: '#059669', color: '#ffffff' },
        buttonBack: { color: '#64748b' },
      }}
      floaterProps={{
        styles: { floater: { filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))' } },
      }}
    />
  );
};
