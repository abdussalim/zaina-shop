import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { productInputSchema, type ProductInput } from '@zaina/shared'

import type { Category, Product } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'

interface ProductFormValues {
  sku: string
  barcode: string
  name: string
  categoryId: string
  location: string
  baseUnit: string
  costPrice: number
  salePrice: number
  minimumStock: number
  imageUrl: string
  defaultUnitIndex: number
  units: {
    id?: string
    name: string
    factor: number
    salePrice: number
  }[]
}

export function ProductForm({
  categories,
  product,
  defaultMinimumStock = 5,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  categories: Category[]
  product?: Product | undefined
  defaultMinimumStock?: number | undefined
  pending: boolean
  serverError?: string | undefined
  onSubmit: (input: ProductInput) => void
  onCancel: () => void
}) {
  const [validationError, setValidationError] = useState<string>()
  const form = useForm<ProductFormValues>({
    defaultValues: defaults(product, categories, defaultMinimumStock),
  })
  const units = useFieldArray({ control: form.control, name: 'units' })
  const baseUnit = form.watch('baseUnit')
  const baseSalePrice = form.watch('salePrice')

  useEffect(() => {
    if (baseUnit.trim()) form.setValue('units.0.name', baseUnit)
  }, [baseUnit, form])

  useEffect(() => {
    form.setValue('units.0.salePrice', Number.isFinite(baseSalePrice) ? baseSalePrice : 0)
  }, [baseSalePrice, form])

  function submit(values: ProductFormValues) {
    setValidationError(undefined)
    const candidate = {
      sku: values.sku,
      barcode: values.barcode,
      name: values.name,
      categoryId: values.categoryId,
      location: values.location,
      baseUnit: values.baseUnit,
      costPrice: values.costPrice,
      salePrice: values.salePrice,
      minimumStock: values.minimumStock,
      imageUrl: values.imageUrl,
      units: values.units.map((unit, index) => ({
        ...unit,
        isDefault: index === Number(values.defaultUnitIndex),
      })),
    }
    const parsed = productInputSchema.safeParse(candidate)
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Data barang belum lengkap')
      return
    }
    onSubmit(parsed.data)
  }

  return (
    <form className="form-stack" onSubmit={form.handleSubmit(submit)} noValidate>
      <div className="form-grid form-grid--2">
        <label className="form-field"><span>Nama barang</span><input autoFocus {...form.register('name', { required: true })} /></label>
        <label className="form-field"><span>Kategori</span><select {...form.register('categoryId', { required: true })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="form-field"><span>SKU</span><input {...form.register('sku', { required: true })} /></label>
        <label className="form-field"><span>Barcode (opsional)</span><input {...form.register('barcode')} /></label>
        <label className="form-field"><span>Lokasi rak</span><input placeholder="Contoh: Rak A1" {...form.register('location')} /></label>
        <label className="form-field"><span>Satuan dasar</span><input placeholder="buah" {...form.register('baseUnit', { required: true })} /></label>
        <label className="form-field"><span>Harga modal / satuan dasar</span><input type="number" min="0" {...form.register('costPrice', { valueAsNumber: true })} /></label>
        <label className="form-field"><span>Harga jual / satuan dasar</span><input type="number" min="0" {...form.register('salePrice', { valueAsNumber: true })} /></label>
        <label className="form-field"><span>Batas stok minimum</span><input type="number" min="0" step="0.001" {...form.register('minimumStock', { valueAsNumber: true })} /></label>
        <label className="form-field"><span>URL foto (opsional)</span><input type="url" {...form.register('imageUrl')} /></label>
      </div>

      <section className="unit-builder">
        <div className="section-heading section-heading--compact">
          <div><h3>Satuan penjualan</h3><p>Faktor menyatakan berapa satuan dasar yang keluar dari stok.</p></div>
          <Button type="button" variant="secondary" size="small" icon={<Plus />} onClick={() => units.append({ name: '', factor: 1, salePrice: 0 })}>Tambah satuan</Button>
        </div>
        <div className="unit-builder__rows">
          {units.fields.map((field, index) => (
            <div className="unit-row" key={field.id}>
              <input type="hidden" {...form.register(`units.${index}.id`)} />
              <label><span>Default</span><input type="radio" value={index} {...form.register('defaultUnitIndex', { valueAsNumber: true })} aria-label={`Jadikan satuan ${index + 1} default`} /></label>
              <label><span>Nama</span><input {...form.register(`units.${index}.name`, { required: true })} readOnly={index === 0} /></label>
              <label><span>Faktor</span><input type="number" min="0.001" step="0.001" {...form.register(`units.${index}.factor`, { valueAsNumber: true })} readOnly={index === 0} /></label>
              <label><span>Harga jual</span><input type="number" min="0" {...form.register(`units.${index}.salePrice`, { valueAsNumber: true })} readOnly={index === 0} /></label>
              <button type="button" className="icon-button" disabled={index === 0} onClick={() => units.remove(index)} aria-label={`Hapus satuan ${index + 1}`}><Trash2 /></button>
            </div>
          ))}
        </div>
      </section>

      {validationError || serverError ? <div className="form-alert" role="alert">{validationError ?? serverError}</div> : null}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Batal</Button>
        <Button type="submit" pending={pending}>{product ? 'Simpan perubahan' : 'Tambah barang'}</Button>
      </div>
    </form>
  )
}

function defaults(
  product: Product | undefined,
  categories: Category[],
  defaultMinimumStock: number,
): ProductFormValues {
  if (product) {
    const orderedUnits = [
      ...product.units.filter(
        (unit) => unit.factor === 1 && unit.name.toLocaleLowerCase('id-ID') === product.baseUnit.toLocaleLowerCase('id-ID'),
      ),
      ...product.units.filter(
        (unit) => !(unit.factor === 1 && unit.name.toLocaleLowerCase('id-ID') === product.baseUnit.toLocaleLowerCase('id-ID')),
      ),
    ]
    return {
      sku: product.sku,
      barcode: product.barcode ?? '',
      name: product.name,
      categoryId: product.categoryId,
      location: product.location ?? '',
      baseUnit: product.baseUnit,
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      minimumStock: product.minimumStock,
      imageUrl: product.imageUrl ?? '',
      defaultUnitIndex: Math.max(0, orderedUnits.findIndex((unit) => unit.isDefault)),
      units: orderedUnits.map(({ id, name, factor, salePrice }) => ({ id, name, factor, salePrice })),
    }
  }
  return {
    sku: '',
    barcode: '',
    name: '',
    categoryId: categories[0]?.id ?? '',
    location: '',
    baseUnit: 'buah',
    costPrice: 0,
    salePrice: 0,
    minimumStock: defaultMinimumStock,
    imageUrl: '',
    defaultUnitIndex: 0,
    units: [{ name: 'buah', factor: 1, salePrice: 0 }],
  }
}
