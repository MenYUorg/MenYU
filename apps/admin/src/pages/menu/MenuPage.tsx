import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useMenuStore } from '../../store/menuStore'
import { ItemsTab } from './ItemsTab'
import { CategoriasTab } from './CategoriasTab'
import { IngredientesTab } from './IngredientesTab'

type Tab = 'items' | 'categorias' | 'ingredientes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'items', label: 'Ítems del menú' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'ingredientes', label: 'Ingredientes' },
]

export function MenuPage() {
  const [activeTab, setActiveTab] = useState<Tab>('items')
  const { selectedMarcaId, selectedRestauranteId } = useAuthStore()
  const { fetchItems, fetchCategorias, fetchIngredientes, error, clearError } = useMenuStore()

  useEffect(() => {
    if (selectedMarcaId) {
      fetchItems(selectedMarcaId).catch(() => undefined)
    }
  }, [selectedMarcaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRestauranteId) {
      fetchCategorias(selectedRestauranteId).catch(() => undefined)
      fetchIngredientes(selectedRestauranteId).catch(() => undefined)
    }
  }, [selectedRestauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-6 py-6">
      {error && (
        <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-100 rounded-md px-4 py-2.5">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-600 text-lg leading-none ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'items' && <ItemsTab />}
      {activeTab === 'categorias' && <CategoriasTab />}
      {activeTab === 'ingredientes' && <IngredientesTab />}
    </div>
  )
}
