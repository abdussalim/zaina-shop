import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LockKeyhole, Wifi } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { loginInputSchema, type LoginInput } from '@zaina/shared'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Field } from '../../components/ui/Field.js'

export interface AuthenticatedUser {
  id: string
  username: string
  displayName: string
}

export function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthenticatedUser) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [success, setSuccess] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) })

  async function submit(input: LoginInput) {
    setFormError(undefined)
    setSuccess(false)
    try {
      const user = await apiRequest<AuthenticatedUser>('/api/v1/auth/login', {
        method: 'POST',
        ...jsonBody(input),
      })
      setSuccess(true)
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
    <main className="login-page">
      <section className="login-story" aria-label="Toko Zaina">
        <div className="brand-lockup brand-lockup--light">
          <span className="brand-seal" aria-hidden="true">
            <span>Z</span>
          </span>
          <span>
            <strong>Toko Zaina</strong>
            <small>Inventaris &amp; penjualan</small>
          </span>
        </div>
        <div className="login-story__copy">
          <p className="eyebrow eyebrow--light">Satu catatan untuk seluruh toko</p>
          <h1>Setiap barang punya tempat. Setiap angka punya jejak.</h1>
          <p>
            Pantau stok per buah, set, atau lusin—tanpa kehilangan riwayat saat
            barang datang, terjual, atau pecah.
          </p>
        </div>
        <div className="shelf-preview" aria-hidden="true">
          <div className="shelf-preview__item">
            <span>Piring kaca</span><strong>24</strong><small>buah · Rak A1</small>
          </div>
          <div className="shelf-preview__item shelf-preview__item--warn">
            <span>Gelas motif</span><strong>6</strong><small>buah · stok tipis</small>
          </div>
          <div className="shelf-preview__item">
            <span>Wajan 24 cm</span><strong>12</strong><small>buah · Rak B1</small>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__inner">
          <div className="login-panel__heading">
            <p className="eyebrow">Akses pengelola</p>
            <h2>Masuk ke ruang toko</h2>
            <p>Gunakan akun bersama yang sudah disiapkan untuk Toko Zaina.</p>
          </div>

          <form onSubmit={handleSubmit(submit)} className="login-form" noValidate>
            <Field
              label="Nama pengguna"
              autoComplete="username"
              autoFocus
              error={errors.username?.message}
              {...register('username')}
            />
            <Field
              label="Kata sandi"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              error={errors.password?.message}
              trailing={
                <button
                  type="button"
                  className="field__reveal"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              }
              {...register('password')}
            />

            {formError ? (
              <div className="form-alert" role="alert">
                <LockKeyhole aria-hidden="true" />
                <span>{formError}</span>
              </div>
            ) : null}
            {success ? (
              <div className="form-success" role="status">Selamat datang kembali</div>
            ) : null}

            <Button type="submit" size="large" pending={isSubmitting}>
              Masuk ke aplikasi
            </Button>
          </form>

          <p className="connection-note">
            <Wifi aria-hidden="true" /> Data tersimpan aman di server toko
          </p>
        </div>
      </section>
    </main>
  )
}
