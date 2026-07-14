import './merchant-axs.css';
import { MerchantShell } from '@/components/mobile/MerchantShell';

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axs-merchant">
      <MerchantShell>{children}</MerchantShell>
    </div>
  );
}
