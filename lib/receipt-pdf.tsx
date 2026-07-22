import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { brand } from '@/lib/brand';

export interface ReceiptData {
  confirmationNumber: string;
  tenantName: string;
  unitAddress: string;
  paidDate: string; // already formatted for display
  paymentMethod: 'ach' | 'card_credit' | 'card_debit';
  rentAmount: number; // dollars
  lateFeeAmount: number; // dollars — 0 if not late
  surchargeAmount: number; // dollars
  totalCharged: number; // dollars
  landlordName: string;
}

const methodLabels: Record<ReceiptData['paymentMethod'], string> = {
  ach: 'Bank transfer (ACH)',
  card_credit: 'Credit card',
  card_debit: 'Debit card',
};

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
  confirmation: {
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
  },
  totalValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: brand.navy,
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

export function ReceiptDocument(data: ReceiptData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkRental}>Rental</Text>
            <Text style={styles.wordmark911}>911</Text>
          </Text>
          <Text style={styles.headerSubtitle}>Rent payment receipt</Text>
        </View>
        <View style={styles.headerAccent} />

        <View style={styles.body}>
          <Text style={styles.title}>Payment Receipt</Text>
          <Text style={styles.confirmation}>Confirmation #{data.confirmationNumber}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Paid by</Text>
            <Text style={styles.sectionValue}>{data.tenantName}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Property</Text>
            <Text style={styles.sectionValue}>{data.unitAddress}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Paid to</Text>
            <Text style={styles.sectionValue}>{data.landlordName}</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Date paid</Text>
              <Text style={styles.rowValue}>{data.paidDate}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Payment method</Text>
              <Text style={styles.rowValue}>{methodLabels[data.paymentMethod]}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Rent</Text>
              <Text style={styles.rowValue}>{money(data.rentAmount)}</Text>
            </View>
            {data.lateFeeAmount > 0 && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Late fee (5% — due by the 5th)</Text>
                <Text style={styles.rowValue}>{money(data.lateFeeAmount)}</Text>
              </View>
            )}
            {data.surchargeAmount > 0 && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Card processing surcharge</Text>
                <Text style={styles.rowValue}>{money(data.surchargeAmount)}</Text>
              </View>
            )}
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{money(data.totalCharged)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Rental911 · This receipt confirms a rent payment processed on behalf of your landlord.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument {...data} />);
}
