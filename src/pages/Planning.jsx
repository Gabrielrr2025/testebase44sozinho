import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, RefreshCw, X, FileText, FileSpreadsheet,
  Save, TrendingUp, TrendingDown, Minus, Lightbulb, ArrowUp, ArrowDown,
  Calendar as CalendarIcon, Lock, LockOpen, CalendarDays, Info as InfoIcon,
  ClipboardList, CheckCircle2, History
} from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const SECTORS = [
  "CONFEITARIA FINA",
  "CONFEITARIA TRADICIONAL",
  "FRIOS",
  "LANCHONETE",
  "PADARIA",
  "RESTAURANTE",
  "SALGADOS",
];

// Calcular início da semana (TERÇA)
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

  const [selectedSector, setSelectedSector] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [plannedQuantities, setPlannedQuantities] = useState({});
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [showEmitirDialog, setShowEmitirDialog] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [pedidoEmitido, setPedidoEmitido] = useState(null);
  const [isEmitindo, setIsEmitindo] = useState(false);
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null);

  const saveTimeoutRef = useRef({});

  const weekBounds = useMemo(() => getWeekBounds(currentDate), [currentDate]);
  const weekDays = useMemo(() =>
    eachDayOfInterval({ start: weekBounds.start, end: weekBounds.end }),
    [weekBounds]
  );

  const startDate = format(weekBounds.start, 'yyyy-MM-dd');
  const endDate = format(weekBounds.end, 'yyyy-MM-dd');

  const today = new Date();
  const todayWeekStart = startOfWeek(today, { weekStartsOn: 2 });
  const isWeekInPast = currentDate <= todayWeekStart;
  const isWeekLocked = (isWeekInPast || !!pedidoEmitido) && !isUnlocked;

  // Config (senha)
  const { data: configData } = useQuery({
    queryKey: ['config', 'codigo_edicao_planejamento'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getConfig', { chave: 'codigo_edicao_planejamento' });
      return response.data || response;
    },
    staleTime: 10 * 60 * 1000,
  });
  const editCode = configData?.valor || configData?.dados?.codigo_edicao || '1234';

  // Dados do planejamento
  const planningQuery = useQuery({
    queryKey: ['planningData', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('Getplanningdata', { startDate, endDate });
      return response.data || response;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Rascunho salvo
  const savedPlanningQuery = useQuery({
    queryKey: ['savedPlanning', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPlanning', { startDate, endDate });
      return response.data || response;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Pedido da semana atual
  const pedidoSemanaQuery = useQuery({
    queryKey: ['pedidoSemana', startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPedidoSemana', { inicio: startDate, fim: endDate });
      return response.data || response;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Detalhes do pedido selecionado no histórico
  const pedidoDetalheQuery = useQuery({
    queryKey: ['pedidoDetalhe', pedidoSelecionado?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPedido', { id: pedidoSelecionado.id });
      return response.data || response;
    },
    enabled: !!pedidoSelecionado,
    staleTime: 5 * 60 * 1000,
  });

  // Histórico de pedidos
  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPedidos', {});
      return response.data || response;
    },
    staleTime: 2 * 60 * 1000,
    enabled: showHistorico,
  });

  // Atualizar pedido emitido quando semana muda
  useEffect(() => {
    const pedido = pedidoSemanaQuery.data?.pedido || null;
    setPedidoEmitido(pedido);
    setIsUnlocked(false);
  }, [pedidoSemanaQuery.data]);

  // Carregar rascunho salvo
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
      const response = await base44.functions.invoke('savePlanning', { produto_id, data, quantidade_planejada });
      return response.data || response;
    },
  });

  const planningData = planningQuery.data?.products || planningQuery.data?.data?.products || [];

  const filteredPlanning = useMemo(() => {
    let filtered = planningData;
    if (selectedSector !== "all") {
      filtered = filtered.filter(p => p.setor === selectedSector);
    }
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.produto_nome.toLowerCase().includes(search));
    }
    return filtered;
  }, [planningData, selectedSector, searchTerm]);

  useEffect(() => {
    if (selectedProduct && filteredPlanning.length > 0) {
      const updated = filteredPlanning.find(p => p.produto_id === selectedProduct.produto_id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedProduct)) {
        setSelectedProduct(updated);
      }
    }
  }, [filteredPlanning]);

  const handlePreviousWeek = () => {
    setCurrentDate(prev => subWeeks(prev, 1));
    setSelectedProduct(null);
    setIsUnlocked(false);
    setPlannedQuantities({});
    queryClient.invalidateQueries(['savedPlanning']);
    queryClient.invalidateQueries(['planningData']);
    queryClient.invalidateQueries(['pedidoSemana']);
  };

  const handleNextWeek = () => {
    setCurrentDate(prev => addWeeks(prev, 1));
    setSelectedProduct(null);
    setIsUnlocked(false);
    setPlannedQuantities({});
    queryClient.invalidateQueries(['savedPlanning']);
    queryClient.invalidateQueries(['planningData']);
    queryClient.invalidateQueries(['pedidoSemana']);
  };

  // Auto-save com debounce
  const saveQuantity = useCallback((productId, dayIndex, quantity) => {
    const dateStr = format(weekDays[dayIndex], 'yyyy-MM-dd');
    const key = `${productId}-${dayIndex}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(() => {
      saveMutation.mutate({ produto_id: productId, data: dateStr, quantidade_planejada: quantity });
    }, 800);
  }, [weekDays, saveMutation]);

  const handleQuantityChange = (productId, dayIndex, value) => {
    if (isWeekLocked) { setShowUnlockDialog(true); return; }
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;
    setPlannedQuantities(prev => ({ ...prev, [`${productId}-${dayIndex}`]: numValue }));
    saveQuantity(productId, dayIndex, numValue);
  };

  const handleUnlock = () => {
    if (unlockCode === editCode) {
      setIsUnlocked(true);
      setShowUnlockDialog(false);
      setUnlockCode("");
      toast.success("✅ Planejamento desbloqueado para edição");
    } else {
      toast.error("❌ Código incorreto");
    }
  };

  // Emitir pedido
  const handleEmitir = async () => {
    setIsEmitindo(true);
    try {
      const res = await base44.functions.invoke('emitirPedido', {
        semana_inicio: startDate,
        semana_fim: endDate,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      toast.success(`✅ Pedido ${data.pedido.numero} emitido com sucesso!`);
      setPedidoEmitido(data.pedido);
      setIsUnlocked(false);
      setShowEmitirDialog(false);
      queryClient.invalidateQueries(['pedidos']);
      queryClient.invalidateQueries(['pedidoSemana', startDate, endDate]);
    } catch (err) {
      toast.error("Erro ao emitir pedido: " + (err.message || ""));
    } finally {
      setIsEmitindo(false);
    }
  };

  const handleRecalculate = () => {
    if (isWeekLocked) { setShowUnlockDialog(true); return; }
    const newQuantities = {};
    filteredPlanning.forEach(product => {
      const productionDays = product.production_days || [];
      const activeDaysCount = weekDays.filter(day => {
        const dayNameMap = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
        return productionDays.includes(dayNameMap[day.getDay()]);
      }).length;
      const dailyQty = activeDaysCount > 0 ? Math.ceil(product.suggested_production / activeDaysCount) : 0;
      weekDays.forEach((day, idx) => {
        const dayNameMap = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
        const isProductionDay = productionDays.includes(dayNameMap[day.getDay()]);
        newQuantities[`${product.produto_id}-${idx}`] = isProductionDay ? dailyQty : 0;
        saveMutation.mutate({ produto_id: product.produto_id, data: format(day, 'yyyy-MM-dd'), quantidade_planejada: isProductionDay ? dailyQty : 0 });
      });
    });
    setPlannedQuantities(newQuantities);
    toast.success("Sugestões aplicadas automaticamente!");
  };

  const handleApplySuggestion = () => {
    if (!selectedProduct || isWeekLocked) { if (isWeekLocked) setShowUnlockDialog(true); return; }
    const productionDays = selectedProduct.production_days || [];
    const activeDaysCount = weekDays.filter(day => {
      const dayNameMap = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
      return productionDays.includes(dayNameMap[day.getDay()]);
    }).length;
    const dailyQty = activeDaysCount > 0 ? Math.ceil(selectedProduct.suggested_production / activeDaysCount) : 0;
    const newQuantities = { ...plannedQuantities };
    weekDays.forEach((day, idx) => {
      const dayNameMap = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
      const isProductionDay = productionDays.includes(dayNameMap[day.getDay()]);
      newQuantities[`${selectedProduct.produto_id}-${idx}`] = isProductionDay ? dailyQty : 0;
      saveMutation.mutate({ produto_id: selectedProduct.produto_id, data: format(day, 'yyyy-MM-dd'), quantidade_planejada: isProductionDay ? dailyQty : 0 });
    });
    setPlannedQuantities(newQuantities);
    toast.success(`Sugestão aplicada para ${selectedProduct.produto_nome}`);
    setSelectedProduct(null);
  };

  // PDF do pedido histórico (snapshot)
  const handleExportPDFHistorico = (pedido, itens) => {
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();

      // Cabeçalho
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('PEDIDO DE PRODUÇÃO', 14, 10);
      doc.setFontSize(14);
      doc.text(pedido.numero, pageW - 14, 10, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Semana: ${format(new Date(pedido.semana_inicio + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(pedido.semana_fim + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`,
        14, 17
      );
      doc.text(
        `Emitido em: ${format(new Date(pedido.emitido_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        pageW - 14, 17, { align: 'right' }
      );

      // Agrupar itens por produto
      const agrupados = itens.reduce((acc, item) => {
        const existing = acc.find(r => r.produto_id === item.produto_id);
        if (existing) {
          existing.total += parseFloat(item.quantidade || 0);
        } else {
          acc.push({ ...item, total: parseFloat(item.quantidade || 0) });
        }
        return acc;
      }, []);

      let yPos = 28;
      const startX = 10;
      const rowH = 9;
      const colW = [100, 60, 40, 40];
      const totalW = colW.reduce((a, b) => a + b, 0);

      // Cabeçalho tabela
      doc.setFillColor(71, 85, 105);
      doc.rect(startX, yPos, totalW, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      ['PRODUTO', 'SETOR', 'UNIDADE', 'TOTAL'].forEach((h, i) => {
        let xPos = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
        if (i === 0) doc.text(h, xPos + 2, yPos + 6);
        else doc.text(h, xPos + colW[i] / 2, yPos + 6, { align: 'center' });
      });
      yPos += rowH;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      agrupados.forEach((item, idx) => {
        if (yPos > 190) { doc.addPage('landscape'); yPos = 15; }
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(startX, yPos, totalW, rowH, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.rect(startX, yPos, totalW, rowH, 'S');
        doc.setFontSize(8);
        const row = [item.produto_nome, item.setor, item.unidade, item.total.toString()];
        row.forEach((cell, i) => {
          let xPos = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
          if (i === 0) doc.text(cell.length > 45 ? cell.substring(0, 42) + '...' : cell, xPos + 2, yPos + 6);
          else {
            if (i === 3) { doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); }
            doc.text(cell, xPos + colW[i] / 2, yPos + 6, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
          }
        });
        yPos += rowH;
      });

      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageW / 2, 205, { align: 'center' });
      doc.save(`${pedido.numero}.pdf`);
      toast.success('PDF exportado!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar PDF');
    }
  };

  const getProductTotal = (productId) =>
    weekDays.reduce((sum, _, idx) => sum + (plannedQuantities[`${productId}-${idx}`] || 0), 0);

  // Exportar Excel
  const handleExportExcel = () => {
    try {
      const excelData = filteredPlanning.map(product => {
        const row = { 'Produto': product.produto_nome, 'Setor': product.setor, 'Unidade': product.unidade };
        weekDays.forEach((day, idx) => {
          row[format(day, 'EEE dd/MM', { locale: ptBR })] = plannedQuantities[`${product.produto_id}-${idx}`] || 0;
        });
        row['Total'] = getProductTotal(product.produto_id);
        return row;
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, ...weekDays.map(() => ({ wch: 12 })), { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Planejamento');
      XLSX.writeFile(wb, `Planejamento_${format(weekBounds.start, 'dd-MM-yyyy')}_a_${format(weekBounds.end, 'dd-MM-yyyy')}.xlsx`);
      toast.success("Excel exportado!");
    } catch (err) {
      toast.error("Erro ao exportar Excel");
    }
  };

  // Exportar PDF melhorado
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();

      // Cabeçalho
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('PEDIDO DE PRODUÇÃO', 14, 10);

      if (pedidoEmitido) {
        doc.setFontSize(14);
        doc.text(pedidoEmitido.numero, pageW - 14, 10, { align: 'right' });
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Semana: ${format(weekBounds.start, 'dd/MM/yyyy', { locale: ptBR })} a ${format(weekBounds.end, 'dd/MM/yyyy', { locale: ptBR })}`,
        14, 17
      );
      if (pedidoEmitido) {
        doc.text(
          `Emitido em: ${format(new Date(pedidoEmitido.emitido_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
          pageW - 14, 17, { align: 'right' }
        );
      }
      if (selectedSector !== 'all') {
        doc.text(`Setor: ${selectedSector}`, 14, 17);
      }

      // Tabela
      let yPos = 28;
      const startX = 10;
      const rowH = 9;
      const colW = [58, 28, ...weekDays.map(() => 22), 22];
      const totalW = colW.reduce((a, b) => a + b, 0);

      // Cabeçalho da tabela
      doc.setFillColor(71, 85, 105);
      doc.rect(startX, yPos, totalW, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');

      const headers = [
        'PRODUTO', 'SETOR',
        ...weekDays.map(d => format(d, 'EEE\ndd/MM', { locale: ptBR })),
        'TOTAL'
      ];

      let xPos = startX;
      headers.forEach((h, i) => {
        const lines = h.split('\n');
        if (lines.length > 1) {
          doc.text(lines[0], xPos + colW[i] / 2, yPos + 3.5, { align: 'center' });
          doc.text(lines[1], xPos + colW[i] / 2, yPos + 7, { align: 'center' });
        } else {
          doc.text(h, xPos + colW[i] / 2, yPos + 5.5, { align: 'center' });
        }
        xPos += colW[i];
      });

      yPos += rowH;

      // Linhas
      doc.setFont('helvetica', 'normal');
      filteredPlanning.forEach((product, idx) => {
        if (yPos > 190) { doc.addPage('landscape'); yPos = 15; }

        // Fundo alternado
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(startX, yPos, totalW, rowH, 'F');
        }

        // Borda linha
        doc.setDrawColor(226, 232, 240);
        doc.rect(startX, yPos, totalW, rowH, 'S');

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(8);

        xPos = startX;
        const nome = product.produto_nome.length > 28
          ? product.produto_nome.substring(0, 25) + '...'
          : product.produto_nome;

        const rowData = [
          nome,
          product.setor.substring(0, 14),
          ...weekDays.map((_, i) => {
            const qty = plannedQuantities[`${product.produto_id}-${i}`] || 0;
            return qty > 0 ? qty.toString() : '-';
          }),
          getProductTotal(product.produto_id).toString()
        ];

        rowData.forEach((cell, i) => {
          if (i === 0) {
            doc.text(cell, xPos + 2, yPos + 6);
          } else if (i === 1) {
            doc.text(cell, xPos + 2, yPos + 6);
          } else {
            // Destacar valores > 0
            const qty = parseInt(cell);
            if (!isNaN(qty) && qty > 0) {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(30, 64, 175);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(148, 163, 184);
            }
            doc.text(cell, xPos + colW[i] / 2, yPos + 6, { align: 'center' });
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'normal');
          }
          xPos += colW[i];
        });

        yPos += rowH;
      });

      // Rodapé
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        pageW / 2, 205, { align: 'center' }
      );

      doc.save(`${pedidoEmitido ? pedidoEmitido.numero : 'Planejamento'}_${format(weekBounds.start, 'dd-MM-yyyy')}.pdf`);
      toast.success("PDF exportado!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao exportar PDF");
    }
  };

  const pedidos = pedidosQuery.data?.pedidos || [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planejamento de Produção</h1>
          <p className="text-sm text-gray-500 mt-1">Organize a produção semanal com base em dados históricos</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowHistorico(true)}
          className="flex items-center gap-2"
        >
          <History className="w-4 h-4" />
          Histórico de Pedidos
        </Button>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Navegador de Semanas */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePreviousWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg min-w-[200px] justify-center">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-900">
              {format(weekBounds.start, 'dd/MM', { locale: ptBR })} a {format(weekBounds.end, 'dd/MM', { locale: ptBR })}
            </span>
          </div>

          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* Status da semana */}
          {pedidoEmitido ? (
            <div className="ml-2 px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {pedidoEmitido.numero}
            </div>
          ) : isWeekInPast ? (
            <div className="ml-2 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full flex items-center gap-1">
              {isUnlocked ? <LockOpen className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {isUnlocked ? 'Desbloqueado' : 'Bloqueado'}
            </div>
          ) : null}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={planningQuery.isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />Recalcular
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-2" />PDF
          </Button>
          {(!pedidoEmitido || isUnlocked) && (
            <Button
              size="sm"
              onClick={() => setShowEmitirDialog(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              {pedidoEmitido && isUnlocked ? 'Novo Pedido' : 'Emitir Pedido'}
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Buscar produto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="sm:w-64"
        />
        <Select value={selectedSector} onValueChange={setSelectedSector}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Layout: Tabela + Painel Lateral */}
      <div className="flex gap-6">
        <div className={selectedProduct ? "w-[70%]" : "w-full"}>
          <Card>
            <CardContent className="p-0">
              {planningQuery.isLoading ? (
                <div className="p-8 text-center text-slate-500">
                  <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-3" />
                  Carregando dados...
                </div>
              ) : filteredPlanning.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Nenhum produto encontrado</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-white z-10 w-48">Produto</TableHead>
                        <TableHead className="text-center w-20">Setor</TableHead>
                        <TableHead className="text-center w-24">Média</TableHead>
                        {weekDays.map((day, idx) => (
                          <TableHead key={idx} className="text-center w-24">
                            <div className="text-xs font-medium">{format(day, 'EEE', { locale: ptBR })}</div>
                            <div className="text-xs text-slate-500">{format(day, 'dd/MM')}</div>
                          </TableHead>
                        ))}
                        <TableHead className="text-center w-24">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPlanning.map((product) => {
                        const total = getProductTotal(product.produto_id);
                        const isSelected = selectedProduct?.produto_id === product.produto_id;
                        return (
                          <TableRow
                            key={product.produto_id}
                            className={`cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-blue-50' : ''}`}
                            onClick={() => setSelectedProduct(product)}
                          >
                            <TableCell className="sticky left-0 bg-white font-medium">{product.produto_nome}</TableCell>
                            <TableCell className="text-center">
                              <span className="px-2 py-1 text-xs rounded-full bg-slate-100">{product.setor}</span>
                            </TableCell>
                            <TableCell className="text-center text-sm text-slate-600">
                              {Math.round(product.avg_sales)} {product.unidade}
                            </TableCell>
                            {weekDays.map((day, idx) => {
                              const qty = plannedQuantities[`${product.produto_id}-${idx}`] || 0;
                              const dayNameMap = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
                              const isProductionDay = (product.production_days || []).includes(dayNameMap[day.getDay()]);
                              return (
                                <TableCell key={idx} className="p-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={qty || ''}
                                    onChange={(e) => handleQuantityChange(product.produto_id, idx, e.target.value)}
                                    onClick={() => { if (isWeekLocked) setShowUnlockDialog(true); }}
                                    className={`w-20 text-center h-9 ${!isProductionDay ? 'bg-slate-100 text-slate-400' : ''} ${isWeekLocked ? 'cursor-pointer' : ''}`}
                                    disabled={!isProductionDay}
                                    readOnly={isWeekLocked}
                                    title={isWeekLocked ? 'Bloqueado — clique para inserir senha' : !isProductionDay ? 'Não produzido neste dia' : ''}
                                  />
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold">{total} {product.unidade}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel Lateral */}
        {selectedProduct && (
          <div className="w-[30%]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{selectedProduct.produto_nome}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedProduct(null)} className="h-6 w-6">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-slate-500">{selectedProduct.setor} · {selectedProduct.unidade}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Semana Passada</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Vendas:</span>
                      <span className="font-bold text-slate-900">{selectedProduct.current_sales} {selectedProduct.unidade}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Perdas:</span>
                      <span className="font-bold text-slate-900">{selectedProduct.current_losses} {selectedProduct.unidade}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t">
                      <span className="text-slate-600">Taxa de Perda:</span>
                      <span className="font-bold text-slate-900">{selectedProduct.current_loss_rate}%</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Média Últimas 4 Semanas</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Vendas:</span>
                      <span className="font-medium text-slate-900">{selectedProduct.avg_sales} {selectedProduct.unidade}/semana</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Perdas:</span>
                      <span className="font-medium text-slate-900">{selectedProduct.avg_losses} {selectedProduct.unidade}/semana</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Taxa de Perda:</span>
                      <span className="font-medium text-slate-900">{selectedProduct.avg_loss_rate}%</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Tendência</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Vendas:</span>
                      <div className="flex items-center gap-1.5">
                        {selectedProduct.sales_trend === 'growing' && <><TrendingUp className="w-4 h-4 text-green-600" /><span className="text-green-600 font-medium">Crescendo</span></>}
                        {selectedProduct.sales_trend === 'decreasing' && <><TrendingDown className="w-4 h-4 text-red-600" /><span className="text-red-600 font-medium">Diminuindo</span></>}
                        {selectedProduct.sales_trend === 'stable' && <><Minus className="w-4 h-4 text-slate-500" /><span className="text-slate-500 font-medium">Estável</span></>}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Perdas:</span>
                      <div className="flex items-center gap-1.5">
                        {selectedProduct.losses_trend === 'growing' && <><TrendingUp className="w-4 h-4 text-red-600" /><span className="text-red-600 font-medium">Crescendo</span></>}
                        {selectedProduct.losses_trend === 'decreasing' && <><TrendingDown className="w-4 h-4 text-green-600" /><span className="text-green-600 font-medium">Diminuindo</span></>}
                        {selectedProduct.losses_trend === 'stable' && <><Minus className="w-4 h-4 text-slate-500" /><span className="text-slate-500 font-medium">Estável</span></>}
                      </div>
                    </div>
                  </div>

                  {/* Eventos do calendário na semana */}
                  {((selectedProduct.eventos_semana && selectedProduct.eventos_semana.length > 0) ||
                    (selectedProduct.eventos_semana_info && selectedProduct.eventos_semana_info.length > 0)) && (
                    <div className="border-t pt-3 mt-1">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                        <CalendarDays className="w-4 h-4 text-purple-500" />
                        Eventos na semana
                      </h4>
                      <div className="space-y-2">
                        {selectedProduct.eventos_semana?.map((ev, idx) => {
                          const positivo = parseFloat(ev.impacto_pct) > 0;
                          return (
                            <div key={idx} className={positivo ? "rounded-lg px-3 py-2 border text-xs bg-blue-50 border-blue-200" : "rounded-lg px-3 py-2 border text-xs bg-amber-50 border-amber-200"}>
                              <div className="flex items-center justify-between">
                                <span className={positivo ? "font-semibold text-blue-800" : "font-semibold text-amber-800"}>
                                  {ev.nome}
                                </span>
                                <span className={positivo ? "font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700" : "font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"}>
                                  {positivo ? '+' : ''}{ev.impacto_pct}%
                                </span>
                              </div>
                              <div className={positivo ? "text-[10px] mt-0.5 opacity-70 text-blue-700" : "text-[10px] mt-0.5 opacity-70 text-amber-700"}>
                                {ev.data}
                              </div>
                            </div>
                          );
                        })}
                        {selectedProduct.eventos_semana_info?.map((ev, idx) => (
                          <div key={idx} className="rounded-lg px-3 py-2 border border-slate-200 bg-slate-50 text-xs">
                            <span className="font-semibold text-slate-700">{ev.nome}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5">{ev.data} · informativo</div>
                          </div>
                        ))}
                        {selectedProduct.multiplicador_calendario && selectedProduct.multiplicador_calendario !== 1 && (
                          <div className={selectedProduct.multiplicador_calendario >= 1 ? "rounded-lg px-3 py-2 text-xs font-medium flex justify-between bg-blue-100 text-blue-800" : "rounded-lg px-3 py-2 text-xs font-medium flex justify-between bg-amber-100 text-amber-800"}>
                            <span>Impacto total na sugestão:</span>
                            <span className="font-bold">
                              {selectedProduct.multiplicador_calendario >= 1 ? '+' : ''}
                              {((selectedProduct.multiplicador_calendario - 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700">Sugestão de Produção</span>
                    </div>
                    <p className="text-xs text-blue-800 mb-2">{selectedProduct.suggestion}</p>
                    <div className="text-xs text-blue-700 font-bold mb-3">
                      Total sugerido: {selectedProduct.suggested_production} {selectedProduct.unidade}/semana
                      {selectedProduct.multiplicador_calendario && selectedProduct.multiplicador_calendario !== 1 && (
                        <span className="ml-1 text-slate-400 font-normal line-through">
                          (base: {selectedProduct.suggested_production_base})
                        </span>
                      )}
                    </div>
                    <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleApplySuggestion}>
                      Aplicar Sugestão
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ===== DIALOG EMITIR PEDIDO ===== */}
      <Dialog open={showEmitirDialog} onOpenChange={setShowEmitirDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pedidoEmitido && isUnlocked ? 'Emitir Novo Pedido' : 'Emitir Pedido de Produção'}</DialogTitle>
            <DialogDescription>
              {pedidoEmitido && isUnlocked
                ? `Já existe o pedido ${pedidoEmitido.numero} para esta semana. Um novo número será gerado.`
                : 'Isso vai gerar um número único para o pedido e bloquear a semana para edição.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Semana:</span>
                <span className="font-semibold">
                  {format(weekBounds.start, 'dd/MM/yyyy')} a {format(weekBounds.end, 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-600">Produtos:</span>
                <span className="font-semibold">{filteredPlanning.length}</span>
              </div>
              {pedidoEmitido && isUnlocked && (
                <div className="flex justify-between mt-1">
                  <span className="text-slate-600">Pedido anterior:</span>
                  <span className="font-semibold text-slate-500">{pedidoEmitido.numero}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
              ⚠️ Após emitir, a semana ficará bloqueada novamente. Para editar, será necessário a senha de configuração.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmitirDialog(false)}>Cancelar</Button>
            <Button onClick={handleEmitir} disabled={isEmitindo} className="bg-green-600 hover:bg-green-700 text-white">
              <ClipboardList className="w-4 h-4 mr-2" />
              {isEmitindo ? "Emitindo..." : "Confirmar Emissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG DESBLOQUEIO ===== */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🔒 Planejamento Bloqueado</DialogTitle>
            <DialogDescription>Digite o código de edição para desbloquear.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="Digite o código"
              value={unlockCode}
              onChange={(e) => setUnlockCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              className="text-center text-lg tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUnlockDialog(false); setUnlockCode(""); }}>Cancelar</Button>
            <Button onClick={handleUnlock}>Desbloquear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG HISTÓRICO ===== */}
      <Dialog open={showHistorico} onOpenChange={(open) => { setShowHistorico(open); if (!open) setPedidoSelecionado(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Pedidos
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-4" style={{height: '65vh'}}>
            {/* Lista de pedidos — só ela rola */}
            <div className="w-64 flex-shrink-0 space-y-2 overflow-y-auto pr-1">
              {pedidosQuery.isLoading ? (
                <div className="text-center py-8 text-slate-500">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
                  Carregando...
                </div>
              ) : pedidos.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Nenhum pedido emitido ainda.</div>
              ) : (
                pedidos.map(pedido => (
                  <div
                    key={pedido.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      pedidoSelecionado?.id === pedido.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => setPedidoSelecionado(pedido)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{pedido.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        pedido.status === 'emitido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {pedido.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {format(new Date(pedido.semana_inicio + 'T12:00:00'), 'dd/MM')} a {format(new Date(pedido.semana_fim + 'T12:00:00'), 'dd/MM/yyyy')}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {format(new Date(pedido.emitido_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Prévia do pedido selecionado — não rola */}
            <div className="flex-1 border-l pl-4 overflow-hidden">
              {!pedidoSelecionado ? (
                <div className="text-center py-12 text-slate-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Selecione um pedido para ver os detalhes</p>
                </div>
              ) : pedidoDetalheQuery.isLoading ? (
                <div className="text-center py-8 text-slate-500">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
                  Carregando detalhes...
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{pedidoSelecionado.numero}</h3>
                    <p className="text-xs text-slate-500">
                      Semana: {format(new Date(pedidoSelecionado.semana_inicio + 'T12:00:00'), 'dd/MM/yyyy')} a {format(new Date(pedidoSelecionado.semana_fim + 'T12:00:00'), 'dd/MM/yyyy')}
                    </p>
                  </div>

                  {/* Tabela de itens do snapshot */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="text-left p-2">Produto</th>
                          <th className="text-center p-2">Setor</th>
                          <th className="text-center p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pedidoDetalheQuery.data?.itens || []).reduce((acc, item) => {
                          const existing = acc.find(r => r.produto_id === item.produto_id);
                          if (existing) {
                            existing.total += parseFloat(item.quantidade || item.quantidade_planejada || 0);
                          } else {
                            acc.push({ ...item, total: parseFloat(item.quantidade || item.quantidade_planejada || 0) });
                          }
                          return acc;
                        }, []).map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="p-2 font-medium text-slate-800">{item.produto_nome}</td>
                            <td className="p-2 text-center text-slate-500">{item.setor}</td>
                            <td className="p-2 text-center font-bold text-slate-900">{item.total} {item.unidade}</td>
                          </tr>
                        ))}
                        {(pedidoDetalheQuery.data?.itens || []).length === 0 && (
                          <tr><td colSpan={3} className="p-4 text-center text-slate-400">Nenhum item registrado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Botões */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const semanaInicio = new Date(pedidoSelecionado.semana_inicio + 'T12:00:00');
                        setCurrentDate(semanaInicio);
                        setShowHistorico(false);
                        setPedidoSelecionado(null);
                        queryClient.invalidateQueries(['savedPlanning']);
                        queryClient.invalidateQueries(['planningData']);
                        queryClient.invalidateQueries(['pedidoSemana']);
                      }}
                    >
                      Ir para esta semana
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                      onClick={() => handleExportPDFHistorico(pedidoSelecionado, pedidoDetalheQuery.data?.itens || [])}
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
