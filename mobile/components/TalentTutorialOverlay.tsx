import React from 'react';
import { TalentTourRunner } from './TalentTourRunner';
import { ChaiAIHelper } from './ChaiAIHelper';
import { useTalentTutorialOptional } from '../context/TalentTutorialContext';

/** Renders TalentTourRunner + ChaiAIHelper when in Talent guided mode */
export const TalentTutorialOverlay: React.FC = () => {
  const ctx = useTalentTutorialOptional();
  if (!ctx || !ctx.guidedMode) return null;
  return (
    <>
      <TalentTourRunner />
      <ChaiAIHelper tip={ctx.chaiTip ?? ''} visible={!!ctx.chaiTip} />
    </>
  );
};
