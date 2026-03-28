import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search } from "lucide-react";

const SECTORS = ['Todos', 'PADARIA', 'SALGADOS', 'CONFEITARIA FINA', 'CONFEITARIA TRADICIONAL', 'LANCHONETE', 'RESTAURANTE', 'FRIOS'];

const IMPACT_OPTIONS = [
  { label: 'Sem impacto', value: 0 },
  { label: '+20%', value: 20 },
  { label: '+30%', value: 30 },
  { label: '+50%', value: 50 },
  { label: '+100%', value: 100 },
  { label: '-20%', value: -20 },
  { label: '-50%', value: -50 },
];

// Tipo de escopo do impacto
const SCOPE_OPTIONS = [
  { value: 'todos', label: 'Todos os produtos' },
  { value: 'setor', label: 'Por setor' },
  { value: 'produto', label: 'Produto específico' },
];

export default function CalendarEventDialog({ event, initialDate, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [scope, setScope] = useState('todos');
  const [produtoSearch, setProdutoSearch] = useState('');

  const [form, setForm] = useState({
    nome: '',
    data: initialDate || format(new Date(), 'yyyy-MM-dd'),
    tipo: 'Feriado Nacional',
    impacto_pct: 0,
    setores: ['Todos'],
    produto_id: null,
    notas: '',
  });

  // Buscar produtos cadastrados
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await base44.functions.invoke('Getproducts', {});
      return res?.data || res;
    },
    staleTime: 10 * 60 * 1000,
  });
  const products = productsData?.products || [];

  const filteredProducts = useMemo(() => {
    if (!produtoSearch.trim()) return products.slice(0, 20);
    const s = produtoSearch.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s)
    ).slice(0, 20);
  }, [products, produtoSearch]);

  useEffect(() => {
    if (event) {
      // Determinar scope a partir dos dados salvos
      let savedScope = 'todos';
      if (event.produto_id) savedScope = 'produto';
      else if (event.setores && !event.setores.includes('Todos')) savedScope = 'setor';

      setScope(savedScope);
      setForm({
        nome: event.nome || '',
        data: event.data || format(new Date(), 'yyyy-MM-dd'),
        tipo: event.tipo || 'Feriado Nacional',
        impacto_pct: parseFloat(event.impacto_pct || 0),
        setores: event.setores || ['Todos'],
        produto_id: event.produto_id || null,
        notas: event.notas || '',
      });

      // Preencher busca com nome do produto se houver
      if (event.produto_id && products.length > 0) {
        const prod = products.find(p => String(p.id) === String(event.produto_id));
        if (prod) setProdutoSearch(prod.name);
      }
    } else if (initialDate) {
      setForm(prev => ({ ...prev, data: initialDate }));
    }
  }, [event, initialDate]);

  // Ajustar setores/produto_id conforme scope
  const handleScopeChange = (newScope) => {
    setScope(newScope);
    if (newScope === 'todos') {
      setForm(prev => ({ ...prev, setores: ['Todos'], produto_id: null }));
    } else if (newScope === 'setor') {
      setForm(prev => ({ ...prev, setores: [SECTORS[1]], produto_id: null }));
    } else {
      setForm(prev => ({ ...prev, setores: ['Todos'], produto_id: null }));
      setProdutoSearch('');
    }
  };

  const handleSave = async () => {
    if (!form.nome.trim()) return toast.error("Nome é obrigatório.");
    if (!form.data) return toast.error("Data é obrigatória.");
    if (scope === 'produto' && !form.produto_id) return toast.error("Selecione um produto.");

    setIsSaving(true);
    try {
      const payload = { ...form };
      if (scope === 'todos') { payload.setores = ['Todos']; payload.produto_id = null; }
      else if (scope === 'setor') { payload.produto_id = null; }
      else { payload.setores = ['Todos']; }

      if (event) {
        await base44.functions.invoke('atualizarEvento', { id: event.id, ...payload });
        toast.success("Evento atualizado!");
      } else {
        const res = await base44.functions.invoke('criarEvento', { ...payload, fonte: 'manual' });
        const data = res?.data || res;
        if (data?.success === false) return toast.error(data.message || "Evento já existe.");
        toast.success("Evento criado!");
      }
      queryClient.invalidateQueries(['calendarEvents']);
      onSave();
    } catch (err) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    if (!confirm("Excluir este evento?")) return;
    try {
      await base44.functions.invoke('deletarEvento', { id: event.id });
      toast.success("Evento excluído!");
      queryClient.invalidateQueries(['calendarEvents']);
      onClose();
    } catch (err) {
      toast.error("Erro ao excluir.");
    }
  };

  const selectedProduct = form.produto_id
    ? products.find(p => String(p.id) === String(form.produto_id))
    : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md z-[9999] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Nome */}
          <div>
            <Label className="text-sm">Nome *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Páscoa, Natal, Festa Junina..." className="h-9 mt-1" />
          </div>

          {/* Data + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Data *</Label>
              <Input type="date" value={form.data}
                onChange={e => setForm({ ...form, data: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-sm">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="Feriado Nacional">🔴 Feriado Nacional</SelectItem>
                  <SelectItem value="Feriado Regional">🟠 Feriado Regional</SelectItem>
                  <SelectItem value="Evento Especial">🟡 Evento Especial</SelectItem>
                  <SelectItem value="Alta Demanda">🔵 Alta Demanda</SelectItem>
                  <SelectItem value="Observação">🟢 Observação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Impacto */}
          <div>
            <Label className="text-sm">Impacto na Demanda</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {IMPACT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm({ ...form, impacto_pct: opt.value })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    form.impacto_pct === opt.value
                      ? opt.value > 0 ? 'bg-blue-600 text-white border-blue-600'
                        : opt.value < 0 ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <Input type="number" value={form.impacto_pct} step="5"
              onChange={e => setForm({ ...form, impacto_pct: parseFloat(e.target.value) || 0 })}
              className="h-8 mt-1.5 w-32 text-center" placeholder="% personalizado" />
            {form.impacto_pct !== 0 && (
              <p className={`text-xs mt-1 ${form.impacto_pct > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {form.impacto_pct > 0 ? '↑' : '↓'} Demanda {form.impacto_pct > 0 ? 'aumenta' : 'reduz'} {Math.abs(form.impacto_pct)}% neste dia
              </p>
            )}
          </div>

          {/* Escopo do impacto */}
          <div>
            <Label className="text-sm">Impacto afeta</Label>
            <div className="flex gap-2 mt-1">
              {SCOPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => handleScopeChange(opt.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    scope === opt.value
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Por setor */}
            {scope === 'setor' && (
              <Select value={form.setores[0] || 'PADARIA'}
                onValueChange={v => setForm({ ...form, setores: [v] })}>
                <SelectTrigger className="h-9 mt-2"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[10000]">
                  {SECTORS.filter(s => s !== 'Todos').map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Por produto */}
            {scope === 'produto' && (
              <div className="mt-2 space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    value={produtoSearch}
                    onChange={e => { setProdutoSearch(e.target.value); setForm(prev => ({ ...prev, produto_id: null })); }}
                    placeholder="Buscar produto..."
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                {produtoSearch && !form.produto_id && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto bg-white shadow-sm">
                    {filteredProducts.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 text-center">Nenhum produto encontrado</p>
                    ) : (
                      filteredProducts.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => {
                            setForm(prev => ({ ...prev, produto_id: String(p.id) }));
                            setProdutoSearch(p.name);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 transition-colors">
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="ml-2 text-slate-400">{p.sector}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedProduct && (
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                    <span className="font-medium text-blue-800">{selectedProduct.name}</span>
                    <button type="button" onClick={() => { setForm(prev => ({ ...prev, produto_id: null })); setProdutoSearch(''); }}
                      className="text-blue-400 hover:text-blue-700 ml-2">✕</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <Label className="text-sm">Observações</Label>
            <Textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })}
              placeholder="Detalhes adicionais..." rows={2} className="text-sm mt-1" />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {event && (
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? 'Salvando...' : event ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
