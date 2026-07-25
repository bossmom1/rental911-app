import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { brand } from '@/lib/brand';
import { fmtDate } from '@/lib/format';
import type { PnlReport } from '@/lib/pnl';

/** Styling mirrors lib/receipt-pdf.tsx exactly (navy header, gold accent bar, wordmark, bordered table). */
export interface PnlPdfData {
  landlordName: string;
  generatedDate: string; // pre-formatted
  report: PnlReport;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
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
  dateRange: {
    fontSize: 11,
    color: brand.navy,
    marginBottom: 6,
  },
  meta: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 20,
  },
  propertyBlock: {
    marginBottom: 16,
  },
  propertyName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: brand.navy,
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  colUnit: { width: '25%', fontSize: 10 },
  colNum: { width: '18.75%', fontSize: 10, textAlign: 'right' },
  headerLabel: { fontFamily: 'Helvetica-Bold', color: brand.navy },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: brand.navy,
  },
  totalLabel: {
    width: '25%',
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
  },
  totalValue: {
    width: '18.75%',
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
    textAlign: 'right',
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

export function PnlDocument({ landlordName, generatedDate, report }: PnlPdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkRental}>Rental</Text>
            <Text style={styles.wordmark911}>911</Text>
          </Text>
          <Text style={styles.headerSubtitle}>Profit &amp; Loss Statement</Text>
        </View>
        <View style={styles.headerAccent} />

        <View style={styles.body}>
          <Text style={styles.title}>{report.range.label}</Text>
          <Text style={styles.dateRange}>
            {fmtDate(report.range.start)} – {fmtDate(report.range.end)}
          </Text>
          <Text style={styles.meta}>
            {landlordName} · Generated {generatedDate}
          </Text>

          {report.properties.map((p) => (
            <View key={p.propertyId} style={styles.propertyBlock} wrap={false}>
              <Text style={styles.propertyName}>{p.propertyName}</Text>
              <View style={styles.headerRow}>
                <Text style={[styles.colUnit, styles.headerLabel]}>Unit</Text>
                <Text style={[styles.colNum, styles.headerLabel]}>Rent Due</Text>
                <Text style={[styles.colNum, styles.headerLabel]}>Collected</Text>
                <Text style={[styles.colNum, styles.headerLabel]}>Outstanding</Text>
                <Text style={[styles.colNum, styles.headerLabel]}>Net</Text>
              </View>
              {p.units.map((u) => (
                <View key={u.unitId} style={styles.row}>
                  <Text style={styles.colUnit}>Unit {u.unitNumber ?? '—'}</Text>
                  <Text style={styles.colNum}>{money(u.rentDue)}</Text>
                  <Text style={styles.colNum}>{money(u.rentCollected)}</Text>
                  <Text style={styles.colNum}>{money(u.outstanding)}</Text>
                  <Text style={styles.colNum}>{money(u.netToLandlord)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Property Total</Text>
                <Text style={styles.totalValue}>{money(p.rentDue)}</Text>
                <Text style={styles.totalValue}>{money(p.rentCollected)}</Text>
                <Text style={styles.totalValue}>{money(p.outstanding)}</Text>
                <Text style={styles.totalValue}>{money(p.netToLandlord)}</Text>
              </View>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Grand Total</Text>
            <Text style={styles.totalValue}>{money(report.totals.rentDue)}</Text>
            <Text style={styles.totalValue}>{money(report.totals.rentCollected)}</Text>
            <Text style={styles.totalValue}>{money(report.totals.outstanding)}</Text>
            <Text style={styles.totalValue}>{money(report.totals.netToLandlord)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Rental911 · Net to Landlord reflects rent collected (Rental911 takes no platform fee from rent).
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPnlPdf(data: PnlPdfData): Promise<Buffer> {
  return renderToBuffer(<PnlDocument {...data} />);
}
