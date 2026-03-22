import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user] = useState({
    id: '1',
    email: 'admin@empresa.com',
    role: 'admin',
    permissions: {
      dashboard: true, products: true, planning: true,
      calendar: true, reports: true, settings: true, admin: true
    }
  });

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoadingAuth: false }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
