import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MapPin, Save, ShieldCheck, Store } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  passwordChangeInputSchema,
  storeSettingsInputSchema,
  type PasswordChangeInput,
  type StoreSettingsInput,
} from '@zaina/shared'
import { z } from 'zod'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import type { StoreSettings } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { LoadingState } from '../../components/ui/States.js'

export function SettingsPage() {
  const settings = useQuery({
    queryKey: ['settings', 'store'],
    queryFn: () => apiRequest<StoreSettings>('/api/v1/settings/store'),
  })
  if (settings.isPending) return <LoadingState label="Membuka pengaturan toko" />
  if (settings.isError) return <div className="form-alert" role="alert">Pengaturan belum dapat dimuat.</div>
  return (
    <div className="page-stack settings-page">
      <PageHeader eyebrow="Administrasi" title="Pengaturan toko" description="Perbarui identitas yang tampil pada operasional dan amankan akun bersama." />
      <div className="settings-grid">
        <StoreForm settings={settings.data} />
        <PasswordForm />
      </div>
    </div>
  )
}

function StoreForm({ settings }: { settings: StoreSettings }) {
  const queryClient = useQueryClient()
  const form = useForm<
    z.input<typeof storeSettingsInputSchema>,
    unknown,
    StoreSettingsInput
  >({
    resolver: zodResolver(storeSettingsInputSchema),
    defaultValues: toStoreInput(settings),
  })
  useEffect(() => form.reset(toStoreInput(settings)), [form, settings])
  const mutation = useMutation({
    mutationFn: (input: StoreSettingsInput) =>
      apiRequest<StoreSettings>('/api/v1/settings/store', {
        method: 'PATCH',
        ...jsonBody(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'store'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
      toast.success('Pengaturan toko disimpan')
    },
  })

  return (
    <section className="settings-panel">
      <div className="settings-panel__heading"><Store /><div><h2>Identitas toko</h2><p>Nama, alamat, dan zona waktu operasional.</p></div></div>
      <form className="form-stack" noValidate onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <label className="form-field"><span>Nama toko</span><input {...form.register('storeName')} />{form.formState.errors.storeName ? <small className="field__message--error">{form.formState.errors.storeName.message}</small> : null}</label>
        <label className="form-field"><span>Alamat</span><textarea rows={3} {...form.register('address')} /></label>
        <div className="form-grid form-grid--2">
          <label className="form-field"><span>Nomor telepon</span><input {...form.register('phone')} /></label>
          <label className="form-field"><span>Zona waktu</span><select {...form.register('timezone')}><option value="Asia/Jakarta">WIB · Jakarta</option><option value="Asia/Makassar">WITA · Makassar</option><option value="Asia/Jayapura">WIT · Jayapura</option></select></label>
        </div>
        <label className="form-field"><span>Batas stok default</span><input type="number" min="0" step="0.001" {...form.register('defaultMinimumStock', { valueAsNumber: true })} /><small>Dipakai sebagai saran ketika menambah barang baru.</small>{form.formState.errors.defaultMinimumStock ? <small className="field__message--error">{form.formState.errors.defaultMinimumStock.message}</small> : null}</label>
        {mutation.error ? <div className="form-alert" role="alert">{mutation.error instanceof ApiClientError ? mutation.error.message : 'Pengaturan belum dapat disimpan.'}</div> : null}
        <div className="form-actions"><Button type="submit" icon={<Save />} pending={mutation.isPending}>Simpan identitas</Button></div>
      </form>
      <div className="settings-footnote"><MapPin /> Perubahan identitas tidak mengubah riwayat transaksi lama.</div>
    </section>
  )
}

function PasswordForm() {
  const queryClient = useQueryClient()
  const form = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeInputSchema) })
  const mutation = useMutation({
    mutationFn: (input: PasswordChangeInput) =>
      apiRequest<void>('/api/v1/settings/password', { method: 'POST', ...jsonBody(input) }),
    onSuccess: async () => {
      form.reset()
      toast.success('Kata sandi akun bersama diperbarui')
      await queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
  return (
    <section className="settings-panel settings-panel--security">
      <div className="settings-panel__heading"><ShieldCheck /><div><h2>Keamanan akun</h2><p>Ganti kata sandi bersama secara berkala.</p></div></div>
      <form className="form-stack" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
        <label className="form-field"><span>Kata sandi saat ini</span><input type="password" autoComplete="current-password" {...form.register('currentPassword')} />{form.formState.errors.currentPassword ? <small className="field__message--error">{form.formState.errors.currentPassword.message}</small> : null}</label>
        <label className="form-field"><span>Kata sandi baru</span><input type="password" autoComplete="new-password" {...form.register('newPassword')} /><small>Minimal 12 karakter dan berbeda dari kata sandi lama.</small>{form.formState.errors.newPassword ? <small className="field__message--error">{form.formState.errors.newPassword.message}</small> : null}</label>
        {mutation.error ? <div className="form-alert" role="alert">{mutation.error instanceof ApiClientError ? mutation.error.message : 'Kata sandi belum dapat diubah.'}</div> : null}
        <div className="form-actions"><Button type="submit" icon={<KeyRound />} pending={mutation.isPending}>Ganti kata sandi</Button></div>
      </form>
      <div className="security-note"><ShieldCheck /><span><strong>Saran keamanan</strong> Simpan kata sandi di pengelola kata sandi dan jangan kirim lewat grup chat.</span></div>
    </section>
  )
}

function toStoreInput(settings: StoreSettings): StoreSettingsInput {
  return {
    storeName: settings.storeName,
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    timezone: settings.timezone,
    defaultMinimumStock: settings.defaultMinimumStock,
  }
}
