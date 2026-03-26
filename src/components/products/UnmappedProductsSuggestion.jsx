import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { toast } from "sonner";
import SectorBadge from "../common/SectorBadge";

const SETORES = [
  'all',
  'CONFEITARIA FINA',
  'CONFEITARIA TRADICIONAL',
  'ESPACO MAGICO',
  'FRIOS',
  'INATIVOS',
  'KITS',
  'LANCHONETE',
  'MINIMERCADO',
  'PADARIA',
  'RESTAURANTE',
  'SALGADOS',
  'SUPRIMENTOS',
];

export default function UnmappedProductsSuggestion({ sqlData, products, onProductCreated, selectedSector, onSectorChange }) {
  const [creating, setCreating] = useState(new Set());
  const [dismissed, setDismissed] = useState(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const unmappedProducts = useMemo(() => {
    if (!sqlData || !sqlData.sales) return [];

    const normalize = (str) => String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');

    const registeredByCode = new Set(
      (products || []).filter(p => p.code).map(p => normalize(p.code))
    );
    const registeredByName = new Set(
      (products || []).map(p => normalize(p.name))
    );

    return sqlData.sales
      .filter(record => {
        const name = normalize(record.product_name || '');
        const code = normalize(record.product_code || '');
        if (!name) return false;
        const isRegistered = registeredByCode.has(code) || registeredByName.has(name);
        return !isRegistered;
      })
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
  }, [sqlData, products]);

  const handleCreateProduct = async (product) => {
    const key = `${product.product_name}-${product.sector}`;
    setCreating(prev => new Set(prev).add(key));
    try {
      const response = await base44.functions.invoke('Createproduct', {
        code: product.product_code || '',
        name: product.product_name,
        sector: product.sector,
        recipe_yield: 1,
        unit: 'UN',
        production_days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
        active: true,
        produto_lince_codigo: product.product_code || ''
      });

      const data = response?.data || response;
      const errorMsg = data?.error || response?.error;

      if (errorMsg) {
        toast.error(`Erro: ${errorMsg}`);
      } else if (data?.success || data?.product || data?.id) {
        toast.success(`"${product.product_name}" cadastrado com sucesso!`);
        setDismissed(prev => new Set(prev).add(key));
        if (onProductCreated) await onProductCreated();
      } else {
        toast.error('Erro: Resposta inesperada do servidor');
      }
    } catch (error) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setCreating(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDismiss = (product) => {
    const key = `${product.product_name}-${product.sector}`;
    setDismissed(prev => new Set(prev).add(key));
  };

  const visibleProducts = unmappedProducts.filter(product => {
    const key = `${product.product_name}-${product.sector}`;
    if (dismissed.has(key)) return false;
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      (product.product_name || '').toLowerCase().includes(s) ||
      (product.sector || '').toLowerCase().includes(s) ||
      (product.product_code || '').toLowerCase().includes(s)
    );
  });

  const totalUnmapped = unmappedProducts.filter(p => !dismissed.has(`${p.product_name}-${p.sector}`)).length;

  if (totalUnmapped === 0 && !searchTerm) return null;

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="cursor-pointer pb-3" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <CardTitle className="text-lg text-orange-900">
              Produtos Detectados na VIEW SQL
            </CardTitle>
            <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
              {totalUnmapped} {totalUnmapped === 1 ? 'produto' : 'produtos'}
            </Badge>
          </div>
          <Button size="sm" variant="ghost" className="text-orange-700 hover:bg-orange-100">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3">
          <p className="text-sm text-orange-800">
            Produtos detectados no Lince que ainda não estão cadastrados na plataforma.
            Cadastre-os para ativar o planejamento de produção.
          </p>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 border-orange-200 focus:border-orange-400"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <Select
              value={selectedSector || 'all'}
              onValueChange={(v) => { onSectorChange && onSectorChange(v); }}
            >
              <SelectTrigger className="w-48 border-orange-200" onClick={(e) => e.stopPropagation()}>
                <SelectValue placeholder="Filtrar setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {SETORES.filter(s => s !== 'all').map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {visibleProducts.map((product, idx) => {
              const key = `${product.product_name}-${product.sector}`;
              const isCreating = creating.has(key);
              return (
                <div key={idx} className="bg-white border border-orange-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900">{product.product_name}</span>
                      {product.product_code && (
                        <Badge variant="outline" className="text-xs">{product.product_code}</Badge>
                      )}
                      <SectorBadge sector={product.sector} />
                    </div>
                    <div className="text-xs text-slate-500">
                      Qtd total: {Math.round((product.quantity || 0) * 100) / 100}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => handleDismiss(product)}
                      disabled={isCreating}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handleCreateProduct(product)}
                      disabled={isCreating}
                      className="border-orange-300 text-orange-700 hover:bg-orange-100"
                    >
                      {isCreating ? (
                        <>
                          <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mr-1" />
                          Criando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 mr-1" />
                          Cadastrar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {visibleProducts.length === 0 && (
            <div className="text-center py-8 text-orange-600">
              {searchTerm ? `Nenhum produto encontrado para "${searchTerm}"` : 'Todos os produtos deste setor já estão cadastrados!'}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
