/**
 * Slug para o link público de uma inscrição (/i/<slug>). Puro e testável.
 * Remove acentos, baixa a caixa, troca o que não é [a-z0-9] por hífen e limita
 * o tamanho — para caber num @db.VarChar(80) e virar uma URL limpa.
 */
export function gerarSlug(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "inscricao";
}

/** Escapa um campo para CSV (aspas, vírgula, ponto-e-vírgula, quebra de linha). */
export function campoCsv(valor: string | null | undefined): string {
  const v = valor ?? "";
  if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
