import './services-axs.css';
import '@aqond/components/registry.css';
import { ServicesShell } from '@/components/mobile/ServicesShell';

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axs-services">
      <ServicesShell>{children}</ServicesShell>
    </div>
  );
}
