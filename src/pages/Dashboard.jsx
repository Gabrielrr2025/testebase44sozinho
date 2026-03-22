import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate('/Products');
  }, []);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-500">Redirecionando...</p>
    </div>
  );
}