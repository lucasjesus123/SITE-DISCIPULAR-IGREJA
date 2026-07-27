"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Filtros da auditoria.
 *
 * O componente apenas MONTA UMA URL. Ele não consulta nada, não decide nada e
 * não recebe dado nenhum além do que já está na tela.
 *
 * Por que isso importa: os valores escolhidos aqui viajam como query string, e
 * query string é entrada de usuário — qualquer pessoa pode digitar
 * `?grupo=../../etc` na barra de endereços sem passar por este código. A defesa
 * está do outro lado: a página revalida tudo com Zod (`.safeParse` com lista
 * fechada e fallback) antes de montar o `where`. Os `<select>` daqui existem
 * para que quem investiga não precise adivinhar os valores possíveis.
 *
 * A paginação é reiniciada a cada mudança de filtro: manter "página 7" ao
 * trocar o recorte leva à tela vazia mais confusa possível, justo quando
 * alguém está tentando descobrir se houve acesso indevido.
 */

export function FiltrosAuditoria({
  grupo,
  periodo,
  ator,
  atores,
}: {
  grupo: string;
  periodo: string;
  ator: string;
  atores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [grupoAtual, setGrupo] = useState(grupo);
  const [periodoAtual, setPeriodo] = useState(periodo);
  const [atorAtual, setAtor] = useState(ator);

  function aplicar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const query = new URLSearchParams();
    if (grupoAtual !== "TODOS") query.set("grupo", grupoAtual);
    if (periodoAtual !== "30d") query.set("periodo", periodoAtual);
    if (atorAtual) query.set("ator", atorAtual);

    const destino = query.toString()
      ? `/painel/auditoria?${query.toString()}`
      : "/painel/auditoria";

    iniciar(() => {
      router.push(destino);
      router.refresh();
    });
  }

  function limpar() {
    setGrupo("TODOS");
    setPeriodo("30d");
    setAtor("");
    iniciar(() => {
      router.push("/painel/auditoria");
      router.refresh();
    });
  }

  return (
    <form onSubmit={aplicar} className="barra-ferramentas" style={{ alignItems: "flex-end" }}>
      <div className="campo" style={{ minWidth: "190px" }}>
        <label className="campo__rotulo" htmlFor="auditoria-grupo">
          Tipo de ação
        </label>
        <select
          id="auditoria-grupo"
          value={grupoAtual}
          onChange={(e) => setGrupo(e.target.value)}
          disabled={pendente}
        >
          <option value="TODOS">Todas</option>
          <option value="pessoas">Pessoas e cadastros</option>
          <option value="oracao">Pedidos de oração</option>
          <option value="batismos">Batismos</option>
          <option value="usuarios">Usuários e papéis</option>
          <option value="configuracoes">Configurações</option>
          <option value="lgpd">LGPD (exportação e exclusão)</option>
          <option value="site">Site e conteúdo</option>
          <option value="autenticacao">Entradas e senhas</option>
          <option value="suporte">Acessos do suporte</option>
        </select>
      </div>

      <div className="campo" style={{ minWidth: "160px" }}>
        <label className="campo__rotulo" htmlFor="auditoria-periodo">
          Período
        </label>
        <select
          id="auditoria-periodo"
          value={periodoAtual}
          onChange={(e) => setPeriodo(e.target.value)}
          disabled={pendente}
        >
          <option value="24h">Últimas 24 horas</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="tudo">Tudo</option>
        </select>
      </div>

      <div className="campo" style={{ minWidth: "200px", flex: 1 }}>
        <label className="campo__rotulo" htmlFor="auditoria-ator">
          Quem fez
        </label>
        {/*
          Lista fechada, montada no servidor a partir dos vínculos DESTA igreja.
          Um campo de texto livre aqui buscaria por nome e devolveria zero
          resultados na primeira grafia diferente — e ainda transformaria a tela
          numa busca sobre a tabela de auditoria inteira.
        */}
        <select
          id="auditoria-ator"
          value={atorAtual}
          onChange={(e) => setAtor(e.target.value)}
          disabled={pendente}
        >
          <option value="">Qualquer pessoa</option>
          {atores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn--sm" disabled={pendente}>
        {pendente ? "Filtrando…" : "Filtrar"}
      </button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={limpar} disabled={pendente}>
        Limpar
      </button>
    </form>
  );
}
