import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { productInputSchema, type ProductInput } from '@zaina/shared'
import { z } from 'zod'

import { uploadImage } from '../../api/client.js'
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
    id?: string | undefined
    name: string
    factor: number
    salePrice: number
    discountType: 'PERCENTAGE' | 'FIXED'
    minimumDiscount: number
    maximumDiscount: number
  }[]
}

const productFormSchema = z
  .object({
    sku: z.string(),
    barcode: z.string(),
    name: z.string(),
    categoryId: z.string(),
    location: z.string(),
    baseUnit: z.string(),
    costPrice: z.number({ error: 'Harga modal wajib diisi' }),
    salePrice: z.number({ error: 'Harga jual wajib diisi' }),
    minimumStock: z.number({ error: 'Batas stok wajib diisi' }),
    imageUrl: z.string(),
    defaultUnitIndex: z.number().int().min(0),
    units: z
      .array(
        z.object({
          id: z.union([z.uuid(), z.literal('')])
            .optional()
            .transform((value) => value === '' ? undefined : value),
          name: z.string(),
          factor: z.number({ error: 'Faktor satuan wajib diisi' }),
          salePrice: z.number({ error: 'Harga satuan wajib diisi' }),
          discountType: z.enum(['PERCENTAGE', 'FIXED']),
          minimumDiscount: z.number({ error: 'Diskon minimum wajib diisi' }),
          maximumDiscount: z.number({ error: 'Diskon maksimum wajib diisi' }),
        }),
      )
      .min(1),
  })
  .superRefine((values, context) => {
    const parsed = productInputSchema.safeParse(toProductInputCandidate(values))
    if (parsed.success) return
    for (const issue of parsed.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  })

export function ProductForm({
  categories,
  product,
  defaultMinimumStock = 5,
  pending,
  canWrite = true,
  disabledReason,
  serverError,
  onSubmit,
  onCancel,
}: {
  categories: Category[]
  product?: Product | undefined
  defaultMinimumStock?: number | undefined
  pending: boolean
  canWrite?: boolean
  disabledReason?: string
  serverError?: string | undefined
  onSubmit: (input: ProductInput) => void
  onCancel: () => void
}) {
  const form = useForm<
    ProductFormValues,
    unknown,
    z.output<typeof productFormSchema>
  >({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaults(product, categories, defaultMinimumStock),
  })
  const units = useFieldArray({ control: form.control, name: 'units' })
  const baseUnit = form.watch('baseUnit')
  const baseSalePrice = form.watch('salePrice')
  const imageUrl = form.watch('imageUrl')
  const unitValues = form.watch('units')
  const unitsError = firstFieldError(form.formState.errors.units)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setIsUploading(true)
    try {
      const url = await uploadImage(file)
      form.setValue('imageUrl', url, { shouldValidate: true, shouldDirty: true })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengunggah gambar')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (baseUnit.trim()) form.setValue('units.0.name', baseUnit)
  }, [baseUnit, form])

  useEffect(() => {
    form.setValue('units.0.salePrice', Number.isFinite(baseSalePrice) ? baseSalePrice : 0)
  }, [baseSalePrice, form])

  function submit(values: z.output<typeof productFormSchema>) {
    onSubmit(productInputSchema.parse(toProductInputCandidate(values)))
  }

  return (
    <form className="form-stack" onSubmit={form.handleSubmit(submit)} noValidate>
      <fieldset disabled={!canWrite} className="form-stack form-fieldset">
      <div className="form-grid form-grid--2">
        <label className="form-field"><span>Nama barang</span><input {...form.register('name')} />{form.formState.errors.name ? <small className="field__message--error">{form.formState.errors.name.message}</small> : null}</label>
        <label className="form-field"><span>Kategori</span><select {...form.register('categoryId')}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{form.formState.errors.categoryId ? <small className="field__message--error">{form.formState.errors.categoryId.message}</small> : null}</label>
        <label className="form-field"><span>SKU</span><input {...form.register('sku')} />{form.formState.errors.sku ? <small className="field__message--error">{form.formState.errors.sku.message}</small> : null}</label>
        <label className="form-field"><span>Barcode (opsional)</span><input {...form.register('barcode')} /></label>
        <label className="form-field"><span>Lokasi rak</span><input placeholder="Contoh: Rak A1" {...form.register('location')} /></label>
        <label className="form-field"><span>Satuan dasar</span><input placeholder="buah" {...form.register('baseUnit')} />{form.formState.errors.baseUnit ? <small className="field__message--error">{form.formState.errors.baseUnit.message}</small> : null}</label>
        <label className="form-field"><span>Harga modal / satuan dasar</span><input type="number" min="0" {...form.register('costPrice', { valueAsNumber: true })} />{form.formState.errors.costPrice ? <small className="field__message--error">{form.formState.errors.costPrice.message}</small> : null}</label>
        <label className="form-field"><span>Harga jual / satuan dasar</span><input type="number" min="0" {...form.register('salePrice', { valueAsNumber: true })} />{form.formState.errors.salePrice ? <small className="field__message--error">{form.formState.errors.salePrice.message}</small> : null}</label>
        <label className="form-field"><span>Batas stok minimum</span><input type="number" min="0" step="0.001" {...form.register('minimumStock', { valueAsNumber: true })} />{form.formState.errors.minimumStock ? <small className="field__message--error">{form.formState.errors.minimumStock.message}</small> : null}</label>
        <div className="form-field" style={{ gridColumn: '1 / -1' }}>
          <span>Foto barang (opsional)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {imageUrl ? (
              <div style={{ position: 'relative', width: '5.5rem', height: '5.5rem', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--paper-muted, #f4f4f4)', flexShrink: 0 }}>
                <img src={imageUrl} alt="Foto produk" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => form.setValue('imageUrl', '', { shouldDirty: true })}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  title="Hapus gambar"
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                size="small"
                pending={isUploading}
                disabled={!canWrite || isUploading}
                icon={<Upload size={16} />}
                onClick={() => fileInputRef.current?.click()}
              >
                {imageUrl ? 'Ganti foto' : 'Pilih & unggah foto ke R2'}
              </Button>
              {uploadError ? <small className="field__message--error">{uploadError}</small> : null}
              <small style={{ color: 'var(--ink-soft)' }}>Format JPG, PNG, WEBP, atau GIF (maks. 5 MB)</small>
            </div>
          </div>
          <input type="hidden" {...form.register('imageUrl')} />
        </div>
      </div>

      <section className="unit-builder">
        <div className="section-heading section-heading--compact">
          <div><h3>Satuan penjualan</h3><p>Faktor menyatakan berapa satuan dasar yang keluar dari stok.</p></div>
          <Button type="button" variant="secondary" size="small" icon={<Plus />} onClick={() => units.append({ name: '', factor: 1, salePrice: 0, discountType: 'PERCENTAGE', minimumDiscount: 0, maximumDiscount: 0 })}>Tambah satuan</Button>
        </div>
        <div className="unit-builder__rows">
          {units.fields.map((field, index) => (
            <div className="unit-row" key={field.id}>
              <input type="hidden" {...form.register(`units.${index}.id`)} />
              <label><span>Default</span><input type="radio" value={index} {...form.register('defaultUnitIndex', { valueAsNumber: true })} aria-label={`Jadikan satuan ${index + 1} default`} /></label>
              <label><span>Nama</span><input {...form.register(`units.${index}.name`)} readOnly={index === 0} />{form.formState.errors.units?.[index]?.name ? <small className="field__message--error">{form.formState.errors.units[index]?.name?.message}</small> : null}</label>
              <label><span>Faktor</span><input type="number" min="0.001" step="0.001" {...form.register(`units.${index}.factor`, { valueAsNumber: true })} readOnly={index === 0} />{form.formState.errors.units?.[index]?.factor ? <small className="field__message--error">{form.formState.errors.units[index]?.factor?.message}</small> : null}</label>
              <label><span>Harga jual</span><input type="number" min="0" {...form.register(`units.${index}.salePrice`, { valueAsNumber: true })} readOnly={index === 0} />{form.formState.errors.units?.[index]?.salePrice ? <small className="field__message--error">{form.formState.errors.units[index]?.salePrice?.message}</small> : null}</label>
              <div className="unit-row__discount">
                <label><span>Jenis diskon</span><select aria-label={`Jenis diskon satuan ${index + 1}`} {...form.register(`units.${index}.discountType`)}><option value="PERCENTAGE">Persentase (%)</option><option value="FIXED">Nominal (Rp)</option></select>{form.formState.errors.units?.[index]?.discountType ? <small className="field__message--error">{form.formState.errors.units[index]?.discountType?.message}</small> : null}</label>
                <label><span>Diskon minimum</span><input aria-label={`Diskon minimum satuan ${index + 1}`} type="number" min="0" step={unitValues[index]?.discountType === 'FIXED' ? '1' : '0.001'} {...form.register(`units.${index}.minimumDiscount`, { valueAsNumber: true })} />{form.formState.errors.units?.[index]?.minimumDiscount ? <small className="field__message--error">{form.formState.errors.units[index]?.minimumDiscount?.message}</small> : null}</label>
                <label><span>Diskon maksimum</span><input aria-label={`Diskon maksimum satuan ${index + 1}`} type="number" min="0" step={unitValues[index]?.discountType === 'FIXED' ? '1' : '0.001'} {...form.register(`units.${index}.maximumDiscount`, { valueAsNumber: true })} />{form.formState.errors.units?.[index]?.maximumDiscount ? <small className="field__message--error">{form.formState.errors.units[index]?.maximumDiscount?.message}</small> : null}</label>
              </div>
              <button type="button" className="icon-button" disabled={index === 0} onClick={() => units.remove(index)} aria-label={`Hapus satuan ${index + 1}`}><Trash2 /></button>
            </div>
          ))}
        </div>
        {unitsError ? <div className="form-alert" role="alert">{unitsError}</div> : null}
      </section>

      {serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}
      </fieldset>
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Batal</Button>
        <Button type="submit" pending={pending} disabled={!canWrite} disabledReason={disabledReason}>{product ? 'Simpan perubahan' : 'Tambah barang'}</Button>
      </div>
    </form>
  )
}

function firstFieldError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  if ('message' in error && typeof error.message === 'string') return error.message
  if ('root' in error) return firstFieldError(error.root)
  return undefined
}

function toProductInputCandidate(values: ProductFormValues) {
  return {
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
      units: orderedUnits.map(({ id, name, factor, salePrice, discountType, minimumDiscount, maximumDiscount }) => ({
        id,
        name,
        factor,
        salePrice,
        discountType,
        minimumDiscount,
        maximumDiscount,
      })),
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
    units: [{
      name: 'buah',
      factor: 1,
      salePrice: 0,
      discountType: 'PERCENTAGE',
      minimumDiscount: 0,
      maximumDiscount: 0,
    }],
  }
}
