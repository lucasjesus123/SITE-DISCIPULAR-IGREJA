"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * =============================================================================
 * FRONTEIRA DE ERRO DO PAINEL
 * =============================================================================
 *
 * POR QUE ELA PRECISA SER 'use client'
 * Uma error boundary do React só funciona no cliente: é ela que captura a
 * exceção lançada durante a renderização e troca a árvore quebrada por esta
 * tela. Sem este arquivo, o Next cai na página de erro genérica dele e o
 * usuário perde o menu, o contexto e qualquer caminho de volta.
 *
 * O QUE ESTA TELA MOSTRA — E O QUE ELA NUNCA MOSTRA
 *
 * MOSTRA: uma frase em português e o `digest`.
 *
 * NUNCA MOSTRA: `error.message`, `error.stack`, nome de tabela, nome de coluna,
 * nome de constraint, caminho de arquivo, versão de biblioteca.
 *
 * A razão é concreta. Um `PrismaClientKnownRequestError` cru revela o desenho
 * do banco — que tabelas existem, como se chamam as colunas, quais índices são
 * únicos — e às vezes traz o VALOR que causou o conflito, que pode ser o e-mail
 * ou o telefone de outra pessoa. Um stack trace revela a estrutura de pastas do
 * servidor e as versões instaladas, que é a lista de compras de quem procura
 * uma vulnerabilidade conhecida. Nada disso ajuda a secretária que só quer
 * salvar um cadastro; tudo isso ajuda quem está sondando o sistema.
 *
 * O QUE É O `digest`
 * O Next calcula um hash do erro real no SERVIDOR, registra a mensagem completa
 * no log e envia ao navegador apenas esse hash. É o mesmo raciocínio do `ref`
 * de `src/lib/http/erros.ts`: o usuário passa um código curto ao suporte, o
 * suporte encontra o erro inteiro no log em segundos, e nenhuma informação
 * sobre a causa atravessa a rede. Por isso o digest é exibido em destaque e com
 * botão de copiar — ele é a única coisa aqui que tem valor para o diagnóstico.
 *
 * Repare que a tentativa de recuperação (`reset`) vem antes do "voltar ao
 * início": a maioria dos erros neste painel é transitória (uma consulta que
 * expirou, uma conexão do pool que caiu), e refazer a renderização resolve sem
 * que ninguém perca o lugar onde estava.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /**
     * Registro no console do NAVEGADOR, para o desenvolvedor que está com o
     * DevTools aberto. Não é telemetria e não sai da máquina: mandar o objeto
     * de erro para um serviço externo colocaria dado de igreja em trânsito para
     * um terceiro que ninguém autorizou.
     *
     * Em produção `error.message` já chega aqui como uma mensagem genérica — o
     * Next substitui o texto real antes de serializar justamente para que ele
     * não vaze pelo cliente.
     */
    console.error("[painel] erro capturado pela fronteira", {
      digest: error.digest,
      nome: error.name,
    });
  }, [error]);

  return (
    <div style={{ maxWidth: "38rem" }}>
      <p className="eyebrow">Algo deu errado</p>
      <h1 className="painel__titulo">Não conseguimos carregar esta tela</h1>

      <p style={{ marginTop: "1rem", lineHeight: 1.7, color: "var(--graphite-dim)" }}>
        A falha foi registrada automaticamente e nossa equipe consegue localizá-la pelo código
        abaixo. Nenhum dado da igreja foi perdido: o erro aconteceu ao montar a página, não ao
        salvar informação.
      </p>

      {error.digest && (
        <div className="alerta alerta--aviso" style={{ marginTop: "1.4rem" }}>
          <p className="cartao__rotulo">Código para o suporte</p>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "1.05rem",
              letterSpacing: ".04em",
              marginTop: ".35rem",
              wordBreak: "break-all",
            }}
          >
            {error.digest}
          </p>
          <p style={{ fontSize: ".82rem", marginTop: ".5rem" }}>
            Informe este código ao abrir um chamado. Ele identifica exatamente esta falha no
            registro do servidor — e, sozinho, não revela nada sobre os dados da igreja.
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: "1.8rem" }}>
        <button type="button" className="btn" onClick={() => reset()}>
          Tentar de novo
        </button>
        <Link href="/painel" className="btn btn--ghost">
          Voltar ao início do painel
        </Link>
      </div>

      <p className="dim" style={{ fontSize: ".82rem", marginTop: "1.6rem" }}>
        Se o erro se repetir nesta mesma tela, provavelmente não é temporário. Nesse caso, envie o
        código acima junto com o endereço da página.
      </p>
    </div>
  );
}
