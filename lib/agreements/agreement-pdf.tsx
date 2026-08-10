// lib/agreements/agreement-pdf.tsx
// Server-side PDF generation using @react-pdf/renderer v4
// renderAgreementPdf({ tier, clientName, date, flatFee? }) → Promise<Buffer>
//
// Signature page detection: agreement-sender.ts reads the total page count from
// the rendered buffer so SIG_PAGE is always correct even if content overflows.
// The signature block is always the LAST explicit <Page> in each Document.
//
// Tiers handled:
//   'standard'       → Standard Investor Agreement
//   'portfolio'      → Portfolio Investor Agreement
//   'placement_only' → Placement Only Agreement
//   'consulting'     → Landlord Consulting Agreement (à la carte)

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

// ─── Constants ────────────────────────────────────────────────────────────────
const NAVY = '#1A3A6B';
const GOLD = '#C9A84C';
const BLUE = '#1A5BA6';
const DARK = '#222222';
const BODY = '#333333';
const MID  = '#555555';
const LITE = '#888888';

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    paddingBottom: 50,
    color: DARK,
  },

  // ── Investor-style header (navy bar) ──────────────────────────────────────
  headerBar: {
    backgroundColor: NAVY,
    paddingVertical: 13,
    paddingHorizontal: 50,
  },
  headerBrand: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  headerAccent: { color: '#F5A623' },
  headerSub: {
    fontSize: 8.5,
    color: '#c8d8f0',
    marginTop: 2,
  },
  goldRule: { height: 3, backgroundColor: GOLD },
  blueRule: { height: 1, backgroundColor: BLUE, marginBottom: 14 },

  // ── Consulting-style header (centered, no navy bar) ───────────────────────
  consultingHeaderWrapper: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 6,
    paddingHorizontal: 50,
  },
  consultingBrand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    textAlign: 'center',
  },
  consultingBrandAccent: { color: '#F5A623' },
  consultingTagline: {
    fontSize: 9,
    color: MID,
    textAlign: 'center',
    fontFamily: 'Helvetica-Oblique',
    marginTop: 2,
    marginBottom: 8,
  },
  consultingUrl: {
    fontSize: 8.5,
    color: LITE,
    textAlign: 'center',
    marginBottom: 10,
  },
  hrThin: { borderTopWidth: 0.75, borderTopColor: '#aaaaaa', marginHorizontal: 50, marginBottom: 14 },

  // ── Shared inner padding ──────────────────────────────────────────────────
  inner: { paddingHorizontal: 50 },

  // ── Title block (centered) ────────────────────────────────────────────────
  titleBlock: { alignItems: 'center', marginBottom: 14 },
  docTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 3,
  },
  docSubtitle: {
    fontSize: 9.5,
    color: BLUE,
    textAlign: 'center',
    marginBottom: 3,
  },
  dateLine: {
    fontSize: 9,
    color: MID,
    textAlign: 'center',
  },

  // ── Parties block ─────────────────────────────────────────────────────────
  partiesBlock: { flexDirection: 'row', marginBottom: 12, gap: 16 },
  partyBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#cccccc',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#fafafa',
  },
  partyLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  partyName:   { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DARK },
  partyDetail: { fontSize: 8.5, color: MID },

  // ── Customer info table (consulting) ──────────────────────────────────────
  infoTable: { marginBottom: 10 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#dddddd', paddingVertical: 4 },
  infoLabel: { width: 140, fontSize: 9, color: MID, fontFamily: 'Helvetica-Bold' },
  infoValue: { flex: 1, fontSize: 9, color: DARK },

  // ── Section headers ───────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    marginTop: 11,
    marginBottom: 3,
  },
  // Consulting uses underlined bold headers (no color)
  sectionHeaderUnderline: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    textDecoration: 'underline',
    marginTop: 11,
    marginBottom: 3,
  },

  // ── Body text ─────────────────────────────────────────────────────────────
  body: { fontSize: 9.5, lineHeight: 1.55, color: BODY, marginBottom: 4 },

  // ── Fee table (investor agreements) ──────────────────────────────────────
  table: { marginBottom: 8, borderWidth: 0.5, borderColor: '#cccccc' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: NAVY },
  tableRow:       { flexDirection: 'row' },
  tableRowAlt:    { flexDirection: 'row', backgroundColor: '#f2f6fb' },
  thCell: {
    flex: 1, paddingVertical: 5, paddingHorizontal: 6,
    fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF',
    borderRightWidth: 0.5, borderRightColor: '#3a5f8a',
  },
  thCellLast: {
    flex: 1, paddingVertical: 5, paddingHorizontal: 6,
    fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF',
  },
  tdCell: {
    flex: 1, paddingVertical: 5, paddingHorizontal: 6,
    fontSize: 9, color: BODY,
    borderRightWidth: 0.5, borderRightColor: '#dddddd',
    borderBottomWidth: 0.5, borderBottomColor: '#dddddd',
  },
  tdCellLast: {
    flex: 1, paddingVertical: 5, paddingHorizontal: 6,
    fontSize: 9, color: BODY,
    borderBottomWidth: 0.5, borderBottomColor: '#dddddd',
  },

  // ── Consulting service checkboxes ─────────────────────────────────────────
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  checkbox: {
    width: 12, height: 12, borderWidth: 0.75, borderColor: '#555',
    marginRight: 8, marginTop: 1, borderRadius: 1,
  },
  serviceText: { flex: 1, fontSize: 9.5, color: BODY, lineHeight: 1.4 },
  initialsBox: {
    width: 40, height: 14, borderBottomWidth: 0.75, borderBottomColor: '#555',
    marginLeft: 8, alignSelf: 'flex-end',
  },
  initialsLabel: { fontSize: 7, color: LITE, textAlign: 'center' },

  // ── Fee box (consulting) ──────────────────────────────────────────────────
  feeBox: {
    borderWidth: 0.75, borderColor: BLUE, borderRadius: 4,
    padding: 10, marginVertical: 8, backgroundColor: '#EBF3FF',
  },
  feeBoxLabel: { fontSize: 8.5, color: BLUE, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  feeBoxAmount: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY },
  feeBoxNote: { fontSize: 8, color: MID, marginTop: 2 },

  // ── Signature block ───────────────────────────────────────────────────────
  sigDivider: { borderTopWidth: 1, borderTopColor: GOLD, marginBottom: 10 },
  sigTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 12 },
  sigGrid: { flexDirection: 'row', gap: 24, marginBottom: 18 },
  sigCol: { flex: 1 },
  sigLineBox: {
    height: 28, justifyContent: 'flex-end',
    borderBottomWidth: 1, borderBottomColor: '#333333', marginBottom: 3,
  },
  sigLabel: { fontSize: 8, color: MID },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 16, left: 50, right: 50,
    borderTopWidth: 0.5, borderTopColor: '#dddddd', paddingTop: 4,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#aaaaaa' },
});

// ─── Shared sub-components ────────────────────────────────────────────────────

function InvestorHeader({ subtitle }: { subtitle: string }) {
  return (
    <>
      <View style={S.headerBar}>
        <Text style={S.headerBrand}>
          Rental<Text style={S.headerAccent}>911</Text>
        </Text>
        <Text style={S.headerSub}>{subtitle}</Text>
      </View>
      <View style={S.goldRule} />
      <View style={S.blueRule} />
    </>
  );
}

function ConsultingHeader() {
  return (
    <>
      <View style={S.consultingHeaderWrapper}>
        <Text style={S.consultingBrand}>
          Rental<Text style={S.consultingBrandAccent}>911</Text>
        </Text>
        <Text style={S.consultingTagline}>Landlord Rescue® | Expert Property Consulting</Text>
        <Text style={S.consultingUrl}>rental911.net</Text>
      </View>
      <View style={S.hrThin} />
    </>
  );
}

function PageFooter({ label }: { label: string }) {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>{label}</Text>
      <Text
        style={S.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={S.body}>{children}</Text>;
}

function Parties({ clientName, clientRole }: { clientName: string; clientRole: string }) {
  return (
    <View style={S.partiesBlock}>
      <View style={S.partyBox}>
        <Text style={S.partyLabel}>Service Provider</Text>
        <Text style={S.partyName}>Rental911</Text>
        <Text style={S.partyDetail}>A DBA of Pollard Property Group</Text>
        <Text style={S.partyDetail}>rental911.net · Licensed MD Realtor</Text>
        <Text style={S.partyDetail}>Christine Pollard, Samson Properties</Text>
      </View>
      <View style={S.partyBox}>
        <Text style={S.partyLabel}>{clientRole}</Text>
        <Text style={S.partyName}>{clientName}</Text>
        <Text style={S.partyDetail}>(the "Client")</Text>
      </View>
    </View>
  );
}

function FeeTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <View style={S.table}>
      <View style={S.tableHeaderRow}>
        <Text style={S.thCell}>Service</Text>
        <Text style={S.thCell}>Fee</Text>
        <Text style={S.thCellLast}>Notes</Text>
      </View>
      {rows.map(([svc, fee, notes], i) => (
        <View key={i} style={i % 2 === 1 ? S.tableRowAlt : S.tableRow}>
          <Text style={S.tdCell}>{svc}</Text>
          <Text style={S.tdCell}>{fee}</Text>
          <Text style={S.tdCellLast}>{notes}</Text>
        </View>
      ))}
    </View>
  );
}

function ServiceCheckbox({ label, note }: { label: string; note?: string }) {
  return (
    <View style={S.serviceRow}>
      <View style={S.checkbox} />
      <View style={{ flex: 1 }}>
        <Text style={S.serviceText}>{label}</Text>
        {note ? <Text style={[S.serviceText, { fontSize: 8.5, color: MID }]}>{note}</Text> : null}
      </View>
      <View style={{ alignItems: 'center', marginLeft: 8 }}>
        <View style={S.initialsBox} />
        <Text style={S.initialsLabel}>Initials</Text>
      </View>
    </View>
  );
}

function SignatureBlock({
  clientName,
  date,
  christineSignatureBase64,
}: {
  clientName: string;
  date: string;
  christineSignatureBase64?: string;
}) {
  return (
    <View style={S.inner}>
      <View style={S.sigDivider} />
      <Text style={S.sigTitle}>SIGNATURES</Text>
      <Body>
        By signing below, both parties agree to the terms and conditions set forth in this Agreement.
      </Body>

      {/* Client row */}
      <View style={S.sigGrid}>
        <View style={S.sigCol}>
          <Text style={S.sigLabel}>CLIENT — {clientName.toUpperCase()}</Text>
          <View style={S.sigLineBox} />
          <Text style={S.sigLabel}>Signature</Text>
        </View>
        <View style={[S.sigCol, { flex: 0.45 }]}>
          <Text style={S.sigLabel}>Date</Text>
          <View style={S.sigLineBox} />
          <Text style={S.sigLabel}>Date</Text>
        </View>
      </View>

      {/* Christine row */}
      <View style={S.sigGrid}>
        <View style={S.sigCol}>
          <Text style={S.sigLabel}>RENTAL911 — CHRISTINE POLLARD</Text>
          <View style={S.sigLineBox}>
            {christineSignatureBase64 ? (
              <Image
                src={`data:image/png;base64,${christineSignatureBase64}`}
                style={{ height: 22, width: 90 }}
              />
            ) : null}
          </View>
          <Text style={S.sigLabel}>Authorized Signature</Text>
        </View>
        <View style={[S.sigCol, { flex: 0.45 }]}>
          <Text style={S.sigLabel}>Date</Text>
          <View style={S.sigLineBox}>
            {christineSignatureBase64 ? (
              <Text style={{ fontSize: 9, color: BODY }}>{date}</Text>
            ) : null}
          </View>
          <Text style={S.sigLabel}>Date</Text>
        </View>
      </View>

      <Body>
        This Agreement is executed as of the date of the Client's electronic signature above.
      </Body>
    </View>
  );
}

// ─── Standard Investor Agreement ─────────────────────────────────────────────

function StandardAgreement({ clientName, date, christineSignatureBase64 }:
  { clientName: string; date: string; christineSignatureBase64?: string }) {

  const feeRows: Array<[string, string, string]> = [
    ['Onboarding Fee (one-time)', '$595', 'Due at enrollment; non-refundable'],
    ['Monthly Management', '$185 / month', 'Per property (1–5 properties)'],
    ['À La Carte Consulting', '$135 / hour', 'When requested outside subscription scope'],
    ["Tenant Placement (optional)", "One month's rent", 'Charged separately if requested'],
  ];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Landlord Rescue® Subscription" />
        <View style={S.inner}>
          <View style={S.titleBlock}>
            <Text style={S.docTitle}>STANDARD INVESTOR AGREEMENT</Text>
            <Text style={S.docSubtitle}>Standard Tier (1–5 Properties)</Text>
            <Text style={S.dateLine}>Effective Date: {date}</Text>
          </View>
          <Parties clientName={clientName} clientRole="Landlord / Property Owner" />
          <Body>
            This Standard Investor Agreement ("Agreement") is entered into between Rental911, a DBA of
            Pollard Property Group, and the Client named above. This Agreement governs property management
            consulting and landlord support services for the Client's residential rental property.
          </Body>
          <Text style={S.sectionHeader}>SECTION 1 — ENGAGEMENT &amp; SCOPE OF SERVICES</Text>
          <Body>
            Rental911 agrees to provide monthly property management oversight, rent collection facilitation
            via the Rental911 tenant portal, lease renewal and compliance review, maintenance coordination
            and vendor dispatching (pre-authorized amounts per Section 12), fair housing compliance guidance,
            and monthly reporting. Services are limited to consulting and facilitation. Physical property
            access and final decisions remain with the Client.
          </Body>
          <Text style={S.sectionHeader}>SECTION 2 — SERVICE FEE SCHEDULE</Text>
          <FeeTable rows={feeRows} />
          <Body>
            All fees are billed automatically via the payment method on file. Monthly management fees are
            billed on the 1st of each month. Late payments beyond 10 days result in a $35 late fee and
            may result in suspension of services.
          </Body>
          <Text style={S.sectionHeader}>SECTION 3 — RENT COLLECTION &amp; TENANT MANAGEMENT</Text>
          <Body>
            Rental911 will facilitate rent collection through the tenant portal. Rental911 is not
            responsible for tenant non-payment and cannot guarantee rent collection. Eviction proceedings
            are the Client's financial responsibility and must be handled by a licensed attorney.
          </Body>
          <Text style={S.sectionHeader}>SECTION 4 — PROPERTY INSPECTIONS</Text>
          <Body>
            Rental911 will coordinate periodic inspection scheduling. Physical inspections are performed
            by qualified third parties or the Client. Inspection fees from third-party vendors are billed
            directly to the Client.
          </Body>
          <Text style={S.sectionHeader}>SECTION 5 — MAINTENANCE &amp; REPAIRS</Text>
          <Body>
            Rental911 will coordinate maintenance requests and dispatch approved vendors. Expenditures up
            to the pre-authorized threshold (set in onboarding) may be approved without advance Client
            approval. All costs exceeding the threshold require explicit written Client approval before
            work commences. Rental911 is not a general contractor and accepts no liability for vendor
            workmanship.
          </Body>
          <Text style={S.sectionHeader}>SECTION 6 — LEASE MANAGEMENT</Text>
          <Body>
            Rental911 will assist with lease drafting, renewals, and addenda using Maryland-compliant
            templates. Client is responsible for reviewing and executing all lease agreements. Rental911
            does not provide legal advice.
          </Body>
          <Text style={S.sectionHeader}>SECTION 7 — COMPLIANCE &amp; FAIR HOUSING</Text>
          <Body>
            Rental911 will provide compliance guidance for applicable Maryland and local rental housing
            laws, including MPDU requirements, lead paint disclosure, rental license requirements, and
            Fair Housing Act obligations. Compliance is ultimately the Client's responsibility.
          </Body>
          <Text style={S.sectionHeader}>SECTION 8 — REPORTING &amp; COMMUNICATION</Text>
          <Body>
            Rental911 will provide monthly activity reports via the Client portal. Client will receive
            prompt notification of urgent matters. Response times during business hours (Mon–Fri, 9am–5pm ET)
            are targeted at 24 hours.
          </Body>
          <Text style={S.sectionHeader}>SECTION 9 — INDEMNIFICATION</Text>
          <Body>
            Client agrees to indemnify, defend, and hold harmless Rental911 from claims arising from:
            Client's acts or omissions; property condition; failure to maintain required licenses or
            insurance; tenant disputes; or failure to follow Rental911's written recommendations.
          </Body>
          <Text style={S.sectionHeader}>SECTION 10 — LIMITATION OF LIABILITY</Text>
          <Body>
            Rental911's aggregate liability shall not exceed total monthly management fees paid in the
            three (3) months preceding the claim. Rental911 is not liable for lost rent, property damage,
            tenant conduct, vendor errors, or consequential damages.
          </Body>
          <Text style={S.sectionHeader}>SECTION 11 — CONFIDENTIALITY</Text>
          <Body>
            Both parties agree to keep this Agreement and all non-public information exchanged confidential
            for two (2) years post-termination. Rental911's systems, pricing, vendor relationships, and
            processes are proprietary business information.
          </Body>
          <Text style={S.sectionHeader}>SECTION 12 — AUTHORIZATION FOR AFC PROGRAMS</Text>
          <Body>
            By executing this Agreement, Client provides written authorization for Rental911 to enroll the
            property in applicable Automatic Funds Collection (AFC) programs. Client will be notified in
            advance of any AFC enrollment carrying a recurring cost and may opt out within 30 days.
          </Body>
          <Text style={S.sectionHeader}>SECTION 13 — NON-SOLICITATION</Text>
          <Body>
            For twelve (12) months post-termination, Client agrees not to directly solicit or hire any
            Rental911 vendor, contractor, or employee introduced through Rental911's services without
            prior written consent.
          </Body>
          <Text style={S.sectionHeader}>SECTION 14 — DISPUTE RESOLUTION</Text>
          <Body>
            Disputes shall be submitted to binding arbitration in Charles County, Maryland under AAA rules
            if negotiation fails within 30 days. The prevailing party shall be entitled to reasonable
            attorney's fees.
          </Body>
          <Text style={S.sectionHeader}>SECTION 15 — GOVERNING LAW</Text>
          <Body>
            This Agreement is governed by Maryland law. Venue for any action shall be Charles County, MD.
          </Body>
          <Text style={S.sectionHeader}>SECTION 16 — TERM, RENEWAL &amp; CANCELLATION</Text>
          <Body>
            This Agreement commences on the Effective Date and continues month-to-month. Either party may
            terminate with thirty (30) days written notice. Client termination during the first six (6)
            months forfeits the onboarding fee. Rental911 may terminate immediately upon material breach.
          </Body>
        </View>
        <PageFooter label="Standard Investor Agreement — CONFIDENTIAL" />
      </Page>

      {/* Signature page — always the last explicit Page, so page count = sigPage */}
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Landlord Rescue® Subscription" />
        <SignatureBlock clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />
        <PageFooter label="Standard Investor Agreement — CONFIDENTIAL" />
      </Page>
    </Document>
  );
}

// ─── Portfolio Investor Agreement ─────────────────────────────────────────────

function PortfolioAgreement({ clientName, date, christineSignatureBase64 }:
  { clientName: string; date: string; christineSignatureBase64?: string }) {

  const feeRows: Array<[string, string, string]> = [
    ['Onboarding Fee (one-time)', '$995', 'Due at enrollment; non-refundable'],
    ['Monthly Management', '$285 / month', 'Per portfolio (6+ properties)'],
    ['À La Carte Consulting', '$135 / hour', 'When requested outside subscription scope'],
    ["Tenant Placement (optional)", "One month's rent", 'Charged separately per unit if requested'],
    ['Portfolio Review (quarterly)', 'Included', 'Performance and compliance review per quarter'],
  ];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Landlord Rescue® Subscription — Portfolio Tier" />
        <View style={S.inner}>
          <View style={S.titleBlock}>
            <Text style={S.docTitle}>PORTFOLIO INVESTOR AGREEMENT</Text>
            <Text style={S.docSubtitle}>Portfolio Tier (6+ Properties)</Text>
            <Text style={S.dateLine}>Effective Date: {date}</Text>
          </View>
          <Parties clientName={clientName} clientRole="Portfolio Investor / Property Owner" />
          <Body>
            This Portfolio Investor Agreement ("Agreement") is entered into between Rental911, a DBA of
            Pollard Property Group, and the Client named above. This Agreement governs property management
            consulting and landlord support services for the Client's residential rental portfolio of six
            (6) or more properties.
          </Body>
          <Text style={S.sectionHeader}>SECTION 1 — ENGAGEMENT &amp; SCOPE OF SERVICES</Text>
          <Body>
            Rental911 agrees to provide full portfolio management oversight, rent collection facilitation
            via the Rental911 tenant portal, lease renewal and compliance review for all portfolio units,
            maintenance coordination and vendor dispatching (pre-authorized amounts per Section 12),
            fair housing compliance guidance, monthly portfolio reporting, and quarterly portfolio
            performance reviews. Services are limited to consulting and facilitation.
          </Body>
          <Text style={S.sectionHeader}>SECTION 2 — SERVICE FEE SCHEDULE</Text>
          <FeeTable rows={feeRows} />
          <Body>
            All fees are billed automatically via the payment method on file. Monthly management fees are
            billed on the 1st of each month. Late payments beyond 10 days result in a $35 late fee and
            may result in suspension of services.
          </Body>
          <Text style={S.sectionHeader}>SECTION 3 — RENT COLLECTION &amp; TENANT MANAGEMENT</Text>
          <Body>
            Rental911 will facilitate rent collection through the tenant portal for all portfolio units.
            Rental911 is not responsible for tenant non-payment and cannot guarantee rent collection.
            Eviction proceedings are the Client's financial responsibility and must be handled by a
            licensed attorney.
          </Body>
          <Text style={S.sectionHeader}>SECTION 4 — PROPERTY INSPECTIONS</Text>
          <Body>
            Rental911 will coordinate periodic inspection scheduling for portfolio properties. Physical
            inspections are performed by qualified third parties or the Client. Inspection fees from
            third-party vendors are billed directly to the Client.
          </Body>
          <Text style={S.sectionHeader}>SECTION 5 — MAINTENANCE &amp; REPAIRS</Text>
          <Body>
            Rental911 will coordinate maintenance requests and dispatch approved vendors for all portfolio
            properties. Expenditures up to the pre-authorized threshold may be approved without advance
            Client approval. All costs exceeding the threshold require explicit written Client approval.
            Rental911 is not a general contractor and accepts no liability for vendor workmanship.
          </Body>
          <Text style={S.sectionHeader}>SECTION 6 — LEASE MANAGEMENT</Text>
          <Body>
            Rental911 will assist with lease drafting, renewals, and addenda for all portfolio units using
            Maryland-compliant templates. Client is responsible for reviewing and executing all lease
            agreements. Rental911 does not provide legal advice.
          </Body>
          <Text style={S.sectionHeader}>SECTION 7 — COMPLIANCE &amp; FAIR HOUSING</Text>
          <Body>
            Rental911 will provide compliance guidance for applicable Maryland and local rental housing
            laws across all portfolio properties. Compliance is ultimately the Client's responsibility.
          </Body>
          <Text style={S.sectionHeader}>SECTION 8 — PORTFOLIO REPORTING &amp; COMMUNICATION</Text>
          <Body>
            Rental911 will provide monthly activity reports per unit and quarterly portfolio reviews
            including performance analysis, occupancy trends, and strategic recommendations. Urgent matters
            receive prompt notification. Response target during business hours is 24 hours.
          </Body>
          <Text style={S.sectionHeader}>SECTION 9 — INDEMNIFICATION</Text>
          <Body>
            Client agrees to indemnify, defend, and hold harmless Rental911 from claims arising from
            Client's acts or omissions; condition of any portfolio property; failure to maintain required
            licenses or insurance per property; tenant disputes; or failure to follow written recommendations.
          </Body>
          <Text style={S.sectionHeader}>SECTION 10 — LIMITATION OF LIABILITY</Text>
          <Body>
            Rental911's aggregate liability shall not exceed total monthly management fees paid in the
            three (3) months preceding the claim. Rental911 is not liable for lost rent, property damage,
            tenant conduct, vendor errors, or consequential damages.
          </Body>
          <Text style={S.sectionHeader}>SECTION 11 — CONFIDENTIALITY</Text>
          <Body>
            Both parties agree to keep this Agreement and all non-public information confidential for
            two (2) years post-termination. Rental911's systems, pricing, vendor relationships, and
            processes are proprietary business information.
          </Body>
          <Text style={S.sectionHeader}>SECTION 12 — AUTHORIZATION FOR AFC PROGRAMS</Text>
          <Body>
            By executing this Agreement, Client provides written authorization for Rental911 to enroll
            portfolio properties in applicable AFC programs. Client will be notified in advance of any
            AFC enrollment carrying a recurring cost and may opt out within 30 days.
          </Body>
          <Text style={S.sectionHeader}>SECTION 13 — NON-SOLICITATION</Text>
          <Body>
            For twelve (12) months post-termination, Client agrees not to directly solicit or hire any
            Rental911 vendor, contractor, or employee introduced through Rental911's services without
            prior written consent.
          </Body>
          <Text style={S.sectionHeader}>SECTION 14 — DISPUTE RESOLUTION</Text>
          <Body>
            Disputes shall be submitted to binding arbitration in Charles County, Maryland under AAA rules
            if negotiation fails within 30 days. The prevailing party shall be entitled to reasonable
            attorney's fees.
          </Body>
          <Text style={S.sectionHeader}>SECTION 15 — GOVERNING LAW</Text>
          <Body>
            This Agreement is governed by Maryland law. Venue for any action shall be Charles County, MD.
          </Body>
          <Text style={S.sectionHeader}>SECTION 16 — TERM, RENEWAL &amp; CANCELLATION</Text>
          <Body>
            This Agreement commences on the Effective Date and continues month-to-month. Either party may
            terminate with thirty (30) days written notice. Client termination during the first six (6)
            months forfeits the onboarding fee. Rental911 may terminate immediately upon material breach.
          </Body>
          <Text style={S.sectionHeader}>SECTION 17 — PORTFOLIO SCALABILITY</Text>
          <Body>
            Additional properties acquired after the Effective Date may be added to the portfolio
            management scope with written notice. Properties may be removed upon disposition with thirty
            (30) days written notice. Pricing adjustments for significant portfolio changes will be
            negotiated in good faith.
          </Body>
        </View>
        <PageFooter label="Portfolio Investor Agreement — CONFIDENTIAL" />
      </Page>

      {/* Signature page — always the last explicit Page */}
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Landlord Rescue® Subscription — Portfolio Tier" />
        <SignatureBlock clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />
        <PageFooter label="Portfolio Investor Agreement — CONFIDENTIAL" />
      </Page>
    </Document>
  );
}

// ─── Placement Only Agreement ─────────────────────────────────────────────────

function PlacementAgreement({ clientName, date, christineSignatureBase64 }:
  { clientName: string; date: string; christineSignatureBase64?: string }) {
  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Tenant Placement Service" />
        <View style={S.inner}>
          <View style={S.titleBlock}>
            <Text style={S.docTitle}>PLACEMENT ONLY AGREEMENT</Text>
            <Text style={S.docSubtitle}>One-Time Tenant Placement Service</Text>
            <Text style={S.dateLine}>Effective Date: {date}</Text>
          </View>
          <Parties clientName={clientName} clientRole="Landlord / Property Owner" />
          <Body>
            This Placement Only Agreement ("Agreement") is entered into between Rental911, a DBA of
            Pollard Property Group, and the Client named above. This Agreement governs the provision of
            one-time tenant placement services for the Client's residential rental property.
          </Body>
          <Text style={S.sectionHeader}>SECTION 1 — SCOPE OF SERVICES</Text>
          <Body>
            Rental911 will assist with marketing the rental property, screening tenant applications
            (credit, background, and rental history checks per applicable law), presenting qualified
            applicants, and facilitating lease execution. Services are limited to placement only and
            do not include ongoing property management.
          </Body>
          <Text style={S.sectionHeader}>SECTION 2 — FEE</Text>
          <Body>
            Client agrees to pay Rental911 a one-time placement fee equal to one (1) month's rent for
            the property upon execution of a lease with a tenant sourced by Rental911. The fee is
            non-refundable once a lease is executed. If Client rejects all qualified applicants
            presented, no fee is due.
          </Body>
          <Text style={S.sectionHeader}>SECTION 3 — CLIENT OBLIGATIONS</Text>
          <Body>
            Client is responsible for: maintaining the property in habitable condition; disclosing
            any known material defects; ensuring required rental licenses are current; and executing
            or rejecting applicants in a timely manner. Client must comply with all applicable fair
            housing laws in making rental decisions.
          </Body>
          <Text style={S.sectionHeader}>SECTION 4 — LIMITATION OF LIABILITY</Text>
          <Body>
            Rental911's liability under this Agreement is limited to the placement fee paid. Rental911
            is not liable for tenant conduct following placement, property damage, or any consequential
            damages. Tenant screening results are provided for informational purposes; Client makes
            all final rental decisions.
          </Body>
          <Text style={S.sectionHeader}>SECTION 5 — GOVERNING LAW</Text>
          <Body>
            This Agreement is governed by Maryland law. Disputes shall be resolved in Charles County, MD.
          </Body>
        </View>
        <PageFooter label="Placement Only Agreement — CONFIDENTIAL" />
      </Page>

      {/* Signature page — always the last explicit Page */}
      <Page size="LETTER" style={S.page}>
        <InvestorHeader subtitle="Tenant Placement Service" />
        <SignatureBlock clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />
        <PageFooter label="Placement Only Agreement — CONFIDENTIAL" />
      </Page>
    </Document>
  );
}

// ─── Landlord Consulting Agreement (à la carte) ───────────────────────────────

const CONSULTING_SERVICES = [
  {
    label: 'Lease Review & Drafting',
    note: 'Review of existing lease or drafting of Maryland-compliant residential lease agreement',
  },
  {
    label: 'Tenant Screening & Background Check Guidance',
    note: 'Screening criteria setup, application review, and Fair Housing compliance guidance',
  },
  {
    label: 'Eviction Process Guidance',
    note: 'Step-by-step Maryland eviction process walkthrough and documentation assistance',
  },
  {
    label: 'Lease Violation / Non-Payment Notices',
    note: 'Preparation of required Maryland notices (Pay or Quit, Lease Violation, etc.)',
  },
  {
    label: 'Security Deposit Compliance Audit',
    note: 'Review of deposit handling, accounting, and return procedures per MD law',
  },
  {
    label: 'Rental License & Registration Assistance',
    note: 'County rental license application guidance and compliance checklist',
  },
  {
    label: 'Lead Paint Disclosure & Compliance',
    note: 'Disclosure form review and MDE registration guidance where applicable',
  },
  {
    label: 'Rent Increase Procedures',
    note: 'Proper notice requirements and documentation for rent increases',
  },
  {
    label: 'Property Condition Documentation',
    note: 'Move-in/move-out inspection checklists and photographic documentation guidance',
  },
  {
    label: 'Consulting Call (1 Hour)',
    note: 'Live strategy session — landlord coaching, compliance Q&A, or process planning',
  },
];

function ConsultingAgreement({ clientName, date, flatFee, christineSignatureBase64 }:
  { clientName: string; date: string; flatFee?: string; christineSignatureBase64?: string }) {
  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <ConsultingHeader />
        <View style={S.inner}>
          <View style={S.titleBlock}>
            <Text style={S.docTitle}>LANDLORD CONSULTING AGREEMENT</Text>
            <Text style={S.docSubtitle}>À La Carte Consulting Service</Text>
            <Text style={S.dateLine}>Effective Date: {date}</Text>
          </View>

          {/* Customer info block */}
          <View style={S.infoTable}>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Client Name:</Text>
              <Text style={S.infoValue}>{clientName}</Text>
            </View>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Rental Property Address:</Text>
              <Text style={S.infoValue}>____________________________________________________</Text>
            </View>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>County:</Text>
              <Text style={S.infoValue}>____________________________</Text>
            </View>
            <View style={S.infoRow}>
              <Text style={S.infoLabel}>Property Type:</Text>
              <Text style={S.infoValue}>____________________________</Text>
            </View>
          </View>

          <Text style={S.sectionHeaderUnderline}>SECTION 1 — SERVICES REQUESTED</Text>
          <Body>
            Client has selected the following consulting services (place initials next to each selected service):
          </Body>
          {CONSULTING_SERVICES.map((s, i) => (
            <ServiceCheckbox key={i} label={s.label} note={s.note} />
          ))}

          <Text style={S.sectionHeaderUnderline}>SECTION 2 — FEE AND PAYMENT</Text>
          {flatFee ? (
            <View style={S.feeBox}>
              <Text style={S.feeBoxLabel}>Flat Consulting Fee</Text>
              <Text style={S.feeBoxAmount}>{flatFee}</Text>
              <Text style={S.feeBoxNote}>Due at time of booking · Non-refundable</Text>
            </View>
          ) : (
            <Body>
              Consulting services are billed at $135.00 per hour or a flat fee as quoted at booking.
              Payment is due at the time of booking and is non-refundable. Client will receive a Stripe
              payment link or may pay at book.rental911.net/coaching-call.
            </Body>
          )}
          <Body>
            Consulting services do not include ongoing property management, legal representation, or
            court appearances. Rental911 is not a law firm and does not provide legal advice.
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 3 — WHAT RENTAL911 DOES NOT DO</Text>
          <Body>
            Rental911 does not: (a) represent Client in court or provide legal counsel; (b) manage
            tenants or collect rent on an ongoing basis under this agreement; (c) conduct physical
            property inspections; (d) guarantee specific outcomes with tenants, courts, or agencies;
            or (e) contact tenants on Client's behalf unless specifically authorized in writing.
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 4 — CUSTOMER RESPONSIBILITIES</Text>
          <Body>
            Client is responsible for providing accurate information about the property and tenancy,
            acting on recommendations in a timely manner, and making all final decisions regarding
            the property. Client agrees to comply with all applicable fair housing, landlord-tenant,
            and local rental licensing laws.
          </Body>
          <Body>
            Licensure Acknowledgment: Client acknowledges that they are responsible for obtaining and
            maintaining any required rental licenses for the property. _________ (Client Initials)
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 5 — DELIVERY</Text>
          <Body>
            Consulting deliverables (documents, checklists, call recordings where applicable) will
            be provided electronically within 2–5 business days of the consulting session, unless
            otherwise agreed. Call-based services are delivered on the scheduled date.
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 6 — LIMITATION OF LIABILITY</Text>
          <Body>
            Rental911's liability under this Agreement is limited to the consulting fee paid.
            Rental911 is not liable for Client's decisions, tenant conduct, court outcomes, agency
            determinations, property damage, or any consequential or incidental damages.
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 7 — GOVERNING LAW</Text>
          <Body>
            This Agreement is governed by the laws of the State of Maryland. Any disputes shall be
            resolved in Charles County, Maryland.
          </Body>

          <Text style={S.sectionHeaderUnderline}>SECTION 8 — ENTIRE AGREEMENT</Text>
          <Body>
            This Agreement constitutes the entire agreement between the parties regarding the
            consulting services described herein and supersedes all prior discussions. Modifications
            must be in writing and signed by both parties.
          </Body>
        </View>
        <PageFooter label="Landlord Consulting Agreement — CONFIDENTIAL" />
      </Page>

      {/* Signature page — always the last explicit Page */}
      <Page size="LETTER" style={S.page}>
        <ConsultingHeader />
        <SignatureBlock clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />
        <PageFooter label="Landlord Consulting Agreement — CONFIDENTIAL" />
      </Page>
    </Document>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AgreementPdfOptions {
  tier: string;                       // 'standard' | 'portfolio' | 'placement_only' | 'consulting'
  clientName: string;
  date: string;                       // formatted date string, e.g. "August 5, 2026"
  flatFee?: string;                   // consulting tier only, e.g. "$135.00"
  christineSignatureBase64?: string;  // optional; omit to leave Christine's line blank
}

export async function renderAgreementPdf(opts: AgreementPdfOptions): Promise<Buffer> {
  const { tier, clientName, date, flatFee, christineSignatureBase64 } = opts;

  let element: React.ReactElement;

  switch (tier) {
    case 'portfolio':
      element = <PortfolioAgreement clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />;
      break;
    case 'placement_only':
      element = <PlacementAgreement clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />;
      break;
    case 'consulting':
      element = <ConsultingAgreement clientName={clientName} date={date} flatFee={flatFee} christineSignatureBase64={christineSignatureBase64} />;
      break;
    case 'standard':
    default:
      element = <StandardAgreement clientName={clientName} date={date} christineSignatureBase64={christineSignatureBase64} />;
  }

  return await renderToBuffer(element);
}
