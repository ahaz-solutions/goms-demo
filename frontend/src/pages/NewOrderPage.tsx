import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { Customer, GlassCatalog, ThicknessOption } from '../types'
import toast from 'react-hot-toast'
import { Plus, Trash2, AlertTriangle, Zap, X } from 'lucide-react'
import { format, addDays } from 'date-fns'

interface LineItem {
  id: string
  catalog_id: number | ''
  thickness_mm: number | ''
  width_mm: number | ''
  height_mm: number | ''
  quantity: number
  tempering_required: boolean
  cutting_allowance_mm: number
}

const defaultLine = (): LineItem => ({
  id: Math.random().toString(36).slice(2),
  catalog_id: '',
  thickness_mm: '',
  width_mm: '',
  height_mm: '',
  quantity: 1,
  tempering_required: false,
  cutting_allowance_mm: 3,
})

const TEMPERING_RATE = 150
const TAX_RATE = 0.15
const RUSH_RATE = 0.25
const SUGGESTED_LEAD_DAYS = 3

export default function NewOrderPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [catalog, setCatalog] = useState<GlassCatalog[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [lines, setLines] = useState<LineItem[]>([defaultLine()])
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), SUGGESTED_LEAD_DAYS), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ company_name: '', contact_person: '', phone: '', email: '', address: '' })

  const suggestedDate = format(addDays(new Date(), SUGGESTED_LEAD_DAYS), 'yyyy-MM-dd')
  const isRush = deliveryDate < suggestedDate

  useEffect(() => {
    api.get('/glass-catalog/').then(res => setCatalog(res.data.results || res.data))
  }, [])

  useEffect(() => {
    if (customerSearch.length >= 1) {
      api.get(`/customers/?q=${customerSearch}`).then(res => {
        setCustomers(res.data.results || res.data)
        setShowCustomerDropdown(true)
      })
    } else {
      setShowCustomerDropdown(false)
    }
  }, [customerSearch])

  const getCatalog = (id: number | '') => catalog.find(c => c.id === id)

  const getThicknesses = (catalogId: number | ''): ThicknessOption[] => {
    return getCatalog(catalogId)?.thickness_options ?? []
  }

  const calcLine = (line: LineItem) => {
    const cat = getCatalog(line.catalog_id)
    if (!cat || !line.width_mm || !line.height_mm || !line.thickness_mm) return null
    const sqm = (Number(line.width_mm) * Number(line.height_mm)) / 1_000_000 * line.quantity
    const thickOpt = cat.thickness_options.find(t => t.thickness_mm === line.thickness_mm)
    const surcharge = thickOpt ? parseFloat(thickOpt.surcharge_multiplier) : 1
    const material = sqm * parseFloat(cat.base_price_per_sqm) * surcharge
    const cutting = sqm * parseFloat(cat.cutting_rate_per_sqm)
    const tempering = line.tempering_required ? sqm * TEMPERING_RATE : 0
    const lineTotal = material + cutting + tempering
    return { sqm, material, cutting, tempering, lineTotal }
  }

  const totals = lines.reduce((acc, line) => {
    const c = calcLine(line)
    if (!c) return acc
    return {
      sqm: acc.sqm + c.sqm,
      subtotal: acc.subtotal + c.material + c.cutting,
      tempering: acc.tempering + c.tempering,
    }
  }, { sqm: 0, subtotal: 0, tempering: 0 })

  const rushCharge = isRush ? (totals.subtotal + totals.tempering) * RUSH_RATE : 0
  const preTax = totals.subtotal + totals.tempering + rushCharge
  const taxAmount = preTax * TAX_RATE
  const grandTotal = preTax + taxAmount

  const updateLine = (id: string, field: keyof LineItem, value: unknown) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: value }
      // Reset thickness if catalog changes
      if (field === 'catalog_id') updated.thickness_mm = ''
      // Reset tempering if not allowed
      if (field === 'thickness_mm') {
        const cat = getCatalog(updated.catalog_id)
        const thickOpt = cat?.thickness_options.find(t => t.thickness_mm === value)
        if (thickOpt && !thickOpt.tempering_allowed) updated.tempering_required = false
      }
      return updated
    }))
  }

  const validateLines = () => {
    for (const line of lines) {
      const cat = getCatalog(line.catalog_id)
      if (!cat || !line.width_mm || !line.height_mm || !line.thickness_mm) {
        toast.error('Please complete all line items')
        return false
      }
      if (Number(line.width_mm) > cat.max_width_mm || Number(line.height_mm) > cat.max_height_mm) {
        toast.error(`Dimensions exceed maximum for ${cat.name}`)
        return false
      }
    }
    return true
  }

  const handleSubmit = async () => {
    if (!selectedCustomer) { toast.error('Please select a customer'); return }
    if (!validateLines()) return

    setSubmitting(true)
    try {
      const payload = {
        customer: selectedCustomer.id,
        delivery_deadline: deliveryDate,
        notes,
        items: lines.map(l => ({
          catalog: l.catalog_id,
          thickness_mm: l.thickness_mm,
          width_mm: l.width_mm,
          height_mm: l.height_mm,
          quantity: l.quantity,
          tempering_required: l.tempering_required,
          cutting_allowance_mm: l.cutting_allowance_mm,
        })),
      }
      const res = await api.post('/orders/', payload)
      toast.success(`Order ${res.data.order_number} confirmed!`)
      navigate(`/staff/orders/${res.data.id}`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown } }
      toast.error('Failed to create order. Please check all fields.')
      console.error(error.response?.data)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateCustomer = async () => {
    try {
      const res = await api.post('/customers/', newCustomer)
      setSelectedCustomer(res.data)
      setCustomerSearch(res.data.company_name)
      setShowNewCustomerModal(false)
      setNewCustomer({ company_name: '', contact_person: '', phone: '', email: '', address: '' })
      toast.success('Customer created!')
    } catch {
      toast.error('Failed to create customer')
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
        <p className="text-gray-500 text-sm mt-1">Fill in the details to create a new glass order</p>
      </div>

      <div className="space-y-6">
        {/* Customer Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">1</span>
            Customer
          </h2>
          <div className="relative">
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div>
                  <p className="font-semibold text-blue-800">{selectedCustomer.company_name}</p>
                  <p className="text-sm text-blue-600">{selectedCustomer.contact_person} · {selectedCustomer.phone}</p>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="text-blue-400 hover:text-blue-600">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search customer by name..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {showCustomerDropdown && customers.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.company_name); setShowCustomerDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm"
                        >
                          <span className="font-medium">{c.company_name}</span>
                          <span className="text-gray-500 ml-2">{c.contact_person}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowNewCustomerModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-blue-300 text-blue-600 rounded-lg text-sm hover:bg-blue-50 font-medium whitespace-nowrap"
                >
                  <Plus size={16} /> Add New
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Order Lines */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">2</span>
            Glass Items
          </h2>

          <div className="space-y-4">
            {lines.map((line, idx) => {
              const cat = getCatalog(line.catalog_id)
              const calcs = calcLine(line)
              const thickOpts = getThicknesses(line.catalog_id)
              const selectedThick = thickOpts.find(t => t.thickness_mm === line.thickness_mm)
              const tempeingEligible = selectedThick?.tempering_allowed ?? false
              const widthExceeds = cat && line.width_mm && Number(line.width_mm) > cat.max_width_mm
              const heightExceeds = cat && line.height_mm && Number(line.height_mm) > cat.max_height_mm
              const furnaceWarn = line.tempering_required && line.width_mm && line.height_mm &&
                (Number(line.width_mm) > 2400 || Number(line.height_mm) > 3600)

              return (
                <div key={line.id} className={`rounded-lg border p-4 ${widthExceeds || heightExceeds ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Item {idx + 1}</span>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(l => l.filter(x => x.id !== line.id))} className="text-red-400 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Glass Type */}
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Glass Type</label>
                      <select
                        value={line.catalog_id}
                        onChange={e => updateLine(line.id, 'catalog_id', Number(e.target.value) || '')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select glass type...</option>
                        {catalog.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Thickness */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
                      <select
                        value={line.thickness_mm}
                        onChange={e => updateLine(line.id, 'thickness_mm', Number(e.target.value) || '')}
                        disabled={!line.catalog_id}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
                      >
                        <option value="">Select...</option>
                        {thickOpts.map(t => (
                          <option key={t.id} value={t.thickness_mm}>{t.thickness_mm}mm</option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Qty (pcs)</label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={e => updateLine(line.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Width */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Width (mm) {cat && <span className="text-gray-400">max {cat.max_width_mm}</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={line.width_mm}
                        onChange={e => updateLine(line.id, 'width_mm', parseInt(e.target.value) || '')}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${widthExceeds ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      {widthExceeds && <p className="text-xs text-red-600 mt-0.5">Exceeds max width!</p>}
                    </div>

                    {/* Height */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Height (mm) {cat && <span className="text-gray-400">max {cat.max_height_mm}</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={line.height_mm}
                        onChange={e => updateLine(line.id, 'height_mm', parseInt(e.target.value) || '')}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${heightExceeds ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                      {heightExceeds && <p className="text-xs text-red-600 mt-0.5">Exceeds max height!</p>}
                    </div>

                    {/* Production size */}
                    {line.width_mm && line.height_mm && (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Rough Cut Size (factory use)</label>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800 font-mono">
                          {Number(line.width_mm) + line.cutting_allowance_mm} × {Number(line.height_mm) + line.cutting_allowance_mm} mm
                          <span className="text-yellow-600 text-xs ml-2">(+{line.cutting_allowance_mm}mm allowance)</span>
                        </div>
                      </div>
                    )}

                    {/* Tempering Toggle */}
                    <div className="col-span-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => tempeingEligible && updateLine(line.id, 'tempering_required', !line.tempering_required)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          line.tempering_required ? 'bg-blue-600' : 'bg-gray-300'
                        } ${!tempeingEligible ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${line.tempering_required ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <span className="text-sm font-medium text-gray-700">
                        Tempering Required
                        {!tempeingEligible && line.thickness_mm && (
                          <span className="text-xs text-red-500 ml-2">Not allowed for this glass/thickness</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Furnace warning */}
                  {furnaceWarn && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={15} />
                      This size may not fit the tempering furnace. Production must manually confirm.
                    </div>
                  )}

                  {/* Line calc */}
                  {calcs && (
                    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-600">
                      <span>Area: <strong>{calcs.sqm.toFixed(3)} m²</strong></span>
                      <span>Material: <strong>ETB {calcs.material.toFixed(2)}</strong></span>
                      <span>Cutting: <strong>ETB {calcs.cutting.toFixed(2)}</strong></span>
                      {calcs.tempering > 0 && <span>Tempering: <strong>ETB {calcs.tempering.toFixed(2)}</strong></span>}
                      <span className="font-bold text-gray-800 ml-auto">Line Total: ETB {calcs.lineTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setLines(l => [...l, defaultLine()])}
            className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-800 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
          >
            <Plus size={15} /> Add Another Line
          </button>
        </div>

        {/* Delivery & Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">3</span>
            Delivery & Notes
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Date
                <span className="text-gray-400 text-xs ml-2">Suggested: {format(addDays(new Date(), SUGGESTED_LEAD_DAYS), 'MMM d, yyyy')}</span>
              </label>
              <input
                type="date"
                value={deliveryDate}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setDeliveryDate(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isRush ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`}
              />
              {isRush && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-yellow-700">
                  <Zap size={12} /> Rush order — 25% surcharge applies. Manager approval required.
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Special instructions, delivery notes..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">4</span>
            Pricing Summary
          </h2>
          <div className="max-w-sm ml-auto space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Total Area</span>
              <span className="font-medium">{totals.sqm.toFixed(3)} m²</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (Material + Cutting)</span>
              <span>ETB {totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.tempering > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tempering Charges</span>
                <span>ETB {totals.tempering.toFixed(2)}</span>
              </div>
            )}
            {isRush && (
              <div className="flex justify-between text-yellow-700 font-medium">
                <span className="flex items-center gap-1"><Zap size={13} /> Rush Surcharge (25%)</span>
                <span>ETB {rushCharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Tax (15%)</span>
              <span>ETB {taxAmount.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between text-xl font-bold text-gray-900">
              <span>TOTAL</span>
              <span>ETB {grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button onClick={() => navigate('/staff/orders')} className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedCustomer || lines.some(l => !l.catalog_id)}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Confirming...' : 'Confirm Order'}
          </button>
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-lg">Add New Customer</h3>
              <button onClick={() => setShowNewCustomerModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {(['company_name', 'contact_person', 'phone', 'email', 'address'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{field.replace('_', ' ')}</label>
                  <input
                    type="text"
                    value={newCustomer[field]}
                    onChange={e => setNewCustomer(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowNewCustomerModal(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateCustomer} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                Create Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
