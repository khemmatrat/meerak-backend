import './talent-axs.css';
import '@aqond/components/registry.css';
import { TalentShell } from '@/components/talent/TalentShell';

export default function TalentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axs-talent">
      <TalentShell>{children}</TalentShell>
    </div>
  );
}
