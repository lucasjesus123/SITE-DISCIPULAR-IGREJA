/**
 * Helpers de exibição do painel/site — funções PURAS, testáveis. Antes viviam
 * inline em componentes; centralizadas aqui para terem uma única fonte de
 * verdade e cobertura de teste.
 */

/** Primeiro nome (para saudações). */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Iniciais (avatar): primeira letra do primeiro e do último nome. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]![0] : "";
  return (a + b).toUpperCase() || "?";
}

/** Rótulo amigável do tipo de submissão. */
export function rotuloTipo(tipo: string): string {
  const mapa: Record<string, string> = {
    VISITANTE: "Visitante",
    NOVO_MEMBRO: "Novo membro",
    BATISMO: "Batismo",
    PEDIDO_ORACAO: "Oração",
    CONTATO: "Contato",
    INSCRICAO_CURSO: "Inscrição",
    QUERO_CELULA: "Célula",
    ACONSELHAMENTO: "Aconselhamento",
  };
  return mapa[tipo] ?? tipo;
}

/** "agora", "5 min", "3 h", "4 d" ou data curta. `agoraMs` injetável p/ teste. */
export function tempoRelativo(data: Date, agoraMs: number = Date.now()): string {
  const segundos = Math.floor((agoraMs - data.getTime()) / 1000);
  if (segundos < 60) return "agora";
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  if (dias < 30) return `${dias} d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(data);
}

/** Formata um CNPJ (14 dígitos) como 00.000.000/0000-00. */
export function formatarCnpj(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Normaliza telefone para só dígitos (ou null se vazio). */
export function normalizarTelefone(valor: string): string | null {
  const d = valor.replace(/\D/g, "");
  return d === "" ? null : d;
}
