"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@prisma/client";
import { convidarUsuario } from "@/app/painel/usuarios/acoes";

/**
 * Formulário de convite.
 *
 * ESTE COMPONENTE NÃO DECIDE NADA.
 *
 * A lista de papéis que ele mostra vem pronta do servidor
 * (`papeisAtribuiveis(ctx.papel)`) e serve só para não oferecer portas que a
 * pessoa não pode abrir. Quem realmente recusa um papel fora do alcance é a
 * Server Action — um `<option value="ADMIN">` acrescentado pelo DevTools não
 * promove ninguém.
 *
 * O RESULTADO É SEMPRE A MESMA FRASE
 * O servidor devolve uma mensagem única, exista ou não conta com aquele e-mail
 * na plataforma. Não tente enriquecer isso na tela ("conta criada" vs "usuário
 * já existia"): a diferença reconstruiria um oráculo de enumeração de contas —
 * e saber quem frequenta qual igreja é dado sensível sob a LGPD.
 */

export const ROTULOS_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  PASTOR: "Pastor",
  SECRETARIA: "Secretaria",
  LIDER_CELULA: "Líder de célula",
  MEMBRO: "Membro (só o aplicativo)",
};

const DESCRICOES_PAPEL: Record<Papel, string> = {
  ADMIN: "Acesso total, incluindo usuários, configurações e exclusão de dados.",
  PASTOR: "Gestão pastoral completa, com observações pastorais e o site.",
  SECRETARIA: "Cadastros, triagem, agenda e cursos. Sem dado pastoral sensível.",
  LIDER_CELULA: "Enxerga somente a célula que lidera.",
  MEMBRO: "Não abre o painel de gestão; usa apenas o aplicativo.",
};

export function ConviteUsuario({
  papeisDisponiveis,
  celulas,
  vagasRestantes,
}: {
  papeisDisponiveis: Papel[];
  celulas: { id: string; nome: string }[];
  vagasRestantes: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [papel, setPapel] = useState<Papel>(papeisDisponiveis[0] ?? "MEMBRO");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});

  if (papeisDisponiveis.length === 0) return null;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = Object.fromEntries(new FormData(formulario));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await convidarUsuario(dados);

      if (resultado.ok) {
        setSucesso(resultado.mensagem);
        formulario.reset();
        setPapel(papeisDisponiveis[0] ?? "MEMBRO");
        router.refresh();
        return;
      }

      setErro(resultado.mensagem);
      setCampos(resultado.campos ?? {});
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Convidar alguém</h2>
      <p className="secao-painel__desc">
        A pessoa recebe as instruções de acesso por e-mail e escolhe a própria senha. Nenhuma senha
        é exibida aqui — nem para você. É o que garante que a credencial de um usuário nunca passe
        por WhatsApp, papel ou pela memória de quem convida.
      </p>

      {!aberto ? (
        <button type="button" className="btn" onClick={() => setAberto(true)}>
          Convidar usuário
        </button>
      ) : (
        <form onSubmit={enviar} noValidate>
          {erro && (
            <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.2rem" }}>
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="alerta alerta--sucesso" role="status" style={{ marginBottom: "1.2rem" }}>
              {sucesso}
            </div>
          )}
          {vagasRestantes === 0 && (
            <div className="alerta alerta--aviso" role="status" style={{ marginBottom: "1.2rem" }}>
              O limite de usuários ativos do plano foi atingido. Desative alguém que não usa mais o
              painel antes de convidar.
            </div>
          )}

          <div className="grid cols-2">
            <Campo rotulo="Nome" nome="nome" erros={campos.nome} obrigatorio>
              <input
                id="nome"
                name="nome"
                type="text"
                required
                maxLength={160}
                autoComplete="off"
                placeholder="Como a pessoa é conhecida na igreja"
              />
            </Campo>

            <Campo rotulo="E-mail" nome="email" erros={campos.email} obrigatorio>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                inputMode="email"
                placeholder="pessoa@exemplo.com"
              />
            </Campo>

            <Campo
              rotulo="Papel"
              nome="papel"
              erros={campos.papel}
              obrigatorio
              ajuda={DESCRICOES_PAPEL[papel]}
            >
              <select
                id="papel"
                name="papel"
                required
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
              >
                {papeisDisponiveis.map((p) => (
                  <option key={p} value={p}>
                    {ROTULOS_PAPEL[p]}
                  </option>
                ))}
              </select>
            </Campo>

            {/* A célula só aparece (e só é exigida) para líder de célula. */}
            {papel === "LIDER_CELULA" && (
              <Campo
                rotulo="Célula que lidera"
                nome="celulaId"
                erros={campos.celulaId}
                obrigatorio
                ajuda="É este vínculo que recorta a visão do líder à própria célula."
              >
                <select id="celulaId" name="celulaId" required defaultValue="">
                  <option value="">Escolha uma célula</option>
                  {celulas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </div>

          <div style={{ display: "flex", gap: ".6rem", marginTop: "1.4rem", flexWrap: "wrap" }}>
            <button type="submit" className="btn" disabled={pendente || vagasRestantes === 0}>
              {pendente ? "Enviando…" : "Enviar convite"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAberto(false);
                setErro(null);
                setSucesso(null);
                setCampos({});
              }}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Campo({
  rotulo,
  nome,
  erros,
  ajuda,
  obrigatorio,
  children,
}: {
  rotulo: string;
  nome: string;
  erros?: string[];
  ajuda?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      {children}
      {ajuda && <span className="campo__ajuda">{ajuda}</span>}
      {erros?.map((mensagem) => (
        <span key={mensagem} className="campo__erro">
          {mensagem}
        </span>
      ))}
    </div>
  );
}
