"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adicionarDominio } from "@/app/plataforma/acoes";
import { AcoesDominio, InstrucaoDns } from "@/components/plataforma/AcoesDominio";

export interface DominioListado {
  id: string;
  hostname: string;
  status: "PENDENTE" | "VERIFICADO" | "ERRO";
  principal: boolean;
  verificadoEm: string | null;
  ultimoErro: string | null;
}

/**
 * Domínios de uma igreja: cadastro, verificação e escolha do principal.
 *
 * O CADASTRO NÃO COLOCA O DOMÍNIO NO AR
 * Ele nasce PENDENTE e só passa a servir conteúdo depois que a verificação por
 * TXT confirma que quem cadastrou controla o DNS. É o que impede alguém de
 * reivindicar o domínio de outra igreja e esperar o dia em que ela apontar o
 * DNS para cá — o resolvedor recusa domínio não verificado.
 */
export function DominiosDaIgreja({
  tenantId,
  hostSubdominio,
  dominios,
}: {
  tenantId: string;
  hostSubdominio: string;
  dominios: DominioListado[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [hostname, setHostname] = useState("");
  const [mensagem, setMensagem] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [registroDns, setRegistroDns] = useState<{ nome: string; valor: string } | null>(null);

  function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensagem(null);
    setRegistroDns(null);

    iniciar(async () => {
      const resultado = await adicionarDominio(tenantId, hostname);
      setMensagem({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });

      if (resultado.registroDns) {
        setRegistroDns({ nome: resultado.registroDns.nome, valor: resultado.registroDns.valor });
      }
      if (resultado.ok) {
        setHostname("");
        router.refresh();
      }
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Domínios</h2>
      <p className="secao-painel__desc">
        Enquanto não houver domínio próprio verificado, a igreja responde em{" "}
        <strong>{hostSubdominio}</strong>. Esse endereço existe sempre e não pode ser removido.
      </p>

      <form onSubmit={cadastrar} style={{ display: "flex", gap: ".6rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div className="campo" style={{ flex: 1, minWidth: "240px" }}>
          <label className="campo__rotulo" htmlFor="novo-dominio">
            Novo domínio
          </label>
          <input
            id="novo-dominio"
            name="hostname"
            type="text"
            value={hostname}
            onChange={(evento) => setHostname(evento.target.value)}
            maxLength={253}
            placeholder="igrejaexemplo.com.br"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="campo__ajuda">Sem http:// e sem barra final. O www é tratado como apelido.</span>
        </div>
        <button type="submit" className="btn btn--sm" disabled={pendente || hostname.trim().length < 4}>
          {pendente ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>

      {mensagem && (
        <div className={`alerta alerta--${mensagem.tom === "sucesso" ? "sucesso" : "erro"}`} role="status" style={{ marginBottom: "1rem" }}>
          {mensagem.texto}
        </div>
      )}

      {registroDns && (
        <div style={{ marginBottom: "1.4rem" }}>
          <InstrucaoDns nome={registroDns.nome} valor={registroDns.valor} />
        </div>
      )}

      {dominios.length === 0 ? (
        <div className="vazio">Nenhum domínio próprio cadastrado.</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {dominios.map((dominio) => (
            <article
              key={dominio.id}
              style={{
                border: "1px solid var(--line-on-light)",
                borderRadius: "var(--radius-lg)",
                padding: "1rem 1.1rem",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center", marginBottom: ".7rem" }}>
                <strong style={{ fontSize: "1rem" }}>{dominio.hostname}</strong>
                <EtiquetaDominio status={dominio.status} />
                {dominio.principal && <span className="etiqueta etiqueta--andamento">Principal</span>}
              </div>

              {dominio.verificadoEm && (
                <p style={{ fontSize: ".78rem", color: "var(--graphite-faint)", marginBottom: ".6rem" }}>
                  Verificado em {dominio.verificadoEm}
                </p>
              )}

              {dominio.ultimoErro && (
                <p style={{ fontSize: ".8rem", color: "#cf222e", marginBottom: ".6rem" }}>
                  Último erro: {dominio.ultimoErro}
                </p>
              )}

              <AcoesDominio
                tenantId={tenantId}
                dominioId={dominio.id}
                hostname={dominio.hostname}
                status={dominio.status}
                principal={dominio.principal}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function EtiquetaDominio({ status }: { status: string }) {
  const mapa: Record<string, { classe: string; rotulo: string }> = {
    VERIFICADO: { classe: "novo", rotulo: "Verificado" },
    PENDENTE: { classe: "andamento", rotulo: "Aguardando DNS" },
    ERRO: { classe: "urgente", rotulo: "Erro" },
  };
  const item = mapa[status] ?? { classe: "concluido", rotulo: status };
  return <span className={`etiqueta etiqueta--${item.classe}`}>{item.rotulo}</span>;
}
