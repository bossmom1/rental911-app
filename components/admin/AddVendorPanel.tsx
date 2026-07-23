'use client';

import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { VendorForm } from '@/components/admin/VendorForm';

export function AddVendorPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mb-6">
        <Button type="button" variant="gold" onClick={() => setOpen(true)}>
          + Add Vendor
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Add a vendor" />
      <VendorForm onDone={() => setOpen(false)} />
    </Card>
  );
}
