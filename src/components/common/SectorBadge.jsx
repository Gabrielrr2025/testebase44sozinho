import React from 'react';
import { Badge } from "@/components/ui/badge";

const sectorColors = {
  "PADARIA": "bg-amber-100 text-amber-800 border-amber-200",
  "SALGADOS": "bg-orange-100 text-orange-800 border-orange-200",
  "CONFEITARIA FINA": "bg-pink-100 text-pink-800 border-pink-200",
  "CONFEITARIA TRADICIONAL": "bg-rose-100 text-rose-800 border-rose-200",
  "LANCHONETE": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "RESTAURANTE": "bg-green-100 text-green-800 border-green-200",
  "FRIOS": "bg-cyan-100 text-cyan-800 border-cyan-200",
};

export default function SectorBadge({ sector, className = "" }) {
  return (
    <Badge 
      variant="outline" 
      className={`${sectorColors[sector] || "bg-gray-100 text-gray-800 border-gray-200"} ${className}`}
    >
      {sector}
    </Badge>
  );
}

export const SECTORS = [
  "CONFEITARIA FINA",
  "CONFEITARIA TRADICIONAL",
  "FRIOS",
  "LANCHONETE",
  "PADARIA",
  "RESTAURANTE",
  "SALGADOS",
];

export { sectorColors };
