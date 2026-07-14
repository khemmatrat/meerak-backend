'use client';

import { EmptyState } from '@aqond/ui';

type Props = {
  icon: string;
  title: string;
  description: string;
  sprint: string;
};

export function ServicesModulePlaceholder({ icon, title, description, sprint }: Props) {
  return (
    <div className="tt-services-module-placeholder">
      <EmptyState
        icon={icon}
        title={title}
        description={`${description} — กำลังย้าย Theme V2 (Sprint ${sprint})`}
      />
      <p className="tt-hint" style={{ textAlign: 'center', marginTop: 12 }}>
        Business logic ยังอยู่ที่ mobile · storefront จะ shadow-wrap ใน sprint ถัดไป
      </p>
    </div>
  );
}
