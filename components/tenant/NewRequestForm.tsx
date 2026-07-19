'use client';

import { useState, useTransition } from 'react';
import { createRequest } from '@/app/(tenant)/tenant/maintenance/actions';
import { Field, Input, Textarea, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export function NewRequestForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to the new request; on failure it returns an error.
      const res = await createRequest(formData);
      if (res && !res.ok) setError(res.error || 'Something went wrong.');
    });
  }

  return (
    <form action={onSubmit} className="rounded-2xl border border-light-blue bg-white p-6 shadow-sm">
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      )}
      <Field label="What's the issue?" htmlFor="title">
        <Input id="title" name="title" required placeholder="Kitchen sink is leaking" />
      </Field>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue="plumbing">
            <option value="plumbing">Plumbing</option>
            <option value="electrical">Electrical</option>
            <option value="hvac">HVAC</option>
            <option value="appliance">Appliance</option>
            <option value="structural">Structural</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="emergency">Emergency</option>
          </Select>
        </Field>
      </div>
      <Field label="Describe the problem" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={5}
          placeholder="Include where it is, how long it's been happening, and anything you've tried."
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit request'}
      </Button>
    </form>
  );
}
