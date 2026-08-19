export interface User {
  id: number
  email: string
  full_name: string
  role: 'admin' | 'manager' | 'staff' | 'production'
}

export interface Customer {
  id: number
  company_name: string
  contact_person: string
  phone: string
  email: string
  address: string
  tax_id: string
  credit_limit: string
  is_active: boolean
}

export interface ThicknessOption {
  id: number
  thickness_mm: number
  tempering_allowed: boolean
  surcharge_multiplier: string
}

export interface GlassCatalog {
  id: number
  name: string
  image: string | null
  image_url: string | null
  max_width_mm: number
  max_height_mm: number
  min_width_mm: number
  min_height_mm: number
  base_price_per_sqm: string
  cutting_rate_per_sqm: string
  thickness_options: ThicknessOption[]
  is_active: boolean
}

export interface OrderItem {
  id: number
  catalog: number
  catalog_name: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  tempering_required: boolean
  cutting_allowance_mm: number
  finished_sqm: string
  rough_width_mm: number
  rough_height_mm: number
  material_cost: string
  cutting_cost: string
  tempering_cost: string
  line_total_price: string
}

export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'pending_payment'
  | 'confirmed'
  | 'cutting'
  | 'tempering'
  | 'qc'
  | 'ready_dispatch'
  | 'delivered'
  | 'cancelled'
  | 'on_hold'

export type PaymentStatus =
  | 'unpaid'
  | 'downpayment_pending'
  | 'downpayment_verified'
  | 'balance_due'
  | 'fully_paid'

export interface Payment {
  id: number
  order: number
  order_number: string
  customer_name: string
  total_price: string
  downpayment_amount: string
  payment_type: 'downpayment' | 'balance' | 'full'
  amount_claimed: string
  amount_confirmed: string | null
  proof_image: string
  proof_image_url: string | null
  customer_phone: string
  notes: string
  status: 'pending' | 'approved' | 'rejected'
  verified_by: number | null
  verified_by_name: string | null
  verified_at: string | null
  rejection_reason: string
  submitted_at: string
}

export interface StatusLog {
  id: number
  status_from: string
  status_to: string
  changed_by_name: string
  timestamp: string
  remarks: string
}

export interface Order {
  id: number
  order_number: string
  customer: number
  customer_name: string
  order_date: string
  delivery_deadline: string
  total_sqm: string
  subtotal: string
  tempering_charge: string
  rush_charge: string
  tax_amount: string
  total_price: string
  status: OrderStatus
  payment_status: PaymentStatus
  is_walkin: boolean
  rush_flag: boolean
  notes: string
  created_by: number
  created_by_name: string
  items: OrderItem[]
  status_logs: StatusLog[]
}

export interface DashboardStats {
  total_orders: number
  confirmed: number
  cutting: number
  tempering: number
  qc: number
  ready_dispatch: number
  delivered: number
  rush_orders: number
  overdue: number
  pending_payment_verifications: number
}
