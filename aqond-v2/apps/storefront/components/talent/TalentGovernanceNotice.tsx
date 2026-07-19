'use client';

type Tone = 'info' | 'warn' | 'mock';

type Props = {
  message: string;
  tone?: Tone;
  compact?: boolean;
};

export function TalentGovernanceNotice({ message, tone = 'info', compact }: Props) {
  return (
    <p
      className={`tt-talent-governance-notice tt-talent-governance-notice--${tone}${compact ? ' tt-talent-governance-notice--compact' : ''}`}
      role="note"
    >
      {message}
    </p>
  );
}
