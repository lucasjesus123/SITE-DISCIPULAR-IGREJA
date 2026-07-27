import { exigirPermissao } from "@/lib/auth/rbac";
// Uso auditado (SEC-006): apenas modelos GLOBAIS (Tenant/User/Membership/Sessao),
// sempre com tenantId à mão ou alvo resolvido no escopo antes de mutar. Ver AUDITORIA_SEGURANCA.md §5.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/db/prisma";
import { FormularioConfiguracoes } from "@/components/painel/FormularioConfiguracoes";
import { PainelLgpd } from "@/components/painel/PainelLgpd";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações" };

/**
 * Configurações da igreja.
 *
 * Reúne o que identifica a instituição (nome, razão social, CNPJ, fuso), o que
 * ela liga e desliga no produto (módulos) e o que a lei exige que ela consiga
 * fazer sozinha (LGPD: acesso, portabilidade e eliminação).
 *
 * A tela é toda de ADMIN. Não porque os dados sejam secretos — o nome da igreja
 * está no site —, mas porque as consequências são administrativas: um CNPJ
 * errado quebra recibo, um módulo desligado some do site, e a exclusão LGPD é
 * irreversível por definição.
 */

/** Rótulos e explicação de cada módulo. Espelham a allowlist do servidor em
 *  `acoes.ts` — lá é controle, aqui é texto de tela. */
const MODULOS_UI: { chave: string; rotulo: string; descricao: string }[] = [
  { chave: "oracao", rotulo: "Pedidos de oração", descricao: "Formulário no site e no app, com mural opcional." },
  { chave: "batismo", rotulo: "Batismos", descricao: "Solicitação, preparo e agendamento." },
  { chave: "celulas", rotulo: "Células", descricao: "Mapa de células e relatório de encontros." },
  { chave: "cursos", rotulo: "Escola", descricao: "Cursos com inscrição pelo site." },
  { chave: "mensagens", rotulo: "Mensagens", descricao: "Pregações publicadas com vídeo." },
  { chave: "agenda", rotulo: "Agenda", descricao: "Programação semanal e eventos." },
  { chave: "aoVivo", rotulo: "Transmissão ao vivo", descricao: "Indicador de culto ao vivo no site e no app." },
  { chave: "contribuicao", rotulo: "Contribuição", descricao: "Página de PIX e dados para ofertas." },
  { chave: "app", rotulo: "Aplicativo do membro", descricao: "PWA com área logada para os membros." },
];

export default async function PainelConfiguracoes() {
  const ctx = await exigirPermissao("config.gerenciar");

  const [tenant, siteConfig, liveConfig] = await Promise.all([
    // `Tenant` é modelo GLOBAL: o cliente escopado não o filtra. O `where` é
    // escrito à mão com o id resolvido pelo hostname em `exigirPermissao()`.
    prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: {
        nome: true,
        razaoSocial: true,
        cnpj: true,
        slug: true,
        plano: true,
        status: true,
        limiteUsuarios: true,
        limitePessoas: true,
        limiteStorageMb: true,
        criadoEm: true,
      },
    }),
    // Dados de igreja: pelo cliente escopado.
    ctx.db.siteConfig.findFirst({ select: { modulos: true } }),
    ctx.db.liveConfig.findFirst({ select: { fusoHorario: true } }),
  ]);

  if (!tenant) {
    return <div className="vazio">Não foi possível carregar os dados desta igreja.</div>;
  }

  const modulos = (siteConfig?.modulos as Record<string, boolean> | null) ?? {};

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Configurações</h1>
          <p className="painel__sub">
            Identificação da igreja, módulos ativos e os direitos que a LGPD garante às pessoas
            cadastradas.
          </p>
        </div>
      </div>

      <FormularioConfiguracoes
        inicial={{
          nome: tenant.nome,
          razaoSocial: tenant.razaoSocial ?? "",
          cnpj: tenant.cnpj ?? "",
          fusoHorario: liveConfig?.fusoHorario ?? "America/Sao_Paulo",
        }}
        modulos={MODULOS_UI.map((m) => ({ ...m, ligado: modulos[m.chave] === true }))}
      />

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Plano e limites</h2>
        <p className="secao-painel__desc">
          Somente leitura. Plano, limites e situação comercial são definidos pela plataforma — se um
          administrador de igreja pudesse editá-los aqui, o teto de plano deixaria de existir e uma
          igreja suspensa por inadimplência se reativaria sozinha. Para mudar, fale com o suporte.
        </p>

        <div className="tabela-wrap">
          <table className="tabela">
            <tbody>
              <Linha rotulo="Endereço da plataforma" valor={`${tenant.slug}.discipular.app`} />
              <Linha rotulo="Plano" valor={tenant.plano} />
              <Linha rotulo="Situação" valor={rotuloStatus(tenant.status)} />
              <Linha rotulo="Usuários do painel" valor={`até ${tenant.limiteUsuarios}`} />
              <Linha rotulo="Pessoas cadastradas" valor={`até ${tenant.limitePessoas.toLocaleString("pt-BR")}`} />
              <Linha rotulo="Armazenamento" valor={`${tenant.limiteStorageMb} MB`} />
              <Linha rotulo="Cliente desde" valor={tenant.criadoEm.toLocaleDateString("pt-BR")} />
            </tbody>
          </table>
        </div>
      </section>

      <PainelLgpd />
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr>
      <th scope="row" style={{ width: "40%" }}>
        {rotulo}
      </th>
      <td>{valor}</td>
    </tr>
  );
}

function rotuloStatus(status: string): string {
  const mapa: Record<string, string> = {
    TRIAL: "Em avaliação",
    ATIVO: "Ativa",
    SUSPENSO: "Suspensa",
    CANCELADO: "Cancelada",
  };
  return mapa[status] ?? status;
}
