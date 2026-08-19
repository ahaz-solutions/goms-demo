import { useEffect, useState } from 'react'
import api from '../lib/api'
import type { GlassCatalog, ThicknessOption } from '../types'
import {
  Plus, Pencil, Trash2, X, CheckCircle, XCircle, Flame, ChevronDown, ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface CatalogForm {
  name: string
  max_width_mm: string
  max_height_mm: string
  min_width_mm: string
  min_height_mm: string
  base_price_per_sqm: string
  cutting_rate_per_sqm: string
  is_active: boolean
  imageFile: File | null
  imagePreview: string | null
}

interface ThicknessForm {
  thickness_mm: string
  tempering_allowed: boolean
  surcharge_multiplier: string
}

const emptyCatalogForm = (): CatalogForm => ({
  name: '',
  max_width_mm: '2440',
  max_height_mm: '3660',
  min_width_mm: '100',
  min_height_mm: '100',
  base_price_per_sqm: '',
  cutting_rate_per_sqm: '50',
  is_active: true,
  imageFile: null,
  imagePreview: null,
})

const emptyThicknessForm = (): ThicknessForm => ({
  thickness_mm: '',
  tempering_allowed: true,
  surcharge_multiplier: '1.00',
})

// ── Component ────────────────────────────────────────────────────────────────

export default function GlassCatalogPage() {
  const [catalog, setCatalog] = useState<GlassCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Catalog modal
  const [showCatalogModal, setShowCatalogModal] = useState(false)
  const [editingCatalog, setEditingCatalog] = useState<GlassCatalog | null>(null)
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(emptyCatalogForm())
  const [savingCatalog, setSavingCatalog] = useState(false)

  // Thickness modal
  const [showThicknessModal, setShowThicknessModal] = useState(false)
  const [thicknessTargetId, setThicknessTargetId] = useState<number | null>(null)
  const [thicknessTargetName, setThicknessTargetName] = useState('')
  const [thicknessForm, setThicknessForm] = useState<ThicknessForm>(emptyThicknessForm())
  const [savingThickness, setSavingThickness] = useState(false)

  const fetchCatalog = () => {
    setLoading(true)
    api.get(`/glass-catalog/?show_inactive=${showInactive}`)
      .then(res => setCatalog(res.data.results || res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCatalog() }, [showInactive])

  // ── Catalog CRUD ───────────────────────────────────────────────────────────

  const openAddCatalog = () => {
    setEditingCatalog(null)
    setCatalogForm(emptyCatalogForm())
    setShowCatalogModal(true)
  }

  const openEditCatalog = (glass: GlassCatalog) => {
    setEditingCatalog(glass)
    setCatalogForm({
      name: glass.name,
      max_width_mm: String(glass.max_width_mm),
      max_height_mm: String(glass.max_height_mm),
      min_width_mm: String(glass.min_width_mm),
      min_height_mm: String(glass.min_height_mm),
      base_price_per_sqm: String(glass.base_price_per_sqm),
      cutting_rate_per_sqm: String(glass.cutting_rate_per_sqm),
      is_active: glass.is_active,
      imageFile: null,
      imagePreview: glass.image_url ?? null,
    })
    setShowCatalogModal(true)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCatalogForm(p => ({
      ...p,
      imageFile: file,
      imagePreview: URL.createObjectURL(file),
    }))
  }

  const saveCatalog = async () => {
    if (!catalogForm.name.trim() || !catalogForm.base_price_per_sqm) {
      toast.error('Name and base price are required')
      return
    }
    setSavingCatalog(true)
    try {
      // Use FormData to support file upload
      const fd = new FormData()
      fd.append('name', catalogForm.name)
      fd.append('max_width_mm', catalogForm.max_width_mm)
      fd.append('max_height_mm', catalogForm.max_height_mm)
      fd.append('min_width_mm', catalogForm.min_width_mm)
      fd.append('min_height_mm', catalogForm.min_height_mm)
      fd.append('base_price_per_sqm', catalogForm.base_price_per_sqm)
      fd.append('cutting_rate_per_sqm', catalogForm.cutting_rate_per_sqm)
      fd.append('is_active', String(catalogForm.is_active))
      if (catalogForm.imageFile) {
        fd.append('image', catalogForm.imageFile)
      }

      if (editingCatalog) {
        await api.patch(`/glass-catalog/${editingCatalog.id}/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success(`${catalogForm.name} updated`)
      } else {
        await api.post('/glass-catalog/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success(`${catalogForm.name} added to catalog`)
      }
      setShowCatalogModal(false)
      fetchCatalog()
    } catch {
      toast.error('Failed to save. Check all fields.')
    } finally {
      setSavingCatalog(false)
    }
  }

  const toggleActive = async (glass: GlassCatalog) => {
    try {
      await api.patch(`/glass-catalog/${glass.id}/`, { is_active: !glass.is_active })
      toast.success(`${glass.name} ${glass.is_active ? 'deactivated' : 'activated'}`)
      fetchCatalog()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const deleteCatalog = async (glass: GlassCatalog) => {
    if (!confirm(`Delete "${glass.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/glass-catalog/${glass.id}/`)
      toast.success(`${glass.name} deleted`)
      fetchCatalog()
    } catch {
      toast.error('Cannot delete — this glass type may be used in existing orders.')
    }
  }

  // ── Thickness CRUD ─────────────────────────────────────────────────────────

  const openAddThickness = (glass: GlassCatalog) => {
    setThicknessTargetId(glass.id)
    setThicknessTargetName(glass.name)
    setThicknessForm(emptyThicknessForm())
    setShowThicknessModal(true)
  }

  const saveThickness = async () => {
    if (!thicknessForm.thickness_mm || !thicknessTargetId) {
      toast.error('Thickness is required')
      return
    }
    setSavingThickness(true)
    try {
      await api.post(`/glass-catalog/${thicknessTargetId}/add_thickness/`, {
        thickness_mm: parseInt(thicknessForm.thickness_mm),
        tempering_allowed: thicknessForm.tempering_allowed,
        surcharge_multiplier: parseFloat(thicknessForm.surcharge_multiplier),
      })
      toast.success(`${thicknessForm.thickness_mm}mm added`)
      setShowThicknessModal(false)
      fetchCatalog()
    } catch {
      toast.error('Failed to add thickness option')
    } finally {
      setSavingThickness(false)
    }
  }

  const removeThickness = async (glassId: number, opt: ThicknessOption, glassName: string) => {
    if (!confirm(`Remove ${opt.thickness_mm}mm from ${glassName}?`)) return
    try {
      await api.delete(`/glass-catalog/${glassId}/remove_thickness/${opt.id}/`)
      toast.success(`${opt.thickness_mm}mm removed`)
      fetchCatalog()
    } catch {
      toast.error('Cannot remove — may be used in existing orders.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Glass Catalog</h1>
          <p className="text-gray-500 text-sm mt-1">{catalog.length} glass types</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive
          </label>
          <button
            onClick={openAddCatalog}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} /> Add Glass Type
          </button>
        </div>
      </div>

      {/* Catalog List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : catalog.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium mb-2">No glass types yet</p>
          <p className="text-sm">Click "Add Glass Type" to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {catalog.map(glass => (
            <div
              key={glass.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                glass.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              {/* Glass card header */}
              <div className="px-5 py-4 flex items-center gap-4">
                <button
                  onClick={() => setExpanded(expanded === glass.id ? null : glass.id)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  {expanded === glass.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 bg-gray-100">
                  {glass.image_url ? (
                    <img src={glass.image_url} alt={glass.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-medium">
                      No img
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-base">{glass.name}</h3>
                    {!glass.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Inactive</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                    <span>Max: {glass.max_width_mm}×{glass.max_height_mm}mm</span>
                    <span>Base: <strong className="text-gray-700">ETB {parseFloat(glass.base_price_per_sqm).toLocaleString()}/m²</strong></span>
                    <span>Cutting: <strong className="text-gray-700">ETB {parseFloat(glass.cutting_rate_per_sqm).toLocaleString()}/m²</strong></span>
                  </div>
                </div>

                {/* Thickness badges */}
                <div className="flex flex-wrap gap-1.5 items-center max-w-xs">
                  {glass.thickness_options.map(t => (
                    <span
                      key={t.id}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        t.tempering_allowed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t.thickness_mm}mm {t.tempering_allowed ? '🔥' : ''}
                    </span>
                  ))}
                  {glass.thickness_options.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No thicknesses</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openAddThickness(glass)}
                    title="Add thickness"
                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => openEditCatalog(glass)}
                    title="Edit"
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => toggleActive(glass)}
                    title={glass.is_active ? 'Deactivate' : 'Activate'}
                    className={`p-2 rounded-lg transition-colors ${
                      glass.is_active
                        ? 'text-green-500 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {glass.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  </button>
                  <button
                    onClick={() => deleteCatalog(glass)}
                    title="Delete"
                    className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Expanded thickness detail */}
              {expanded === glass.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Thickness Options</p>
                    <button
                      onClick={() => openAddThickness(glass)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Plus size={12} /> Add thickness
                    </button>
                  </div>
                  {glass.thickness_options.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No thickness options configured yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {glass.thickness_options
                        .slice()
                        .sort((a, b) => a.thickness_mm - b.thickness_mm)
                        .map(opt => (
                          <div
                            key={opt.id}
                            className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center justify-between group"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-800 text-sm">{opt.thickness_mm}mm</span>
                                {opt.tempering_allowed && (
                                  <Flame size={13} className="text-orange-500" />
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                ×{parseFloat(opt.surcharge_multiplier).toFixed(2)} surcharge
                              </div>
                            </div>
                            <button
                              onClick={() => removeThickness(glass.id, opt, glass.name)}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 transition-opacity"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Dimension details */}
                  <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500">
                    <div><span className="font-medium text-gray-700">Max Width</span><br />{glass.max_width_mm} mm</div>
                    <div><span className="font-medium text-gray-700">Max Height</span><br />{glass.max_height_mm} mm</div>
                    <div><span className="font-medium text-gray-700">Min Width</span><br />{glass.min_width_mm} mm</div>
                    <div><span className="font-medium text-gray-700">Min Height</span><br />{glass.min_height_mm} mm</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Catalog Modal ─────────────────────────────────────────── */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-lg">
                {editingCatalog ? `Edit — ${editingCatalog.name}` : 'Add New Glass Type'}
              </h3>
              <button onClick={() => setShowCatalogModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Glass Type Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Tinted Green, Tempered Clear..."
                  value={catalogForm.name}
                  onChange={e => setCatalogForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Price / m² (ETB) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 350"
                    value={catalogForm.base_price_per_sqm}
                    onChange={e => setCatalogForm(p => ({ ...p, base_price_per_sqm: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cutting Rate / m² (ETB)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 50"
                    value={catalogForm.cutting_rate_per_sqm}
                    onChange={e => setCatalogForm(p => ({ ...p, cutting_rate_per_sqm: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Max dimensions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Dimensions (mm)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Width</label>
                    <input
                      type="number"
                      min="1"
                      value={catalogForm.max_width_mm}
                      onChange={e => setCatalogForm(p => ({ ...p, max_width_mm: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Height</label>
                    <input
                      type="number"
                      min="1"
                      value={catalogForm.max_height_mm}
                      onChange={e => setCatalogForm(p => ({ ...p, max_height_mm: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Min dimensions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Dimensions (mm)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Width</label>
                    <input
                      type="number"
                      min="1"
                      value={catalogForm.min_width_mm}
                      onChange={e => setCatalogForm(p => ({ ...p, min_width_mm: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Height</label>
                    <input
                      type="number"
                      min="1"
                      value={catalogForm.min_height_mm}
                      onChange={e => setCatalogForm(p => ({ ...p, min_height_mm: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Photo</label>
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 flex-shrink-0 flex items-center justify-center">
                    {catalogForm.imagePreview ? (
                      <img src={catalogForm.imagePreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400 text-center px-2">No image</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-xl px-4 py-4 hover:bg-blue-50 transition-colors text-center">
                      <span className="text-sm font-medium text-blue-600">
                        {catalogForm.imagePreview ? 'Change photo' : 'Upload photo'}
                      </span>
                      <span className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 5MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                    {catalogForm.imagePreview && (
                      <button
                        type="button"
                        onClick={() => setCatalogForm(p => ({ ...p, imageFile: null, imagePreview: null }))}
                        className="mt-2 text-xs text-red-500 hover:text-red-700"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCatalogForm(p => ({ ...p, is_active: !p.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    catalogForm.is_active ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {catalogForm.is_active ? 'Active — visible in order form' : 'Inactive — hidden from orders'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCatalogModal(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCatalog}
                disabled={savingCatalog}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingCatalog ? 'Saving...' : editingCatalog ? 'Save Changes' : 'Add to Catalog'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Thickness Modal ────────────────────────────────────────────── */}
      {showThicknessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Add Thickness</h3>
                <p className="text-sm text-gray-500">{thicknessTargetName}</p>
              </div>
              <button onClick={() => setShowThicknessModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thickness (mm) *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 6"
                  value={thicknessForm.thickness_mm}
                  onChange={e => setThicknessForm(p => ({ ...p, thickness_mm: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price Surcharge Multiplier
                  <span className="text-gray-400 font-normal ml-1 text-xs">(1.0 = no surcharge)</span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.05"
                  value={thicknessForm.surcharge_multiplier}
                  onChange={e => setThicknessForm(p => ({ ...p, surcharge_multiplier: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {parseFloat(thicknessForm.surcharge_multiplier || '1') !== 1 && (
                  <p className="text-xs text-blue-600 mt-1">
                    Base price will be multiplied by {parseFloat(thicknessForm.surcharge_multiplier || '1').toFixed(2)}×
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setThicknessForm(p => ({ ...p, tempering_allowed: !p.tempering_allowed }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    thicknessForm.tempering_allowed ? 'bg-orange-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${thicknessForm.tempering_allowed ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Flame size={15} className={thicknessForm.tempering_allowed ? 'text-orange-500' : 'text-gray-300'} />
                  Tempering allowed for this thickness
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowThicknessModal(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveThickness}
                disabled={savingThickness}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingThickness ? 'Adding...' : 'Add Thickness'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
