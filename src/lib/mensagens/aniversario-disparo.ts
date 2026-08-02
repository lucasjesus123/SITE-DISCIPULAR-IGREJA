import { renderizarTemplate } from "./template";
import type { ItemAniv } from "@/lib/painel/aniversariantes";

/**
 * Composição dos disparos de aniversário — PURO e testável.
 *
 * Recebe os aniversariantes DE HOJE (já calculados por calcularAniversariantes),
 * os corpos dos templates e o nome da igreja, e devolve as mensagens prontas
 * para enviar — só para quem tem telefone válido. Quem envia (e se envia) é a
 * rota do CRON; aqui não há I/O, então dá para testar a regra inteira.
 */

export interface MensagemDisparo {
  pessoaId: string;
  nome: string;
  telefoneWhatsApp: string; // só dígitos, com DDI
  texto: string;
  tipo: "vida" | "batismo";
}

/**
 * Normaliza um telefone brasileiro para o formato do WhatsApp (DDI+DDD+número,
 * só dígitos). Aceita com/sem 55 e com/sem máscara. Devolve null quando não dá
 * para formar um número plausível — melhor não enviar do que enviar errado.
 */
export function telefoneWhatsApp(bruto: string | null): string | null {
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, "");
  // 10 (fixo DDD+8) ou 11 (celular DDD+9) → prefixa 55.
  if (d.length === 10 || d.length === 11) return `55${d}`;
  // já com DDI 55 (12 ou 13 dígitos).
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/** Primeiro nome, para a mensagem soar pessoal. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

export function comporDisparosAniversario(
  itensDeHoje: ItemAniv[],
  templates: { vida: string; batismo: string },
  igreja: string,
): MensagemDisparo[] {
  const saida: MensagemDisparo[] = [];
  for (const item of itensDeHoje) {
    const telefone = telefoneWhatsApp(item.telefone);
    if (!telefone) continue;
    const corpo = item.tipo === "vida" ? templates.vida : templates.batismo;
    if (!corpo) continue;
    saida.push({
      pessoaId: item.id,
      nome: item.nome,
      telefoneWhatsApp: telefone,
      tipo: item.tipo,
      texto: renderizarTemplate(corpo, { nome: primeiroNome(item.nome), igreja }),
    });
  }
  return saida;
}
