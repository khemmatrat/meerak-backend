import React from 'react';
import { TourRunner } from './TourRunner';
import { ChaiAIHelper } from './ChaiAIHelper';
import { useTutorialOptional } from '../context/TutorialContext';

/** Renders TourRunner + ChaiAIHelper only when inside TutorialProvider and in guided mode */
export const TutorialOverlay: React.FC = () => {
  const ctx = useTutorialOptional();
  if (!ctx || !ctx.guidedMode) return null;
  return (
    <>
      <TourRunner />
      <ChaiAIHelper tip={ctx.chaiTip ?? ''} visible={!!ctx.chaiTip} />
    </>
  );
};
