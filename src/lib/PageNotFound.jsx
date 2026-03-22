import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <h1 className="text-2xl font-bold text-slate-700">Página não encontrada</h1>
      <Link to="/Products" className="text-blue-500 hover:underline">
        Voltar para o início
      </Link>
    </div>
  );
}
