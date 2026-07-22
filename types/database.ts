/**
 * Rental911 database types.
 * Mirrors supabase/schema.sql. Keep in sync when the schema changes.
 * (You can regenerate with `supabase gen types typescript` once the CLI is set up.)
 */

export type UserRole = 'admin' | 'landlord' | 'tenant';
export type AccessLevel = 'full' | 'limited';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance';
export type LeaseStatus = 'active' | 'expired' | 'terminated';
export type RentStatus = 'pending' | 'paid' | 'late' | 'failed';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'emergency';
export type MaintenanceStatus =
  | 'open'
  | 'in_progress'
  | 'vendor_assigned'
  | 'completed'
  | 'closed';
export type ChatSenderRole = 'admin' | 'landlord' | 'tenant' | 'system';
export type DocumentType =
  | 'lease'
  | 'lead_paint'
  | 'renters_insurance'
  | 'gov_id'
  | 'income_verification'
  | 'other';
export type ComplianceStatus =
  | 'current'
  | 'expiring_soon'
  | 'expired'
  | 'not_on_file';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  phone: string | null;
  avatar_url: string | null;
  onboarding_complete: boolean;
  onboarding_step: number;
  access_level: AccessLevel;
  stripe_customer_id: string | null;
  /** Landlord payout account (Connect Express) — null until onboarding starts. */
  stripe_account_id: string | null;
  /** Mirrors the Stripe account's charges_enabled; kept fresh by account.updated. */
  stripe_charges_enabled: boolean | null;
  created_at: string;
}

export interface Property {
  id: string;
  landlord_id: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  property_type: string | null;
  unit_count: number;
  lead_paint_required: boolean;
  rental_license_number: string | null;
  rental_license_expiry: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  property_id: string | null;
  unit_number: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  monthly_rent: number | null;
  status: UnitStatus | null;
  created_at: string;
}

export interface Lease {
  id: string;
  unit_id: string | null;
  tenant_id: string | null;
  landlord_id: string | null;
  start_date: string | null;
  end_date: string | null;
  monthly_rent: number | null;
  security_deposit: number | null;
  status: LeaseStatus | null;
  renewal_alert_sent: boolean;
  created_at: string;
}

export interface RentPayment {
  id: string;
  lease_id: string | null;
  tenant_id: string | null;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
  status: RentStatus | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  /** Unused since direct charges replaced hosted Checkout; kept for old rows. */
  stripe_checkout_session_id: string | null;
  /** 'ach' | 'card_credit' | 'card_debit' — decides who absorbed the fee. */
  payment_method: string | null;
  /** Flat 5% of rent, charged when payment is initiated on/after the 6th (due by the 5th). */
  late_fee_amount: number | null;
  /** Charged to the tenant ON TOP of rent. Always 0 for debit cards. */
  surcharge_amount: number | null;
  /** What the tenant actually paid (rent + surcharge). */
  total_charged: number | null;
  /** Supabase Storage path in the private "receipts" bucket, e.g. `{lease_id}/{payment_id}.pdf`. */
  receipt_path: string | null;
  /** Permanently null — Rental911 takes no cut of rent. */
  platform_fee: number | null;
  created_at: string;
}

export interface MaintenanceRequest {
  id: string;
  unit_id: string | null;
  tenant_id: string | null;
  landlord_id: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: MaintenancePriority | null;
  status: MaintenanceStatus | null;
  chat_summary: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface MaintenanceChat {
  id: string;
  request_id: string;
  sender_id: string | null;
  sender_role: ChatSenderRole | null;
  message: string | null;
  created_at: string;
}

export interface Vendor {
  id: string;
  name: string | null;
  trade: string | null;
  phone: string | null;
  email: string | null;
  avg_response_hours: number;
  active: boolean;
  created_at: string;
}

export interface VendorDispatch {
  id: string;
  request_id: string;
  vendor_id: string | null;
  dispatched_at: string;
  dispatched_by: string | null;
  vendor_response: string | null;
  responded_at: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  completion_confirmed: boolean;
  tenant_rating: number | null;
  tenant_feedback: string | null;
}

export interface DocumentRecord {
  id: string;
  owner_id: string | null;
  lease_id: string | null;
  unit_id: string | null;
  type: DocumentType | string | null;
  file_url: string | null;
  file_name: string | null;
  uploaded_by_role: UserRole | null;
  created_at: string;
}

export interface ComplianceItem {
  id: string;
  property_id: string | null;
  type: string | null;
  status: ComplianceStatus | null;
  expiry_date: string | null;
  alert_sent: boolean;
  notes: string | null;
  created_at: string;
}

/**
 * Minimal Database shape for the typed Supabase client.
 * Row/Insert/Update use the interfaces above; Insert makes DB-defaulted
 * columns optional at the call site where practical.
 */
// Each table must carry a `Relationships` key, or supabase-js resolves every
// query row to `never`. We don't model embedded-relationship typing here
// (embeds are read with `any` casts), so an empty tuple is sufficient.
type Table<Row, Ins = Partial<Row>, Upd = Partial<Row>> = {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: Table<User, Partial<User> & { email: string }>;
      properties: Table<Property>;
      units: Table<Unit>;
      leases: Table<Lease>;
      rent_payments: Table<RentPayment>;
      maintenance_requests: Table<MaintenanceRequest>;
      maintenance_chat: Table<MaintenanceChat, Partial<MaintenanceChat> & { request_id: string }>;
      vendors: Table<Vendor>;
      vendor_dispatches: Table<VendorDispatch, Partial<VendorDispatch> & { request_id: string }>;
      documents: Table<DocumentRecord>;
      compliance_items: Table<ComplianceItem>;
    };
    // NOTE: must be `{ [_ in never]: never }`, NOT `Record<string, never>`.
    // A string index signature here poisons `.from()` (Tables & Views) to `never`.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
