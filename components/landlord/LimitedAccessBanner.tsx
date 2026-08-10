/**
 * Shown to landlords in LIMITED ACCESS MODE (access_level = 'limited').
 * Full access is granted only after Christine toggles access_level to 'full'.
 */
export function LimitedAccessBanner() {
  return (
    <div className="mb-6 rounded-xl border-l-4 border-l-warning-yellow bg-warning-yellow/15 px-4 py-4">
      <p className="font-display font-bold text-navy">Limited access</p>
      <p className="text-ink">
        Complete your onboarding call with Christine to unlock full access. Rent
        collection and maintenance submission are disabled until your account is
        activated.
      </p>
      <a
        href="https://survey.rental911.net/onboarding-survey-page"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy hover:bg-gold/90 transition-colors"
      >
        Complete Your Onboarding Survey →
      </a>
    </div>
  );
}
