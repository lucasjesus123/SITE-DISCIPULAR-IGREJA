/**
 * Elegibilidade das automações de relacionamento — PURO e testável.
 *
 * Duas automações moram aqui, ambas rodadas por CRON:
 *
 *  BOAS-VINDAS (≈15 min após o cadastro): quem acabou de visitar recebe uma
 *  mensagem calorosa. Janela com teto (não reprocessa backlog antigo na
 *  primeira execução) e piso de 15 min (dá tempo da pessoa sair do culto).
 *
 *  CONVITE DE RETORNO: visitante que se cadastrou há um tempo e ainda não
 *  voltou/virou membro recebe um convite. (Interpretação de "após alguns
 *  cultos": como não rastreamos presença por culto, usamos dias desde o
 *  cadastro — configurável.)
 *
 * Marcamos cada envio com um timestamp na Pessoa (boasVindasEm /
 * conviteRetornoEm) para nunca mandar duas vezes. Aqui só decidimos QUEM entra.
 */

export interface PessoaAutomacao {
  id: string;
  nome: string;
  telefone: string | null;
  status: string; // StatusPessoa
  criadoEmMs: number;
  boasVindasEmMs: number | null;
  conviteRetornoEmMs: number | null;
}

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

/** Status que contam como "visitante recente" (ainda não integrado). */
const STATUS_VISITANTE = new Set(["VISITANTE", "EM_ACOMPANHAMENTO"]);

/**
 * Quem deve receber boas-vindas agora: visitante cadastrado entre 15 min e 24 h
 * atrás, ainda sem boas-vindas enviadas e com telefone.
 */
export function elegiveisBoasVindas(
  pessoas: PessoaAutomacao[],
  agoraMs: number,
  atrasoMinutos = 15,
): PessoaAutomacao[] {
  const piso = agoraMs - atrasoMinutos * MIN; // cadastrado ATÉ aqui (>=15min)
  const teto = agoraMs - DIA; // e NÃO antes de 24h (evita backlog)
  return pessoas.filter(
    (p) =>
      p.boasVindasEmMs == null &&
      STATUS_VISITANTE.has(p.status) &&
      p.telefone != null &&
      p.criadoEmMs <= piso &&
      p.criadoEmMs >= teto,
  );
}

/**
 * Quem deve receber convite de retorno: visitante cadastrado há pelo menos
 * `diasMin` dias, ainda visitante, sem convite enviado e com telefone. O teto
 * (`diasMax`) evita disparar para cadastros muito antigos numa primeira rodada.
 */
export function elegiveisConviteRetorno(
  pessoas: PessoaAutomacao[],
  agoraMs: number,
  diasMin = 14,
  diasMax = 60,
): PessoaAutomacao[] {
  const teMax = agoraMs - diasMin * DIA; // cadastrado ATÉ aqui (>=14 dias)
  const teMin = agoraMs - diasMax * DIA; // e NÃO antes de 60 dias
  return pessoas.filter(
    (p) =>
      p.conviteRetornoEmMs == null &&
      STATUS_VISITANTE.has(p.status) &&
      p.telefone != null &&
      p.criadoEmMs <= teMax &&
      p.criadoEmMs >= teMin,
  );
}
