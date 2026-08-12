'use client';

import { useState } from 'react';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export function ExportForm({
  landlordId,
  defaultYear,
}: {
  landlordId: string;
  defaultYear: number;
}) {
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/landlord/financials/export?landlordId=${landlordId}&year=${year}`
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rental911-tax-export-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-4 items-end mt-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-ink">Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="rounded bg-navy px-6 py-2 font-bold text-white disabled:opacity-50"
      >
        {loading ? 'Generating…' : `Download ${year} CSV`}
      </button>
    </div>
  );
}
