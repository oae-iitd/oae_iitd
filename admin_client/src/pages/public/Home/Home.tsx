import { Link } from 'react-router-dom';
import './Home.css';

const Home = () => (
  <main className="home" data-theme="dark">
    <section className="home-hero" aria-label="Welcome">
      <h1 className="home-hero__title">Welcome</h1>
      <p className="home-hero__lead">
        Sign in to manage rides and access the admin dashboard.
      </p>
      <Link className="home-btn" to="/admin/dashboard">
        Admin Login
      </Link>
    </section>
  </main>
);

export default Home;
