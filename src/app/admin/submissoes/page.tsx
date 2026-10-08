"use client";

import { useEffect, useState } from "react";

type Submissao = {
  id: string;
  enviado_em: string;
  modalidade: string;
  acao: string;
  nte: string;
  local: string;
  nome: string | null;
  cpf: string | null;
  pix: string | null;
  gravado_na_planilha: boolean;
  erro_gravacao: string | null;
  payload_completo: Record<string, unknown>;
};

export default function SubmissoesPage() {
  const [submissoes, setSubmissoes] = useState<Submissao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroNte, setFiltroNte] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [apenasNaoGravadas, setApenasNaoGravadas] = useState(true);

  useEffect(() => {
    carregarSubmissoes();
  }, [filtroNte, filtroLocal, apenasNaoGravadas]);

  async function carregarSubmissoes() {
    setCarregando(true);
    setErro(null);
    
    try {
      const response = await fetch("/api/admin/submissoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nte: filtroNte || undefined,
          local: filtroLocal || undefined,
          apenasNaoGravadas,
        }),
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.erro || "Erro ao carregar submissões");
      }
      
      setSubmissoes(data.submissoes || []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setCarregando(false);
    }
  }

  async function marcarComoGravada(id: string) {
    try {
      const response = await fetch("/api/admin/submissoes/marcar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, gravado: true }),
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.erro || "Erro ao marcar como gravada");
      }
      
      // Recarrega a lista
      carregarSubmissoes();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Submissões do Formulário</h1>
      
      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">NTE</label>
            <input
              type="text"
              value={filtroNte}
              onChange={(e) => setFiltroNte(e.target.value)}
              placeholder="Ex: 1"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Local</label>
            <input
              type="text"
              value={filtroLocal}
              onChange={(e) => setFiltroLocal(e.target.value)}
              placeholder="Nome do polo ou município"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={apenasNaoGravadas}
                onChange={(e) => setApenasNaoGravadas(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Apenas não gravadas</span>
            </label>
          </div>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {erro}
        </div>
      )}

      {/* Carregando */}
      {carregando && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Carregando...</p>
        </div>
      )}

      {/* Lista */}
      {!carregando && submissoes.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Nenhuma submissão encontrada.
        </div>
      )}

      {!carregando && submissoes.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {submissoes.length} submissão(ões) encontrada(s)
          </p>
          
          {submissoes.map((sub) => (
            <div
              key={sub.id}
              className={`bg-white p-4 rounded-lg shadow border-l-4 ${
                sub.gravado_na_planilha ? "border-green-500" : "border-red-500"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-semibold">{sub.modalidade}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-sm">{sub.acao}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-sm">
                    {new Date(sub.enviado_em).toLocaleString("pt-BR")}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    sub.gravado_na_planilha
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {sub.gravado_na_planilha ? "✓ Gravada" : "✗ Não gravada"}
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
                <div>
                  <span className="text-gray-500">NTE:</span> {sub.nte}
                </div>
                <div>
                  <span className="text-gray-500">Local:</span> {sub.local}
                </div>
                <div>
                  <span className="text-gray-500">Nome:</span> {sub.nome || "-"}
                </div>
                <div>
                  <span className="text-gray-500">CPF:</span> {sub.cpf || "-"}
                </div>
              </div>
              
              {sub.pix && (
                <div className="text-sm mb-2">
                  <span className="text-gray-500">PIX:</span> {sub.pix}
                </div>
              )}
              
              {sub.erro_gravacao && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700 mb-2">
                  <strong>Erro:</strong> {sub.erro_gravacao}
                </div>
              )}
              
              {!sub.gravado_na_planilha && (
                <div className="mt-2 pt-2 border-t">
                  <button
                    onClick={() => marcarComoGravada(sub.id)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Marcar como gravada manualmente
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
