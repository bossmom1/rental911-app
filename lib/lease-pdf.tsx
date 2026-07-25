import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { brand } from '@/lib/brand';

/**
 * Draft renewal lease PDF. PLACEHOLDER legal clause text — pending Christine's
 * real "standard lease template" (built from her National Association of
 * Realtors form set), which will be stored as a fillable template asset and
 * merge-filled here instead of this hardcoded placeholder body. Same
 * placeholder category as app/api/leaserunner/screen/route.ts.
 *
 * Styling mirrors lib/receipt-pdf.tsx exactly (navy header, gold accent bar,
 * "Rental911" wordmark, labeled sections, bordered row table).
 */
export interface LeaseData {
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
  unitLabel: string;
  startDate: string; // pre-formatted
  endDate: string; // pre-formatted
  monthlyRent: number;
  securityDeposit: number;
  generatedDate: string; // pre-formatted
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: brand.text,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: brand.navy,
    paddingVertical: 24,
    paddingHorizontal: 36,
  },
  headerAccent: {
    height: 6,
    backgroundColor: brand.gold,
  },
  wordmark: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
  },
  wordmarkRental: {
    color: '#FFFFFF',
  },
  wordmark911: {
    color: brand.gold,
  },
  headerSubtitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
  },
  body: {
    paddingHorizontal: 36,
    paddingTop: 28,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
    marginBottom: 4,
  },
  generated: {
    fontSize: 11,
    color: '#666666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 12,
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  rowLabel: {
    fontSize: 12,
  },
  rowValue: {
    fontSize: 12,
  },
  clauseTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
    marginTop: 16,
    marginBottom: 4,
  },
  clauseBody: {
    fontSize: 10,
    color: '#555555',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 9,
    color: '#999999',
    textAlign: 'center',
  },
});

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function LeaseDocument(data: LeaseData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkRental}>Rental</Text>
            <Text style={styles.wordmark911}>911</Text>
          </Text>
          <Text style={styles.headerSubtitle}>Residential Lease Renewal — Draft</Text>
        </View>
        <View style={styles.headerAccent} />

        <View style={styles.body}>
          <Text style={styles.title}>Draft Lease Renewal Agreement</Text>
          <Text style={styles.generated}>Generated {data.generatedDate} — for landlord review</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tenant</Text>
            <Text style={styles.sectionValue}>{data.tenantName}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Landlord</Text>
            <Text style={styles.sectionValue}>{data.landlordName}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Property</Text>
            <Text style={styles.sectionValue}>
              {data.propertyAddress}, {data.unitLabel}
            </Text>
          </View>

          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Lease start</Text>
              <Text style={styles.rowValue}>{data.startDate}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Lease end</Text>
              <Text style={styles.rowValue}>{data.endDate}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Monthly rent</Text>
              <Text style={styles.rowValue}>{money(data.monthlyRent)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Security deposit</Text>
              <Text style={styles.rowValue}>{money(data.securityDeposit)}</Text>
            </View>
          </View>

          <Text style={styles.clauseTitle}>Terms &amp; Conditions</Text>
          <Text style={styles.clauseBody}>
            [PLACEHOLDER — this section will be replaced with Christine&apos;s standard lease
            template, merge-filled with the terms above. The template asset is not yet on file;
            this draft exists only to demonstrate the renewal review flow and must not be used
            as a real lease document.]
          </Text>
        </View>

        <Text style={styles.footer}>
          Rental911 · Draft lease — landlord review only, not yet sent to tenant.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderLeasePdf(data: LeaseData): Promise<Buffer> {
  return renderToBuffer(<LeaseDocument {...data} />);
}
