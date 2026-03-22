import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Reports() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['salesReport', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSalesReport', { startDate, endDate });
      return response?.data || response;
    },
    enabled: false
  });

  const { data: lossesData, isLoading: lossesLoading } = useQuery({
    queryKey: ['lossesReport', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getLossesReport', { startDate, endDate });
      return response?.data || response;
    },
    enabled: false
  });

  const handleSearch = () => refetch();

  const chartData = salesData?.por_dia?.slice(0, 30).map(d => ({
    data: format(new Date(d.data), 'dd/MM'),
    vendas: parseFloat(d.total || 0).toFixed(2)
  })) || [];

  const topProducts = salesData?.por_produto?.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-1">Análise de vendas e perdas</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">Data inicial</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">Data final</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
            </div>
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? 'Carregando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {salesData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500">Total de Vendas</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {parseFloat(salesData.total_geral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500">Registros</p>
                <p className="text-2xl font-bold text-blue-600">
                  {(salesData.total_registros || 0).toLocaleString('pt-BR')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500">Ticket Médio</p>
                <p className="text-2xl font-bold text-purple-600">
                  R$ {parseFloat(salesData.ticket_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>

          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Vendas por dia</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="data" />
                    <YAxis />
                    <Tooltip formatter={(v) => `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                    <Bar dataKey="vendas" fill="#3b82f6" name="Vendas" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {topProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="text-left py-2 px-3">#</th>
                        <th className="text-left py-2 px-3">Produto</th>
                        <th className="text-left py-2 px-3">Setor</th>
                        <th className="text-right py-2 px-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                          <td className="py-2 px-3 font-medium">{p.produto_nome || p.nome}</td>
                          <td className="py-2 px-3 text-slate-500">{p.setor}</td>
                          <td className="py-2 px-3 text-right font-medium text-green-600">
                            R$ {parseFloat(p.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}