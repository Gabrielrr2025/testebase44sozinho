import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat } from "lucide-react";

export default function Production() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Produção</h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe a produção em tempo real</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-500" />
            Controle de Produção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">Módulo de produção em desenvolvimento.</p>
        </CardContent>
      </Card>
    </div>
  );
}