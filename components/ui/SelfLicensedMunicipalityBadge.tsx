/**
 * Flags a property in one of Prince George's County's self-licensing towns —
 * these get a Municipal Rental License item instead of DPIE (see
 * lib/compliance.ts isPgSelfLicensedMunicipality). Purple, deliberately
 * distinct from every ComplianceStatusBadge color, so it reads as "which
 * licensing path" rather than "what status" at a glance.
 */
export function SelfLicensedMunicipalityBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-purple-500 bg-purple-100 px-2.5 py-0.5 font-display font-bold text-purple-800">
      Self-Licensed Municipality
    </span>
  );
}
