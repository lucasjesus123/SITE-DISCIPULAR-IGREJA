"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarPessoasParaVinculo } from "@/app/painel/caixa-entrada/acoes";
import {
  excluirPessoaDefinitivamente,
  exportarDadosPessoa,
} from "@/app/painel/configuracoes/acoes";

/**
 * Direitos do titular (LGPD).
 *
 * DUAS OPERAÇÕES, DOIS PESOS.
 *
 * A exportação atende o direito de acesso e portabilidade (art. 18, II e V):
 * gera o dossiê completo da pessoa em JSON. A exclusão atende o direito de
 * eliminação (art. 18, VI) e é definitiva.
 *
 * DECISÕES DE INTERFACE QUE SÃO SEGURANÇA, NÃO ESTILO
 *
 *  - A busca de pessoas exige 2 caracteres e devolve no máximo 10 resultados
 *    (limite imposto no servidor). A tela não oferece "listar todos": este não
 *    é o lugar de navegar pela base.
 *  - O download é montado no NAVEGADOR, a partir do JSON que a ação devolveu.
 *    Nenhum arquivo é escrito no servidor — um dossiê esquecido em disco, sem
 *    dono e sem expiração, é vazamento esperando acontecer.
 *  - A URL temporária do blob é revogada logo após o clique, para que o
 *    conteúdo não fique pendurado na memória da aba.
 *  - A exclusão pede o nome digitado. Numa lista onde as linhas se parecem, o
 *    erro provável não é o ato malicioso: é o clique na pessoa errada.
 */

interface PessoaEncontrada {
  id: string;
  nome: string;
  email: string | null;
  status: string;
}

export function PainelLgpd() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<PessoaEncontrada[] | null>(null);
  const [selecionada, setSelecionada] = useState<PessoaEncontrada | null>(null);

  const [confirmacao, setConfirmacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modoExclusao, setModoExclusao] = useState(false);

  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);

  function buscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(null);
    setSelecionada(null);
    iniciar(async () => {
      const encontrados = await buscarPessoasParaVinculo(termo);
      setResultados(encontrados);
    });
  }

  function exportar(pessoa: PessoaEncontrada) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await exportarDadosPessoa(pessoa.id);

      if (!resultado.ok || !resultado.conteudo) {
        setAviso({ tom: "erro", texto: resultado.mensagem });
        return;
      }

      baixarJson(resultado.conteudo, resultado.nomeArquivo ?? "dados-pessoais.json");
      setAviso({ tom: "sucesso", texto: resultado.mensagem });
    });
  }

  function excluir() {
    if (!selecionada) return;
    setAviso(null);
    iniciar(async () => {
      const resultado = await excluirPessoaDefinitivamente(selecionada.id, { confirmacao, motivo });
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });

      if (resultado.ok) {
        setSelecionada(null);
        setResultados(null);
        setTermo("");
        setConfirmacao("");
        setMotivo("");
        setModoExclusao(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Dados pessoais e LGPD</h2>
      <p className="secao-painel__desc">
        A igreja é a controladora dos dados que guarda. Quando alguém pede para ver o que existe
        sobre ela, ou pede a exclusão, a resposta sai daqui. Toda exportação e toda exclusão ficam
        registradas na auditoria, com quem fez e quando.
      </p>

      {aviso && (
        <div
          className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`}
          role={aviso.tom === "erro" ? "alert" : "status"}
          style={{ marginBottom: "1.2rem" }}
        >
          {aviso.texto}
        </div>
      )}

      <form onSubmit={buscar} noValidate>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="lgpd-busca">
            Encontrar a pessoa
          </label>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <input
              id="lgpd-busca"
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              maxLength={80}
              placeholder="Nome, e-mail ou telefone"
              style={{ flex: 1, minWidth: "220px" }}
            />
            <button type="submit" className="btn btn--sm" disabled={pendente || termo.trim().length < 2}>
              {pendente ? "Buscando…" : "Buscar"}
            </button>
          </div>
          <span className="campo__ajuda">
            Mínimo de 2 caracteres. A busca devolve no máximo 10 resultados — esta tela não serve
            para navegar pela base de membros.
          </span>
        </div>
      </form>

      {resultados !== null && resultados.length === 0 && (
        <div className="vazio">Nenhuma pessoa encontrada com esse termo.</div>
      )}

      {resultados !== null && resultados.length > 0 && (
        <div className="tabela-wrap" style={{ marginTop: "1rem" }}>
          <table className="tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {resultados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.nome}</div>
                    {p.email && (
                      <div className="dim" style={{ fontSize: ".78rem" }}>
                        {p.email}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="etiqueta etiqueta--concluido">{p.status}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline-gold"
                        disabled={pendente}
                        onClick={() => exportar(p)}
                      >
                        Exportar dados
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        style={{ color: "#cf222e" }}
                        disabled={pendente}
                        onClick={() => {
                          setSelecionada(p);
                          setModoExclusao(true);
                          setConfirmacao("");
                          setMotivo("");
                          setAviso(null);
                        }}
                      >
                        Excluir definitivamente
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modoExclusao && selecionada && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.4rem" }}>
          <p style={{ marginBottom: ".9rem" }}>
            <strong>Excluir definitivamente os dados de {selecionada.nome}?</strong>
          </p>
          <p style={{ marginBottom: ".9rem", fontSize: ".88rem" }}>
            Serão apagados: o cadastro, o histórico de contatos pastorais, os pedidos de oração, as
            solicitações de batismo, as matrículas em cursos e as mensagens que a pessoa enviou pelo
            site. <strong>Não há como desfazer.</strong> Na auditoria fica apenas o registro de que
            a exclusão foi feita — sem o conteúdo.
          </p>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="lgpd-confirmacao">
              Digite o nome exatamente como está no cadastro
            </label>
            <input
              id="lgpd-confirmacao"
              type="text"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              maxLength={160}
              autoComplete="off"
              placeholder={selecionada.nome}
            />
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="lgpd-motivo">
              Motivo (opcional, fica na auditoria)
            </label>
            <input
              id="lgpd-motivo"
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              autoComplete="off"
              placeholder="Ex.: pedido de exclusão feito por e-mail em 12/03"
            />
          </div>

          <div style={{ display: "flex", gap: ".6rem", marginTop: ".6rem" }}>
            <button
              type="button"
              className="btn btn--sm"
              disabled={pendente || confirmacao !== selecionada.nome}
              onClick={excluir}
            >
              {pendente ? "Excluindo…" : "Sim, excluir definitivamente"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={pendente}
              onClick={() => {
                setModoExclusao(false);
                setSelecionada(null);
                setConfirmacao("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Monta o download no navegador.
 *
 * O `revokeObjectURL` não é limpeza cosmética: sem ele a URL do blob continua
 * válida enquanto a aba estiver aberta, e o conteúdo — o dossiê completo de uma
 * pessoa — segue acessível a qualquer script rodando naquela página.
 */
function baixarJson(conteudo: string, nomeArquivo: string): void {
  const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nomeArquivo;
  document.body.appendChild(ancora);
  ancora.click();
  ancora.remove();

  URL.revokeObjectURL(url);
}
