import React, { useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Settings() {
  const [editCode, setEditCode] = useState('');

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getConfig', {});
      return response?.data || response;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (dados) => {
      return base44.functions.invoke('saveConfig', dados);
    },
    onSuccess: () => toast.success('✅ Configurações salvas!'),
    onError: () => toast.error('Erro ao salvar configurações')
  });

  const handleSave = () => {
    saveMutation.mutate({ codigo_edicao_planejamento: { valor: editCode } });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Configure o sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Segurança do Planejamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-slate-600 mb-1 block">
              Código para edição de semanas passadas
            </label>
            <Input
              type="password"
              placeholder="Digite o novo código"
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              className="w-64"
            />
            <p className="text-xs text-slate-400 mt-1">
              Este código será solicitado ao tentar editar planejamentos de semanas passadas
            </p>
          </div>
          <Button onClick={handleSave} disabled={!editCode || saveMutation.isPending}>
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}