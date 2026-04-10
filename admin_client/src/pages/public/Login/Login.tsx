import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../hooks/auth/useAuth';
import LoginForm from '../../../components/auth/LoginForm';
import { LoadingSpinner, StateBanner } from '../../../components/common';
import disIcon from '../../../assets/images/dis_icon.png';
import './Login.css';

const Login = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSessionExpired] = useState(
    () => searchParams.get('session_expired') === '1'
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (searchParams.get('session_expired') === '1') {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('session_expired');
          return p;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  if (isLoading) {
    return (
      <main className="login login--busy" data-theme="dark">
        <LoadingSpinner message="Checking session…" variant="page" />
      </main>
    );
  }

  return (
    <main className="login" data-theme="dark">
      <div className="login-shell">
        <aside className="login-brand" aria-label="Brand">
          <img
            src={disIcon}
            alt=""
            className="login-brand__bg"
            decoding="async"
            aria-hidden="true"
          />
        </aside>

        <section className="login-panel" aria-label="Sign in">
          <header className="login-panel__header">
            <h2 className="login-panel__title">Welcome back</h2>
            <p className="login-panel__subtitle">
              Sign in with your admin credentials to continue
            </p>
          </header>

          {showSessionExpired ? (
            <div className="login-panel__banner">
              <StateBanner
                variant="warning"
                message="Your session has expired. Please log in again."
              />
            </div>
          ) : null}

          <LoginForm />

          <p className="login-footer">
            <Link to="/" className="login-footer__link">
              ← Back to home
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
};

export default Login;
