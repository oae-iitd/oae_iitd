import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuth } from '../../hooks/auth/useAuth';
import { StateBanner } from '../common';

type LoginErrBody = {
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
};

function loginErrorMessage(err: unknown): string {
  const fallback = 'Invalid credentials. Please try again.';
  if (!isAxiosError(err)) return fallback;

  const status = err.response?.status;
  const data = err.response?.data as LoginErrBody | undefined;

  if (data?.message) {
    let msg = data.message;
    if (data.details) {
      const parts = Object.values(data.details).flat();
      if (parts.length > 0) {
        msg = Array.isArray(parts[0]) ? parts[0].join(', ') : parts.join(', ');
      }
    }
    return msg;
  }
  if (data?.error === 'platform_role_mismatch') {
    return 'This account cannot sign in on the admin website. Use the mobile app for Student/Driver accounts.';
  }
  if (data?.error) return String(data.error);
  if (status === 401)
    return 'Invalid credentials. Please check your email/username and password.';
  if (status === 400) return 'Invalid request. Please check your input.';
  if (status === 403)
    return 'Access denied on the admin site. Use an Admin or SuperAdmin account.';
  if (status && status >= 500) return 'Server error. Please try again later.';
  if (!err.response) {
    const msg = err.message ?? '';
    if (
      err.code === 'ECONNREFUSED' ||
      msg.includes('Network Error') ||
      msg.includes('Failed to fetch')
    ) {
      return 'Cannot reach the API. Check the server, CORS, and VITE_API_URL / VITE_DEV_USE_PROXY.';
    }
    if (msg) return `Network error: ${msg}`;
  }
  return fallback;
}

/** Minimal inline SVG icons — no extra dependencies */
const IconUser = () => (
  <svg className="login-form__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 9a7 7 0 1 1 14 0H3Z"
      fill="currentColor" />
  </svg>
);

const IconLock = () => (
  <svg className="login-form__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd"
      d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
      fill="currentColor" />
  </svg>
);

const IconEye = ({ crossed }: { crossed: boolean }) =>
  crossed ? (
    <svg className="login-form__toggle-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.703 1.129 1.129 0 0 0 0-.704A10.034 10.034 0 0 0 9.999 3a9.958 9.958 0 0 0-4.744 1.19L3.28 2.22ZM7.752 6.69l1.41 1.411a2.5 2.5 0 0 1 3.236 3.236l1.411 1.411A4 4 0 0 0 7.752 6.69Z"
        fill="currentColor" />
      <path d="M10.748 13.708l2.354 2.355A9.958 9.958 0 0 1 10 17c-4.638 0-8.573-3.007-9.963-7.178a1.128 1.128 0 0 1 0-.704 10.06 10.06 0 0 1 3.022-4.568L7.753 6.69a4 4 0 0 0 2.995 7.018Z"
        fill="currentColor" />
    </svg>
  ) : (
    <svg className="login-form__toggle-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd"
        d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        fill="currentColor" />
    </svg>
  );

const LoginForm = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login({ identifier, password });
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      console.error('Login error:', err);
      setError(loginErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form" noValidate>
      {error ? (
        <div className="login-form__banner" role="alert">
          <StateBanner variant="error" message={error} onDismiss={() => setError('')} />
        </div>
      ) : null}

      <div className="login-form__field">
        <label className="login-form__label" htmlFor="identifier">
          Email or username
        </label>
        <div className="login-form__input-wrap">
          <IconUser />
          <input
            className="login-form__input"
            type="text"
            id="identifier"
            name="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            placeholder="you@example.com"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="login-form__field">
        <label className="login-form__label" htmlFor="password">
          Password
        </label>
        <div className="login-form__input-wrap">
          <IconLock />
          <input
            className="login-form__input login-form__input--pw"
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            disabled={isLoading}
          />
          <button
            type="button"
            className="login-form__toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            <IconEye crossed={showPassword} />
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="login-form__submit"
        disabled={isLoading || !identifier.trim() || !password}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <span className="login-form__spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
};

export default LoginForm;
