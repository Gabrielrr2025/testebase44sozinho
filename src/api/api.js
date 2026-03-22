const API_URL = import.meta.env.VITE_API_URL || 'https://testebase44sozinho.onrender.com';

export const api = {
  async dashboard(params) {
    const res = await fetch(`${API_URL}/api/dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return res.json();
  },

  async vendas(params) {
    const res = await fetch(`${API_URL}/api/vendas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return res.json();
  },

  async perdas(params) {
    const res = await fetch(`${API_URL}/api/perdas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return res.json();
  },

  async produtos() {
    const res = await fetch(`${API_URL}/api/produtos`);
    return res.json();
  }
};