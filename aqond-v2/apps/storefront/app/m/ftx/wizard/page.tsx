import { Suspense } from 'react';
import { FtxSmartEntryWizard } from '@/components/experience/FtxSmartEntryWizard';

export default function FtxWizardPage() {
  return (
    <Suspense fallback={<div className="ftx-wizard-page ftx-wizard-loading">กำลังโหลด…</div>}>
      <FtxSmartEntryWizard />
    </Suspense>
  );
}
