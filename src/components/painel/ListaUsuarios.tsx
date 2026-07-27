"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@prisma/client";
import {
  alterarAtivacaoUsuario,
  alterarPapelUsuario,
  removerUsuario,
} from "@/app/painel/usuarios/acoes";
import { ROTULOS_PAPEL } from "@/components/painel/ConviteUsuario";

/**
 * Lista da equipe, com as ações de papel, desativação e remoção.
 *
 * TUDO QUE ESTE COMPONENTE DESABILITA, O SERVIDOR TAMBÉM RECUSA.
 *
 * Os botões travados na própria linha e na linha do último administrador estão
 * aqui para explicar a regra ANTES do clique — não para aplicá-la. As mesmas
 * três travas (não alterar a si mesmo, não rebaixar/remover o último ADMIN, não
 * conceder papel acima do próprio) são reavaliadas em cada Server Action, onde
 * o atacante não tem como interferir.
 */

export interface UsuarioDaLista {
  membershipId: string;
  userId: string;
  nome: string;
  email: string;
  papel: Papel;
  /** Vínculo ativo NESTA igreja. */
  ativo: boolean;
  /** Conta global ativa. Desativada = a pessoa não entra em igreja nenhuma. */
  contaAtiva: boolean;
  emailVerificado: boolean;
  celulaId: string | null;
  celulaNome: string | null;
  desde: string;
  ultimoLogin: string | null;
}

export function ListaUsuarios({
  usuarios,
  papeisDisponiveis,
  celulas,
  podeGerenciar,
  meuUserId,
  adminsAtivos,
}: {
  usuarios: UsuarioDaLista[];
  papeisDisponiveis: Papel[];
  celulas: { id: string; nome: string }[];
  podeGerenciar: boolean;
  meuUserId: string;
  adminsAtivos: number;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Papel</th>
            <th>Situação</th>
            <th>Último acesso</th>
            {podeGerenciar && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const souEu = u.userId === meuUserId;
            const ultimoAdmin = u.papel === "ADMIN" && u.ativo && adminsAtivos <= 1;
            // Sem autoridade sobre o papel atual do alvo, não há ação possível.
            const temAutoridade = papeisDisponiveis.includes(u.papel);
            const travado = souEu || ultimoAdmin || !temAutoridade;

            return (
              <tr key={u.membershipId}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    {u.nome}
                    {souEu && <span className="dim" style={{ fontWeight: 400 }}> · você</span>}
                  </div>
                  <div className="dim" style={{ fontSize: ".78rem" }}>{u.email}</div>
                  <div className="dim" style={{ fontSize: ".72rem" }}>Na equipe desde {u.desde}</div>
                </td>

                <td>
                  <EtiquetaPapel papel={u.papel} />
                  {u.papel === "LIDER_CELULA" && (
                    <div className="dim" style={{ fontSize: ".75rem", marginTop: ".3rem" }}>
                      {u.celulaNome ?? "sem célula definida"}
                    </div>
                  )}
                </td>

                <td>
                  {!u.ativo ? (
                    <span className="etiqueta etiqueta--spam">Desativado</span>
                  ) : !u.contaAtiva ? (
                    <span className="etiqueta etiqueta--urgente">Conta bloqueada</span>
                  ) : (
                    <span className="etiqueta etiqueta--concluido">Ativo</span>
                  )}
                  {!u.emailVerificado && (
                    <div className="dim" style={{ fontSize: ".72rem", marginTop: ".3rem" }}>
                      e-mail não confirmado
                    </div>
                  )}
                </td>

                <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>
                  {u.ultimoLogin ?? <span className="dim">nunca entrou</span>}
                </td>

                {podeGerenciar && (
                  <td>
                    {travado ? (
                      <span className="dim" style={{ fontSize: ".75rem" }}>
                        {souEu
                          ? "Peça a outro administrador"
                          : ultimoAdmin
                            ? "Último administrador ativo"
                            : "Fora do seu alcance"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() =>
                          setEditando(editando === u.membershipId ? null : u.membershipId)
                        }
                      >
                        {editando === u.membershipId ? "Fechar" : "Gerenciar"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/*
        O painel de edição fica FORA da tabela: aninhar um formulário dentro de
        <td> quebra o layout em telas estreitas e dificulta a leitura por
        tecnologia assistiva.
      */}
      {editando && podeGerenciar && (
        <PainelDeEdicao
          /* `key` força remontagem ao trocar de linha: sem ela o React
             reaproveitaria o estado interno e o painel abriria mostrando o
             papel do usuário anterior — que é o tipo de confusão capaz de
             fazer alguém salvar a alteração na pessoa errada. */
          key={editando}
          usuario={usuarios.find((u) => u.membershipId === editando)}
          papeisDisponiveis={papeisDisponiveis}
          celulas={celulas}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function PainelDeEdicao({
  usuario,
  papeisDisponiveis,
  celulas,
  aoFechar,
}: {
  usuario: UsuarioDaLista | undefined;
  papeisDisponiveis: Papel[];
  celulas: { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [papel, setPapel] = useState<Papel>(usuario?.papel ?? "MEMBRO");
  const [celulaId, setCelulaId] = useState<string>(usuario?.celulaId ?? "");
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  if (!usuario) return null;

  function executar(acao: () => Promise<{ ok: boolean; mensagem: string }>, fecharDepois = false) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await acao();
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) {
        router.refresh();
        if (fecharDepois) aoFechar();
      }
    });
  }

  return (
    <div className="secao-painel" style={{ marginTop: "1.4rem" }}>
      <h3 className="secao-painel__titulo">{usuario.nome}</h3>
      <p className="secao-painel__desc">{usuario.email}</p>

      {aviso && (
        <div
          className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`}
          role={aviso.tom === "erro" ? "alert" : "status"}
          style={{ marginBottom: "1.2rem" }}
        >
          {aviso.texto}
        </div>
      )}

      <div className="grid cols-2">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`papel-${usuario.membershipId}`}>
            Papel
          </label>
          <select
            id={`papel-${usuario.membershipId}`}
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            disabled={pendente}
          >
            {papeisDisponiveis.map((p) => (
              <option key={p} value={p}>
                {ROTULOS_PAPEL[p]}
              </option>
            ))}
          </select>
          <span className="campo__ajuda">
            A mudança vale imediatamente, inclusive nas abas que a pessoa já tem abertas — o papel é
            relido a cada requisição, não fica guardado no cookie.
          </span>
        </div>

        {papel === "LIDER_CELULA" && (
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`celula-${usuario.membershipId}`}>
              Célula que lidera
            </label>
            <select
              id={`celula-${usuario.membershipId}`}
              value={celulaId}
              onChange={(e) => setCelulaId(e.target.value)}
              disabled={pendente}
            >
              <option value="">Escolha uma célula</option>
              {celulas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: "1.2rem" }}>
        <button
          type="button"
          className="btn btn--sm"
          disabled={pendente || (papel === usuario.papel && celulaId === (usuario.celulaId ?? ""))}
          onClick={() =>
            executar(() => alterarPapelUsuario(usuario.membershipId, { papel, celulaId }))
          }
        >
          {pendente ? "Salvando…" : "Salvar papel"}
        </button>

        <button
          type="button"
          className="btn btn--sm btn--outline-gold"
          disabled={pendente}
          onClick={() =>
            executar(() => alterarAtivacaoUsuario(usuario.membershipId, !usuario.ativo))
          }
        >
          {usuario.ativo ? "Desativar acesso" : "Reativar acesso"}
        </button>

        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={pendente}
          onClick={aoFechar}
        >
          Fechar
        </button>
      </div>

      <div style={{ marginTop: "1.6rem", paddingTop: "1.2rem", borderTop: "1px solid var(--line-on-light)" }}>
        {confirmandoRemocao ? (
          <div className="alerta alerta--erro">
            <p style={{ marginBottom: ".8rem" }}>
              <strong>Remover o acesso de {usuario.nome} a esta igreja?</strong> As sessões abertas
              dela aqui são encerradas na hora. A conta continua existindo — se esta pessoa também
              serve em outra igreja, o acesso de lá não é afetado.
            </p>
            <div style={{ display: "flex", gap: ".6rem" }}>
              <button
                type="button"
                className="btn btn--sm"
                disabled={pendente}
                onClick={() => executar(() => removerUsuario(usuario.membershipId), true)}
              >
                {pendente ? "Removendo…" : "Sim, remover"}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={pendente}
                onClick={() => setConfirmandoRemocao(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            style={{ color: "#cf222e" }}
            disabled={pendente}
            onClick={() => setConfirmandoRemocao(true)}
          >
            Remover desta igreja
          </button>
        )}
      </div>
    </div>
  );
}

function EtiquetaPapel({ papel }: { papel: Papel }) {
  const classes: Record<Papel, string> = {
    ADMIN: "urgente",
    PASTOR: "andamento",
    SECRETARIA: "novo",
    LIDER_CELULA: "concluido",
    MEMBRO: "spam",
  };
  return <span className={`etiqueta etiqueta--${classes[papel]}`}>{ROTULOS_PAPEL[papel]}</span>;
}
