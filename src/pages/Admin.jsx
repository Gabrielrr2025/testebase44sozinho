import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administrativo</h1>
        <p className="text-sm text-gray-500 mt-1">Área restrita de administração</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-500" />
            Painel Administrativo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">Funcionalidades administrativas em desenvolvimento.</p>
        </CardContent>
      </Card>
    </div>
  );
}