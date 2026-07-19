import './talent-axs.css';
import '@aqond/components/registry.css';
import { TalentWorkspaceRoot } from '@/components/talent/TalentWorkspaceRoot';

export default function TalentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axs-talent">
      <TalentWorkspaceRoot>{children}</TalentWorkspaceRoot>
    </div>
  );
}
