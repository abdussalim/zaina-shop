import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { loginInputSchema, type LoginInput } from '@zaina/shared'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Field } from '../../components/ui/Field.js'
import { Modal } from '../../components/ui/Modal.js'
import type { AuthenticatedUser } from './LoginPage.js'

export function SessionReauthDialog({
  open,
  onAuthenticated,
}: {
  open: boolean
  onAuthenticated: (user: AuthenticatedUser) => void
}) {
  const [formError, setFormError] = useState<string>()
  const form = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) })

  async function submit(input: LoginInput) {
    setFormError(undefined)
    try {
      const user = await apiRequest<AuthenticatedUser>('/api/v1/auth/login', {
        method: 'POST',
        ...jsonBody(input),
      })
      form.reset()
      onAuthenticated(user)
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : 'Koneksi ke server terputus. Periksa jaringan lalu coba lagi.',
      )
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => undefined}
      title="Sesi Anda berakhir"
      description="Masuk kembali untuk melanjutkan. Keranjang dan formulir yang belum dikirim tetap dipertahankan."
      size="small"
      dismissible={false}
    >
      <form className="login-form" noValidate onSubmit={form.handleSubmit(submit)}>
        <Field
          label="Nama pengguna"
          autoComplete="username"
          error={form.formState.errors.username?.message}
          {...form.register('username')}
        />
        <Field
          label="Kata sandi"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {formError ? (
          <div className="form-alert" role="alert">
            <LockKeyhole aria-hidden="true" />
            <span>{formError}</span>
          </div>
        ) : null}
        <Button type="submit" pending={form.formState.isSubmitting}>
          Masuk kembali
        </Button>
      </form>
    </Modal>
  )
}
