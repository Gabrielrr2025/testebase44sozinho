import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

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

export default function CalendarEventDialog({ event, initialDate, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    data: initialDate || format(new Date(), 'yyyy-MM-dd'),
    tipo: 'Feriado Nacional',
    impacto_pct: 0,
    setores: ['Todos'],
    notas: '',
  });

  useEffect(() => {
    if (event) {
      setForm({
        nome: event.nome || '',
        data: event.data || format(new Date(), 'yyyy-MM-dd'),
        tipo: event.tipo || 'Feriado Nacional',
        impacto_pct: parseFloat(event.impacto_pct || 0),
        setores: event.setores || ['Todos'],
        notas: event.notas || '',
      });
    } else if (initialDate) {
      setForm(prev => ({ ...prev, data: initialDate }));
    }
  }, [event, initialDate]);

  const handleSave = async () => {
    if (!form.nome.trim()) return toast.error("Nome é obrigatório.");
    if (!form.data) return toast.error("Data é obrigatória.");
    setIsSaving(true);
    try {
      if (event) {
        await base44.functions.invoke('atualizarEvento', { id: event.id, ...form });
        toast.success("Evento atualizado!");
      } else {
        const res = await base44.functions.invoke('criarEvento', { ...form, fonte: 'manual' });
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md z-[9999]">
        <DialogHeader>
          <DialogTitle>{event ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-sm">Nome *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Páscoa, Natal, Festa Junina..." className="h-9 mt-1" />
          </div>

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

          <div>
            <Label className="text-sm">Setor Afetado</Label>
            <Select value={form.setores[0] || 'Todos'}
              onValueChange={v => setForm({ ...form, setores: [v] })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[10000]">
                {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

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
