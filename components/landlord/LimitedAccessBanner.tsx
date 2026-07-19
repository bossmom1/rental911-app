/**
 * Shown to landlords in LIMITED ACCESS MODE (access_level = 'limited').
 * Full access is granted only after Christine toggles access_level to 'full'.
 */
export function LimitedAccessBanner() {
  return (
    <div className="mb-6 rounded-xl border-l-4 border-l-warning-yellow bg-warning-yellow/15 px-4 py-3">
      <p className="font-display font-bold text-navy">Limited access</p>
      <p className="text-ink">
        Complete your onboarding call with Christine to unlock full access. Rent
        collection and maintenance submission are disabled until your account is
        activated.
      </p>
    </div>
  );
}
