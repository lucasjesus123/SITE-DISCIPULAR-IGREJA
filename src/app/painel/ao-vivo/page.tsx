import { exigirPermissao } from "@/lib/auth/rbac";
import { estadoAoVivo } from "@/lib/youtube/live";
import { env } from "@/lib/env";
import { EditorAoVivo } from "@/components/painel/EditorAoVivo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transmissão ao vivo" };

/**
 * Configuração do indicador AO VIVO.
 *
 * Três modos, porque igrejas operam de jeitos diferentes:
 *
 *   AUTO   — consultamos a API do YouTube e detectamos sozinhos. Melhor
 *            experiência, mas depende de chave configurada e de cota.
 *   AGENDA — só considera "ao vivo" dentro das janelas de culto. Evita que
 *            uma live de câmera fixa deixe a luzinha acesa a semana toda.
 *   MANUAL — o operador liga e desliga. Funciona para quem transmite fora do
 *            YouTube, e é o plano B quando a detecção falha no meio do culto.
 */
export default async function PaginaAoVivo() {
  const ctx = await exigirPermissao("site.editar");

  const [config, estado] = await Promise.all([
    ctx.db.liveConfig.findFirst(),
    estadoAoVivo(ctx.tenant.id),
  ]);

  // Só informamos SE a chave existe, nunca o valor dela.
  const chaveConfigurada = env.YOUTUBE_API_KEY.length > 0;

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Transmissão ao vivo</h1>
          <p className="painel__sub">
            Quando o culto começa, uma luz vermelha pulsa no site e no aplicativo.
          </p>
        </div>

        <div
          className="cartao"
          style={{
            minWidth: 200,
            borderColor: estado.aoVivo ? "rgb(207 34 46 / .4)" : undefined,
            background: estado.aoVivo ? "rgb(207 34 46 / .05)" : undefined,
          }}
        >
          <span className="cartao__rotulo">Situação agora</span>
          <span style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 700, fontSize: "1.05rem" }}>
            {estado.aoVivo ? (
              <>
                <span className="ao-vivo__ponto" aria-hidden="true" />
                AO VIVO
              </>
            ) : (
              "Fora do ar"
            )}
          </span>
          <span className="cartao__nota">{descreverFonte(estado.fonte)}</span>
        </div>
      </div>

      {!chaveConfigurada && (
        <div className="alerta alerta--aviso" style={{ marginBottom: "1.5rem" }} role="note">
          <strong>Detecção automática indisponível.</strong> A integração com o YouTube não está
          configurada no servidor. Use o modo manual, ou peça ao suporte para habilitar a
          integração.
        </div>
      )}

      <EditorAoVivo
        inicial={{
          modo: (config?.modo as "AUTO" | "MANUAL" | "AGENDA") ?? "MANUAL",
          youtubeChannelId: config?.youtubeChannelId ?? "",
          youtubeVideoIdManual: config?.youtubeVideoIdManual ?? "",
          forcarAoVivo: config?.forcarAoVivo ?? false,
          janelas: Array.isArray(config?.janelas) ? (config.janelas as never) : [],
          fusoHorario: config?.fusoHorario ?? "America/Sao_Paulo",
          mensagemAoVivo: config?.mensagemAoVivo ?? "",
          exibirNoSite: config?.exibirNoSite ?? true,
          exibirNoApp: config?.exibirNoApp ?? true,
        }}
        aoVivoAgora={estado.aoVivo}
        autoDisponivel={chaveConfigurada}
      />
    </>
  );
}

function descreverFonte(fonte: string): string {
  switch (fonte) {
    case "api":
      return "Detectado pelo YouTube agora";
    case "cache":
      return "Última verificação do YouTube";
    case "manual":
      return "Definido manualmente no painel";
    case "fora-de-janela":
      return "Fora do horário de culto configurado";
    case "erro":
      return "Não conseguimos falar com o YouTube";
    default:
      return "Detecção automática desligada";
  }
}
