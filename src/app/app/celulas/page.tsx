import { z } from "zod";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, nomeDia, type CelulaPublica } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { FiltroCelulas } from "@/components/app/FiltroCelulas";
import {
  Campo,
  CampoMarcacao,
  CampoSelecao,
  CampoTexto,
  Formulario,
} from "@/components/site/Formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Células" };

/**
 * "Encontre uma célula".
 *
 * TELA PÚBLICA, e é proposital: célula é a principal porta de entrada da
 * igreja. Quem ainda não é membro é exatamente quem precisa achar uma.
 *
 * =============================================================================
 * O ENDEREÇO EXATO NÃO APARECE AQUI. NUNCA.
 * =============================================================================
 * Uma célula acontece na SALA DA CASA DE ALGUÉM — quase sempre uma família,
 * muitas vezes com crianças. Publicar "Rua X, 123, apto 402, sextas às 20h" numa
 * página aberta à internet é publicar quando aquela casa está cheia e, pior,
 * quando ela está vazia. É informação de valor operacional para furto e assédio.
 *
 * Por isso a proteção é estrutural, não cosmética:
 *   - `Celula` no schema nem tem campo de endereço completo;
 *   - `carregarDadosSite` seleciona apenas nome, bairro, cidade, dia e horário;
 *   - o endereço é combinado por contato direto, depois do "quero participar".
 *
 * Esconder o endereço só no JSX seria inútil: ele iria no payload do RSC e
 * apareceria no DevTools de qualquer visitante. Aqui ele nunca sai do banco.
 */

const POR_PAGINA = 15;

/**
 * Filtros da URL. Lista fechada de três chaves; qualquer outro parâmetro é
 * ignorado. `dia` é numérico com faixa; `cidade` e `bairro` são texto curto e,
 * mais importante, são conferidos contra os valores que EXISTEM na base logo
 * abaixo — o que transforma texto livre em lista fechada de verdade.
 */
const schemaFiltros = z.object({
  cidade: z.string().trim().max(100).optional(),
  bairro: z.string().trim().max(100).optional(),
  dia: z.coerce.number().int().min(0).max(6).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export default async function AppCelulas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados, params] = await Promise.all([
    carregarDadosSite(tenant.id),
    searchParams,
    // Garante o cookie CSRF antes de o formulário abaixo ser renderizado.
    obterTokenCsrf(),
  ]);

  /**
   * `?cidade=a&cidade=b` chega como array. Em vez de deixar o Zod explodir e
   * perder TODOS os filtros por causa de um, pegamos o primeiro valor de cada
   * chave conhecida e descartamos o resto.
   */
  const bruto = {
    cidade: primeiro(params.cidade),
    bairro: primeiro(params.bairro),
    dia: primeiro(params.dia),
    pagina: primeiro(params.pagina),
  };
  const filtros = schemaFiltros.safeParse(bruto).data ?? schemaFiltros.parse({});

  const celulas = dados.celulas;

  // ---- Listas de opções derivadas dos dados reais.
  const cidades = distintos(celulas.map((c) => c.cidade));

  // Um filtro que não corresponde a nenhuma cidade cadastrada é simplesmente
  // descartado. Assim o valor usado na comparação sempre veio do nosso banco.
  const cidade = filtros.cidade && cidades.includes(filtros.cidade) ? filtros.cidade : null;

  const bairros = distintos(
    celulas.filter((c) => cidade === null || c.cidade === cidade).map((c) => c.bairro),
  );
  const bairro = filtros.bairro && bairros.includes(filtros.bairro) ? filtros.bairro : null;

  const dia = filtros.dia ?? null;

  const filtradas = celulas.filter(
    (c) =>
      (cidade === null || c.cidade === cidade) &&
      (bairro === null || c.bairro === bairro) &&
      (dia === null || c.diaSemana === dia),
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(filtros.pagina, totalPaginas);
  const visiveis = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Perto de você</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Encontre uma célula</h1>
        <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".7rem" }}>
          Grupos pequenos que se reúnem durante a semana para conversar, orar e caminhar juntos.
          Escolha o bairro e o dia que cabem na sua rotina.
        </p>
      </header>

      {celulas.length === 0 ? (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <div style={estiloAviso}>
            Ainda não temos células cadastradas por aqui. Envie seus dados abaixo e a gente avisa
            assim que abrir uma perto de você.
          </div>
        </section>
      ) : (
        <>
          <section style={{ padding: "0 1.25rem 1.5rem" }}>
            <FiltroCelulas
              cidades={cidades}
              bairros={bairros}
              cidade={cidade}
              bairro={bairro}
              dia={dia}
              totalFiltrado={filtradas.length}
            />
          </section>

          <section style={{ padding: "0 1.25rem 1.5rem" }}>
            <div style={{ display: "grid", gap: ".7rem" }}>
              {visiveis.map((celula) => (
                <CartaoCelula key={celula.id} celula={celula} />
              ))}
            </div>

            {totalPaginas > 1 && (
              <nav className="paginacao" aria-label="Paginação">
                {pagina > 1 && <a href={linkPagina(cidade, bairro, dia, pagina - 1)}>← Anterior</a>}
                <span aria-current="page">
                  {pagina} de {totalPaginas}
                </span>
                {pagina < totalPaginas && (
                  <a href={linkPagina(cidade, bairro, dia, pagina + 1)}>Próxima →</a>
                )}
              </nav>
            )}
          </section>
        </>
      )}

      {/* ------------------------------------------------- QUERO PARTICIPAR */}
      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <div
          style={{
            padding: "1.4rem",
            border: "1px solid var(--gold-line)",
            borderRadius: "var(--radius-lg)",
            background: "rgb(var(--gold-rgb) / .06)",
          }}
        >
          <p style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>Quero participar</p>
          <p style={{ fontSize: ".86rem", color: "var(--bone-dim)", marginTop: ".5rem", lineHeight: 1.6 }}>
            Deixe seu contato e o líder fala com você para combinar o endereço. Não publicamos o
            endereço das células aqui porque os encontros acontecem na casa de uma família.
          </p>

          <div style={{ marginTop: "1.4rem" }}>
            <Formulario tipo="quero-celula" textoBotao="Quero participar">
              <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
              <Campo
                nome="telefone"
                rotulo="WhatsApp"
                tipo="tel"
                obrigatorio
                autoComplete="tel"
                maxLength={20}
              />

              {visiveis.length > 0 && (
                <CampoSelecao
                  nome="celulaId"
                  rotulo="Alguma célula em especial?"
                  ajuda="Opcional. Se não souber, a gente indica a mais perto de você."
                  opcoes={filtradas.slice(0, 50).map((c) => ({
                    valor: c.id,
                    rotulo: rotuloCurto(c),
                  }))}
                />
              )}

              <Campo
                nome="bairro"
                rotulo="Seu bairro"
                maxLength={100}
                defaultValue={bairro ?? undefined}
              />
              <Campo
                nome="cidade"
                rotulo="Sua cidade"
                maxLength={100}
                defaultValue={cidade ?? undefined}
              />

              <CampoTexto
                nome="observacoes"
                rotulo="Quer nos contar algo?"
                linhas={3}
                maxLength={600}
              />

              <CampoMarcacao
                nome="consentimentoLgpd"
                obrigatorio
                rotulo="Autorizo o tratamento dos meus dados para que a igreja entre em contato comigo."
              />
            </Formulario>
          </div>
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------

function CartaoCelula({ celula }: { celula: CelulaPublica }) {
  const local = [celula.bairro, celula.cidade].filter(Boolean).join(" · ");
  const quando = [nomeDia(celula.diaSemana) || null, celula.horario].filter(Boolean).join(" às ");

  return (
    <article
      style={{
        padding: "1rem",
        background: "var(--ink-700)",
        border: "1px solid var(--line-on-dark)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <p style={{ fontWeight: 600, fontSize: ".97rem" }}>{celula.nome}</p>

      {local && (
        <p style={{ fontSize: ".82rem", color: "var(--bone-dim)", marginTop: ".35rem" }}>{local}</p>
      )}

      {quando && (
        <p
          style={{
            fontSize: ".72rem",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--gold)",
            fontWeight: 600,
            marginTop: ".55rem",
          }}
        >
          {quando}
        </p>
      )}

      {/*
        Só o PRIMEIRO NOME do líder. O nome completo, somado ao bairro, já é
        material suficiente para localizar a casa em uma busca — e o telefone
        dele (que existe no banco) não sai daqui de jeito nenhum.
      */}
      {celula.liderNome && (
        <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: ".5rem" }}>
          Liderança: {primeiroNome(celula.liderNome)}
        </p>
      )}
    </article>
  );
}

const estiloAviso: React.CSSProperties = {
  padding: "1.5rem",
  background: "var(--ink-700)",
  border: "1px solid var(--line-on-dark)",
  borderRadius: "var(--radius-lg)",
  color: "var(--bone-dim)",
  fontSize: ".9rem",
  lineHeight: 1.6,
};

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Valores únicos, sem nulos, em ordem alfabética brasileira. */
function distintos(valores: (string | null)[]): string[] {
  const conjunto = new Set<string>();
  for (const v of valores) {
    const limpo = v?.trim();
    if (limpo) conjunto.add(limpo);
  }
  return [...conjunto].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function rotuloCurto(celula: CelulaPublica): string {
  const partes = [celula.nome, celula.bairro, nomeDia(celula.diaSemana) || null].filter(Boolean);
  return partes.join(" · ");
}

function linkPagina(
  cidade: string | null,
  bairro: string | null,
  dia: number | null,
  pagina: number,
): string {
  const params = new URLSearchParams();
  if (cidade) params.set("cidade", cidade);
  if (bairro) params.set("bairro", bairro);
  if (dia !== null) params.set("dia", String(dia));
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `/app/celulas?${query}` : "/app/celulas";
}
