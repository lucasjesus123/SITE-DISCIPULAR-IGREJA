import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { id as idSchema } from "@/lib/validation/comum";
import { descreverEncontro, escopoDeCelula, nomeDoDia } from "@/app/painel/celulas/page";
import { FormularioCelula } from "@/components/painel/FormularioCelula";
import { RegistroEncontro } from "@/components/painel/RegistroEncontro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Célula" };

/** Quantos encontros entram nas médias do topo da tela. */
const JANELA_ENCONTROS = 8;

/**
 * Detalhe de uma célula: quem participa e o que foi relatado.
 *
 * O `escopoDeCelula()` entra no `where` da consulta, e não numa checagem
 * depois: se o líder de célula colar o ID da célula do vizinho, a consulta
 * simplesmente não devolve nada e a página vira 404 — a mesma resposta de um
 * ID que não existe. Nada no comportamento revela que aquela célula existe.
 */
export default async function DetalheCelula({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("celulas.ler");
  const { id: idBruto } = await params;

  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();
  const id = parse.data;

  const celula = await ctx.db.celula.findFirst({
    where: { id, ...escopoDeCelula(ctx) },
    select: {
      id: true,
      nome: true,
      descricao: true,
      diaSemana: true,
      horario: true,
      liderNome: true,
      liderTelefone: true,
      bairro: true,
      cidade: true,
      latitude: true,
      longitude: true,
      capacidade: true,
      ativa: true,
      campusId: true,
      criadoEm: true,
      campus: { select: { id: true, nome: true } },
    },
  });

  if (!celula) notFound();

  const [membros, encontros, campi] = await Promise.all([
    ctx.db.pessoa.findMany({
      where: { celulaId: celula.id, excluidoEm: null },
      orderBy: { nome: "asc" },
      take: 200,
      // Ficha resumida: a lista de membros não precisa de endereço nem de
      // observação pastoral, então esses campos nem saem do banco.
      select: { id: true, nome: true, telefone: true, status: true, batizado: true },
    }),
    ctx.db.encontroCelula.findMany({
      where: { celulaId: celula.id },
      orderBy: { data: "desc" },
      take: 24,
      select: {
        id: true,
        data: true,
        presentes: true,
        visitantes: true,
        decisoes: true,
        ofertaCentavos: true,
        observacoes: true,
      },
    }),
    ctx.pode("celulas.gerenciar")
      ? ctx.db.campus.findMany({
          where: { ativo: true },
          select: { id: true, nome: true },
          orderBy: [{ ordem: "asc" }, { nome: "asc" }],
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  await auditar(ctx, {
    acao: "celula.ler",
    alvoTipo: "Celula",
    alvoId: celula.id,
    detalhes: { membros: membros.length },
  });

  const recentes = encontros.slice(0, JANELA_ENCONTROS);
  const mediaPresentes =
    recentes.length > 0
      ? Math.round(recentes.reduce((soma, e) => soma + e.presentes, 0) / recentes.length)
      : 0;
  const visitantesRecentes = recentes.reduce((soma, e) => soma + e.visitantes, 0);
  const decisoesRecentes = recentes.reduce((soma, e) => soma + e.decisoes, 0);
  const ofertaRecente = recentes.reduce((soma, e) => soma + e.ofertaCentavos, 0);

  const lotada = celula.capacidade !== null && membros.length >= celula.capacidade;

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/celulas" className="link" style={{ fontSize: ".72rem" }}>
              ← Células
            </Link>
          </p>
          <h1 className="painel__titulo">{celula.nome}</h1>
          <p className="painel__sub">
            {descreverEncontro(celula.diaSemana, celula.horario)}
            {celula.bairro || celula.cidade
              ? ` · ${[celula.bairro, celula.cidade].filter(Boolean).join(", ")}`
              : ""}
            {celula.campus?.nome ? ` · ${celula.campus.nome}` : ""}
            {!celula.ativa && (
              <span className="etiqueta etiqueta--spam" style={{ marginLeft: ".6rem" }}>
                Inativa
              </span>
            )}
          </p>
        </div>
      </div>

      {lotada && (
        <div className="alerta alerta--aviso" role="note" style={{ marginBottom: "1.5rem" }}>
          <strong>Célula no limite.</strong> São {membros.length} pessoas para uma capacidade de{" "}
          {celula.capacidade}. Vale conversar sobre multiplicar.
        </div>
      )}

      <div className="cartoes">
        <div className="cartao">
          <p className="cartao__rotulo">Pessoas na célula</p>
          <p className="cartao__valor">{membros.length}</p>
          {celula.capacidade !== null && (
            <p className="cartao__nota">Capacidade: {celula.capacidade}</p>
          )}
        </div>
        <div className="cartao">
          <p className="cartao__rotulo">Média de presentes</p>
          <p className="cartao__valor">{mediaPresentes}</p>
          <p className="cartao__nota">Últimos {recentes.length || 0} encontros relatados</p>
        </div>
        <div className="cartao">
          <p className="cartao__rotulo">Visitantes</p>
          <p className="cartao__valor">{visitantesRecentes}</p>
          <p className="cartao__nota">{decisoesRecentes} decisões no período</p>
        </div>
        <div className="cartao">
          <p className="cartao__rotulo">Ofertas do período</p>
          <p className="cartao__valor">{formatarDinheiro(ofertaRecente)}</p>
          <p className="cartao__nota">Somatório dos relatórios recentes</p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ------------------------------------------------ COLUNA PRINCIPAL */}
        <div>
          {ctx.pode("celulas.relatar") && (
            <RegistroEncontro celulaId={celula.id} dataSugerida={proximaDataSugerida(celula.diaSemana)} />
          )}

          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Encontros relatados</h2>
            {encontros.length === 0 ? (
              <div className="vazio" style={{ marginTop: "1rem" }}>
                Nenhum encontro relatado ainda.
              </div>
            ) : (
              <div className="tabela-wrap" style={{ marginTop: "1rem" }}>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Presentes</th>
                      <th>Visitantes</th>
                      <th>Decisões</th>
                      <th>Oferta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {encontros.map((e) => (
                      <tr key={e.id}>
                        <td>{formatarData(e.data)}</td>
                        <td>{e.presentes}</td>
                        <td>{e.visitantes}</td>
                        <td>{e.decisoes}</td>
                        <td>{formatarDinheiro(e.ofertaCentavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {ctx.pode("celulas.gerenciar") && (
            <section className="secao-painel">
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Editar célula</summary>
                <div style={{ marginTop: "1.4rem" }}>
                  <FormularioCelula
                    modo="editar"
                    celulaId={celula.id}
                    campi={campi}
                    inicial={{
                      nome: celula.nome,
                      descricao: celula.descricao ?? "",
                      campusId: celula.campusId ?? "",
                      diaSemana: celula.diaSemana !== null ? String(celula.diaSemana) : "",
                      horario: celula.horario ?? "",
                      liderNome: celula.liderNome ?? "",
                      liderTelefone: celula.liderTelefone ?? "",
                      bairro: celula.bairro ?? "",
                      cidade: celula.cidade ?? "",
                      latitude: celula.latitude !== null ? String(celula.latitude) : "",
                      longitude: celula.longitude !== null ? String(celula.longitude) : "",
                      capacidade: celula.capacidade !== null ? String(celula.capacidade) : "",
                      ativa: celula.ativa,
                    }}
                  />
                </div>
              </details>
            </section>
          )}
        </div>

        {/* ---------------------------------------------------- COLUNA LATERAL */}
        <div>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Liderança
            </h2>
            <p style={{ marginTop: ".6rem" }}>
              {celula.liderNome ?? <span className="dim">Sem líder registrado</span>}
            </p>
            {celula.liderTelefone && (
              <p className="dim" style={{ fontSize: ".84rem", marginTop: ".25rem" }}>
                {celula.liderTelefone}
              </p>
            )}
            {celula.descricao && (
              <p style={{ marginTop: "1rem", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {celula.descricao}
              </p>
            )}
            {celula.diaSemana !== null && (
              <p className="dim" style={{ fontSize: ".82rem", marginTop: "1rem" }}>
                Encontros toda {nomeDoDia(celula.diaSemana).toLowerCase()}
                {celula.horario ? `, às ${celula.horario}` : ""}.
              </p>
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Pessoas ({membros.length})
            </h2>
            {membros.length === 0 ? (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Ninguém vinculado a esta célula ainda.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: ".9rem 0 0", padding: 0, display: "grid", gap: ".7rem" }}>
                {membros.map((m) => (
                  <li key={m.id}>
                    {ctx.pode("pessoas.ler") ? (
                      <Link href={`/painel/pessoas/${m.id}`} style={{ fontWeight: 600 }}>
                        {m.nome}
                      </Link>
                    ) : (
                      <strong>{m.nome}</strong>
                    )}
                    <span className="dim" style={{ display: "block", fontSize: ".78rem", marginTop: ".15rem" }}>
                      {rotuloStatus(m.status)}
                      {m.batizado ? " · batizado" : ""}
                      {m.telefone ? ` · ${m.telefone}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {membros.length === 200 && (
              <p className="campo__ajuda" style={{ marginTop: ".9rem" }}>
                Exibindo as primeiras 200 pessoas.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Apresentação
// -----------------------------------------------------------------------------

/** `EncontroCelula.data` é @db.Date (meia-noite UTC): formatar em UTC evita
 *  mostrar o dia anterior em fusos negativos. */
function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(data);
}

/** Centavos → reais. A divisão só acontece na apresentação; o valor guardado
 *  continua sendo inteiro. */
function formatarDinheiro(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100,
  );
}

/**
 * Última ocorrência do dia de encontro (ou hoje, se a célula não tem dia fixo).
 * Preenche o formulário com a data que o líder quase sempre quer, sem impedir
 * que ele escolha outra.
 */
function proximaDataSugerida(diaSemana: number | null): string {
  const hoje = new Date();
  if (diaSemana === null) return hoje.toISOString().slice(0, 10);

  const diferenca = (hoje.getUTCDay() - diaSemana + 7) % 7;
  const alvo = new Date(hoje.getTime() - diferenca * 24 * 60 * 60 * 1000);
  return alvo.toISOString().slice(0, 10);
}

function rotuloStatus(s: string): string {
  const mapa: Record<string, string> = {
    VISITANTE: "Visitante",
    EM_ACOMPANHAMENTO: "Em acompanhamento",
    CONGREGANTE: "Congregante",
    MEMBRO: "Membro",
    INATIVO: "Inativo",
    TRANSFERIDO: "Transferido",
  };
  return mapa[s] ?? s;
}
