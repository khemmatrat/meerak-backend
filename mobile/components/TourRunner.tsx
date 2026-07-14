import React, { useEffect, useState } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTutorial } from '../context/TutorialContext';
import type { TourPillar } from '../context/TutorialContext';

interface TourConfig {
  steps: Step[];
  route: string;
}

const TOUR_CONFIGS: Record<TourPillar, TourConfig> = {
  cleaning: {
    route: '/',
    steps: [
      {
        target: '[data-tour="cleaning-card"]',
        content: 'นี่คือบริการจ้างแม่บ้านครับ เจ้านายกดการ์ดนี้เพื่อเข้าไปเลือกแม่บ้านที่ผ่านการตรวจประวัติ',
        disableBeacon: true,
        placement: 'bottom',
      },
      {
        target: '[data-tour="cleaning-cta"]',
        content: 'กดตรงนี้เพื่อเลือกรายการและสร้างงานครับ',
        placement: 'top',
      },
    ],
  },
  party: {
    route: '/party-vibe',
    steps: [
      {
        target: '[data-tour="party-vibe-selector"]',
        content: 'เลือก Vibe ของงานปาร์ตี้ที่ต้องการครับ',
        disableBeacon: true,
        placement: 'bottom',
      },
      {
        target: '[data-tour="party-slot-booking"]',
        content: 'เลือกวันและเวลาที่ต้องการจองครับ',
        placement: 'top',
      },
    ],
  },
  driver: {
    route: '/transport',
    steps: [
      {
        target: '[data-tour="driver-map"]',
        content: 'ใส่ปลายทางบนแผนที่หรือค้นหาครับ',
        disableBeacon: true,
        placement: 'bottom',
      },
      {
        target: '[data-tour="driver-vehicle"]',
        content: 'เลือกประเภทยานพาหนะ แล้วกด Request เพื่อเรียกไรเดอร์ครับ',
        placement: 'top',
      },
    ],
  },
  technical: {
    route: '/',
    steps: [
      {
        target: '[data-tour="technical-card"]',
        content: 'นี่คือบริการช่างล้างแอร์ มีใบรับรอง Verified ครับ',
        disableBeacon: true,
        placement: 'bottom',
      },
      {
        target: '[data-tour="technical-cta"]',
        content: 'กดเพื่อเช็คใบรับรองและเลือกรายการวินิจฉัยครับ',
        placement: 'top',
      },
    ],
  },
  advance_jobs: {
    route: '/job-board',
    steps: [
      {
        target: '[data-tour="job-board-post"]',
        content: 'โพสต์งานของคุณที่นี่ รอ Talent ส่ง Price Bidding มา',
        disableBeacon: true,
        placement: 'bottom',
      },
      {
        target: '[data-tour="job-board-select"]',
        content: 'เลือกผู้รับงานที่เหมาะสมจากรายการครับ',
        placement: 'top',
      },
    ],
  },
  match_job: {
    route: '/',
    steps: [
      {
        target: '[data-tour="match-button"]',
        content: 'กดปุ่ม Match ด่วน! ระบบจะค้นหาคนรับงานให้คุณทันที',
        disableBeacon: true,
        placement: 'bottom',
      },
    ],
  },
};

export const TourRunner: React.FC = () => {
  const { activeTour, guidedMode, endTour, setStepIndex } = useTutorial();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);

  const config = activeTour ? TOUR_CONFIGS[activeTour] : null;
  const currentRoute = location.pathname;
  const isOnCorrectRoute = config && (currentRoute === config.route || (config.route === '/' && currentRoute === '/'));

  useEffect(() => {
    if (activeTour && config && isOnCorrectRoute) {
      setRun(true);
    } else if (activeTour && config && !isOnCorrectRoute) {
      navigate(config.route, { state: { fromTutorial: true, tourId: activeTour } });
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
          primaryColor: '#D4AF37',
          textColor: '#1e293b',
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(0,0,0,0.5)',
          arrowColor: '#ffffff',
          spotlightShadow: '0 0 0 4px rgba(212,175,55,0.4), 0 0 24px rgba(212,175,55,0.3)',
        },
        tooltip: {
          borderRadius: 16,
          padding: 20,
          fontSize: 15,
        },
        buttonNext: {
          backgroundColor: '#D4AF37',
          color: '#0c0d0f',
        },
        buttonBack: {
          color: '#64748b',
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))',
          },
        },
      }}
    />
  );
};
