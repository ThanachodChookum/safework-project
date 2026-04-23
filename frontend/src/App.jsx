import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import NewsPage from './pages/NewsPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo">
            <div className="nav-logo-icon">🛡</div>
            <span className="nav-logo-text">SafeWork</span>
          </div>

          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            ✦ AI Coworker
          </NavLink>

          <NavLink
            to="/news"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <span className="nav-tab-dot" />
            ข่าวอุบัติเหตุ
          </NavLink>
        </nav>

        <main className="page">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/news" element={<NewsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
