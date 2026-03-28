import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Plus, Minus, Sparkles, Download } from "lucide-react";
import {
  format, getYear, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import CalendarEventDialog from '../components/calendar/CalendarEventDialog';

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const EVENT_COLORS = {
  "Feriado Nacional": { dot: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200"       },
  "Feriado Regional": { dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-200" },
  "Evento Especial":  { dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  "Alta Demanda":     { dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-800 border-blue-200"    },
  "Observação":       { dot: "bg-emerald-500",badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};
const DEFAULT_COLOR = { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700 border-slate-200" };

async function fetchBrasilAPI(year) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(h => ({ nome: h.name, data: h.date, tipo: "Feriado Nacional", fonte: "BrasilAPI" }));
  } catch { return []; }
}

async function fetchNagerDate(year) {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/BR`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(h => ({ nome: h.localName || h.name, data: h.date, tipo: "Feriado Nacional", fonte: "Nager.Date" }));
  } catch { return []; }
}

export default function Calendar() {
  const [currentYear, setCurrentYear] = useState(getYear(new Date()));
  const [zoom, setZoom] = useState(0.85);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  const queryClient = useQueryClient();
  const autoImportedRef = React.useRef(new Set());

  const { data: eventsData = { eventos: [] } } = useQuery({
    queryKey: ['calendarEvents', currentYear],
    queryFn: async () => {
      const res = await base44.functions.invoke('getCalendario', { ano: currentYear });
      return res?.data || res;
    },
    staleTime: 5 * 60 * 1000,
  });

  const allEvents = eventsData?.eventos || [];

  // Auto-importar feriados se o ano não tiver nenhum evento
  React.useEffect(() => {
    if (!autoImportedRef.current.has(currentYear) && allEvents.length === 0 && !loadingHolidays) {
      autoImportedRef.current.add(currentYear);
      loadHolidays(true);
    }
  }, [currentYear, allEvents.length]);

  const yearEvents = allEvents.filter(e => {
    try { return getYear(parseISO(e.data)) === currentYear; } catch { return false; }
  });

  // Feriados municipais/estaduais fixos de Itaperuna/RJ
  const getFeriadosRegionais = (year) => [
    { nome: 'São José (Padroeiro)', data: `${year}-03-19`, tipo: 'Feriado Regional', fonte: 'municipal' },
    { nome: 'São Jorge', data: `${year}-04-23`, tipo: 'Feriado Regional', fonte: 'estadual' },
    { nome: 'Aniversário de Itaperuna', data: `${year}-05-10`, tipo: 'Feriado Regional', fonte: 'municipal' },
    { nome: 'Consciência Negra', data: `${year}-11-20`, tipo: 'Feriado Regional', fonte: 'estadual' },
  ];

  const loadHolidays = async (silent = false) => {
    setLoadingHolidays(true);
    if (!silent) toast.info('Consultando APIs de feriados...');
    try {
      const [brasilapi, nager] = await Promise.all([
        fetchBrasilAPI(currentYear),
        fetchNagerDate(currentYear),
      ]);

      // Deduplicar nacionais por data — pega o nome mais curto
      const porData = new Map();
      [...brasilapi, ...nager].forEach(h => {
        const existing = porData.get(h.data);
        if (!existing || h.nome.length < existing.nome.length) {
          porData.set(h.data, h);
        }
      });
      const nacionais = Array.from(porData.values());

      // Juntar com regionais fixos
      const regionais = getFeriadosRegionais(currentYear);
      const todos = [...nacionais, ...regionais];

      // Filtrar só os que ainda não existem no banco (por data)
      const novos = todos.filter(h =>
        !allEvents.some(ev => ev.data === h.data)
      );

      if (novos.length === 0) {
        if (!silent) toast.info('Todos os feriados já estão cadastrados.');
        return;
      }

      let importados = 0;
      for (const h of novos) {
        const res = await base44.functions.invoke('criarEvento', {
          nome: h.nome, data: h.data, tipo: h.tipo,
          impacto_pct: 10,
          setores: ['Todos'],
          notas: `Importado via ${h.fonte}`, fonte: h.fonte,
        });
        const data = res?.data || res;
        if (data?.success !== false) importados++;
      }

      queryClient.invalidateQueries(['calendarEvents']);
      if (!silent) toast.success(`${importados} feriado(s) importado(s)!`);
    } catch (err) {
      if (!silent) toast.error('Erro ao importar feriados.');
    } finally {
      setLoadingHolidays(false);
    }
  };

  const getEventsForDay = useCallback((date) =>
    yearEvents.filter(e => { try { return isSameDay(parseISO(e.data), date); } catch { return false; } }),
  [yearEvents]);

  const renderMonth = (monthIndex) => {
    const monthDate = new Date(currentYear, monthIndex, 1);
    const daysInMonth = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
    const emptyDays = Array(getDay(startOfMonth(monthDate))).fill(null);

    return (
      <Card key={monthIndex} className="border-slate-200">
        <CardHeader className="pb-2 px-3 pt-3">
          <CardTitle className="text-sm font-bold text-slate-800">{MONTHS[monthIndex]}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["D","S","T","Q","Q","S","S"].map((d, i) => (
              <div key={i} className="text-[10px] font-semibold text-slate-400 py-0.5">{d}</div>
            ))}
            {emptyDays.map((_, i) => <div key={`e${i}`} className="w-6 h-6" />)}
            {daysInMonth.map((day) => {
              const dayEvents = getEventsForDay(day);
              const hasEvents = dayEvents.length > 0;
              return (
                <Tooltip key={day.toISOString()}>
                  <TooltipTrigger asChild>
                    <div
                      className={`relative w-6 h-6 flex flex-col items-center justify-center
                        text-[11px] rounded cursor-pointer transition-all duration-100
                        ${hasEvents ? 'font-bold hover:scale-110' : 'text-slate-600 hover:bg-slate-100'}`}
                      onClick={() => {
                        if (hasEvents) {
                          setSelectedEvent(dayEvents[0]);
                          setSelectedDate(null);
                        } else {
                          setSelectedEvent(null);
                          setSelectedDate(format(day, 'yyyy-MM-dd'));
                        }
                        setShowDialog(true);
                      }}
                    >
                      <span className="leading-none">{format(day, "d")}</span>
                      {hasEvents && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayEvents.slice(0, 3).map((ev, i) => (
                            <div key={i} className={`w-1 h-1 rounded-full ${(EVENT_COLORS[ev.tipo] || DEFAULT_COLOR).dot}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {hasEvents && (
                    <TooltipContent side="top" className="p-0 border-0 shadow-2xl rounded-xl overflow-hidden max-w-[240px]">
                      <div className="bg-slate-800 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-200">
                          {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
                        </p>
                        {dayEvents.length > 1 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{dayEvents.length} eventos</p>
                        )}
                      </div>
                      <div className="bg-white divide-y divide-slate-100">
                        {dayEvents.map((ev, i) => {
                          const color = EVENT_COLORS[ev.tipo] || DEFAULT_COLOR;
                          const impacto = parseFloat(ev.impacto_pct ?? 0);
                          return (
                            <div key={i} className="px-3 py-2 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-xs text-slate-800 leading-tight">{ev.nome}</p>
                                {impacto !== 0 && (
                                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${color.badge}`}>
                                    {impacto > 0 ? '+' : ''}{impacto}%
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                <span className="text-[10px] text-slate-500">{ev.tipo}</span>
                              </div>
                              {ev.notas && !ev.notas.startsWith('Importado via') && (
                                <p className="text-[10px] text-slate-400 italic">{ev.notas}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 text-center">Clique para editar</p>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* CABEÇALHO */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendário</h1>
            <p className="text-sm text-slate-500 mt-1">Organize eventos, feriados e períodos especiais</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Ano */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentYear(y => y - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-lg font-bold text-slate-900 min-w-[80px] text-center">{currentYear}</span>
              <Button variant="outline" size="icon" onClick={() => setCurrentYear(y => y + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {/* Zoom */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-xs text-slate-600 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(z + 0.15, 1.5))}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={loadHolidays} disabled={loadingHolidays}>
              <Download className="w-4 h-4 mr-2" />
              {loadingHolidays ? 'Importando...' : 'Importar Feriados'}
            </Button>
            <Button onClick={() => { setSelectedEvent(null); setSelectedDate(null); setShowDialog(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Evento
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
          <Sparkles className="w-3.5 h-3.5 text-slate-300" />
          <span>Feriados nacionais via <strong className="text-slate-500">BrasilAPI</strong> + <strong className="text-slate-500">Nager.Date</strong> · Eventos salvos no banco de dados</span>
        </div>

        {/* GRID DE MESES */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
        </div>

        {zoom < 1 && <div style={{ height: `${(1 - zoom) * 800}px` }} />}

        {/* LEGENDA */}
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              {Object.entries(EVENT_COLORS).map(([label, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                  <span className="text-slate-700 text-xs">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LISTA DE EVENTOS */}
        {yearEvents.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-800">
                Todos os Eventos — {currentYear}
                <span className="ml-2 text-sm font-normal text-slate-500">({yearEvents.length} eventos)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {[...yearEvents].sort((a, b) => a.data.localeCompare(b.data)).map(ev => {
                  const color = EVENT_COLORS[ev.tipo] || DEFAULT_COLOR;
                  const impacto = parseFloat(ev.impacto_pct ?? 0);
                  return (
                    <div key={ev.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedEvent(ev); setSelectedDate(null); setShowDialog(true); }}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.dot}`} />
                      <span className="text-sm font-medium text-slate-500 min-w-[80px]">
                        {format(parseISO(ev.data), "dd/MM/yyyy")}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 flex-1">{ev.nome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${color.badge}`}>{ev.tipo}</span>
                      {impacto !== 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          impacto > 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                          {impacto > 0 ? '+' : ''}{impacto}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {showDialog && (
          <CalendarEventDialog
            event={selectedEvent}
            initialDate={selectedDate}
            onClose={() => { setShowDialog(false); setSelectedEvent(null); setSelectedDate(null); }}
            onSave={() => { setShowDialog(false); setSelectedEvent(null); setSelectedDate(null); queryClient.invalidateQueries(['calendarEvents']); }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
