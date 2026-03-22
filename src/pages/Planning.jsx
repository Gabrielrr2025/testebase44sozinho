import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, RefreshCw, Save, Calendar as CalendarIcon } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const getWeekBounds = (date) => {
  const start = startOfWeek(date, { weekStartsOn: 2 });
  const end = endOfWeek(date, { weekStartsOn: 2 });
  return { start, end };
};

export default function Planning() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 2 });
    return addWeeks(currentWeekStart, 1);
  });
  const [plannedQuantities, setPlannedQuantities] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef({});

  const weekBounds = useMemo(() => getWeekBounds(currentDate), [currentDate]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekBounds.start, end: weekBounds.end }), [weekBounds]);
  const startDate = format(weekBounds.start, 'yyyy-MM-dd');
  const endDate = format(weekBounds.end, 'yyyy-MM-dd');

  const planningQuery = useQuery({
    queryKey: ['planningData', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('Getplanningdata', { startDate, endDate });
      return response?.data || response;
    }
  });

  const savedPlanningQuery = useQuery({
    queryKey: ['savedPlanning', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPlanning', { startDate, endDate });
      return response?.data || response;
    }
  });

  useEffect(() => {
    if (savedPlanningQuery.data?.planejamentos) {
      const saved = {};
      savedPlanningQuery.data.planejamentos.forEach(item => {
        const dayIndex = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === item.data);
        if (dayIndex !== -1) {
          saved[`${item.produto_id}-${dayIndex}`] = parseFloat(item.quantidade_planejada);
        }
      });
      setPlannedQuantities(saved);
    }
  }, [savedPlanningQuery.data, weekDays]);

  const saveMutation = useMutation({
    mutationFn: async ({ produto_id, data, quantidade_planejada }) => {
      return base44.functions.invoke('savePlanning', { produto_id, data, quantidade_planejada });
    }
  });

  const planningData = planningQuery.data?.products || [];

  const handleQuantityChange = (productId, dayIndex, value) => {
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;
    setPlannedQuantities(prev => ({ ...prev, [`${productId}-${dayIndex}`]: numValue }));
    setHasUnsavedChanges(true);
    const key = `${productId}-${dayIndex}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(() => {
      saveMutation.mutate({ produto_id: productId, data: format(weekDays[dayIndex], 'yyyy-MM-dd'), quantidade_planejada: numValue });
    }, 1000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const savePromises = Object.entries(plannedQuantities).map(([key, qty]) => {
        const [productId, dayIdx] = key.split('-');
        return base44.functions.invoke('savePlanning', {
          produto_id: productId,
          data: format(weekDays[parseInt(dayIdx)], 'yyyy-MM-dd'),
          quantidade_planejada: qty
        });
      });
      await Promise.all(savePromises);
      setHasUnsavedChanges(false);
      toast.success('✅ Planejamento salvo!');
    } catch (err) {
      toast.error('Erro ao salvar planejamento');
    } finally {
      setIsSaving(false);
    }
  };

  const getProductTotal = (productId) =>
    weekDays.reduce((sum, _, idx) => sum + (plannedQuantities[`${productId}-${idx}`] || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Planejamento de Produção</h1>
          <p className="text-sm text-gray-500 mt-1">Organize a produção semanal</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!hasUnsavedChanges || isSaving}
          className={hasUnsavedChanges ? "bg-green-600 hover:bg-green-700 text-white" : ""}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Salvando..." : hasUnsavedChanges ? "Salvar" : "Salvo ✓"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(prev => subWeeks(prev, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg">
          <CalendarIcon className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-900">
            {format(weekBounds.start, 'dd/MM', { locale: ptBR })} a {format(weekBounds.end, 'dd/MM', { locale: ptBR })}
          </span>
        </div>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(prev => addWeeks(prev, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {planningQuery.isLoading ? (
            <div className="p-8 text-center text-slate-500">Carregando dados...</div>
          ) : planningData.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhum produto encontrado para este período</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Produto</th>
                    <th className="text-center py-3 px-2 font-medium text-slate-600">Setor</th>
                    {weekDays.map((day, idx) => (
                      <th key={idx} className="text-center py-3 px-2 font-medium text-slate-600">
                        <div className="text-xs">{format(day, 'EEE', { locale: ptBR })}</div>
                        <div className="text-xs text-slate-400">{format(day, 'dd/MM')}</div>
                      </th>
                    ))}
                    <th className="text-center py-3 px-4 font-medium text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {planningData.map((product) => (
                    <tr key={product.produto_id} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-4 font-medium">{product.produto_nome}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100">{product.setor}</span>
                      </td>
                      {weekDays.map((day, idx) => (
                        <td key={idx} className="py-1 px-1">
                          <Input
                            type="number" min="0"
                            value={plannedQuantities[`${product.produto_id}-${idx}`] || ''}
                            onChange={(e) => handleQuantityChange(product.produto_id, idx, e.target.value)}
                            className="w-20 text-center h-8"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-4 text-center font-bold">
                        {getProductTotal(product.produto_id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}