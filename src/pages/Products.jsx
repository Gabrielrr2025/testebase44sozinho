import React, { useState } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from 'xlsx';

export default function Products() {
  const queryClient = useQueryClient();

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await base44.functions.invoke('Getproducts', {});
      return response?.data || response;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const products = productsData?.products || (Array.isArray(productsData) ? productsData : []);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    await queryClient.refetchQueries({ queryKey: ['products'] });
  };

  const handleExportExcel = () => {
    try {
      const excelData = products.map(p => ({
        'Código': p.code || '',
        'Nome': p.name || p.nome,
        'Setor': p.sector || p.setor,
        'Rendimento': p.recipe_yield || 1,
        'Unidade': p.unit || 'UN',
        'Ativo': p.active ? 'Sim' : 'Não'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
      XLSX.writeFile(wb, `produtos_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie o catálogo de produtos</p>
        </div>
        <Button variant="outline" onClick={handleExportExcel}>
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-2"></div>
          Carregando produtos...
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg border p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">
              {products.length} produtos cadastrados
            </h2>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              Atualizar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-left py-2 px-3">Nome</th>
                  <th className="text-left py-2 px-3">Setor</th>
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id || i} className="border-b hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="py-2 px-3 font-medium">{p.name || p.nome}</td>
                    <td className="py-2 px-3 text-slate-500">{p.sector || p.setor}</td>
                    <td className="py-2 px-3 text-slate-400">{p.code || '-'}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}