/**
 * Renderização de templates de mensagem. PURO e testável.
 *
 * O corpo do template usa variáveis entre chaves: "Olá {nome}, a {igreja}...".
 * `renderizar` troca cada {chave} pelo valor informado. Variáveis não
 * fornecidas viram string vazia (nunca deixam "{chave}" cru na mensagem).
 */

export function renderizarTemplate(corpo: string, variaveis: Record<string, string>): string {
  return corpo.replace(/\{(\w+)\}/g, (_, chave: string) => variaveis[chave] ?? "");
}

/** Lista as variáveis usadas num corpo (para mostrar dicas ao editor). */
export function variaveisDoTemplate(corpo: string): string[] {
  const achadas = new Set<string>();
  for (const m of corpo.matchAll(/\{(\w+)\}/g)) achadas.add(m[1]!);
  return [...achadas];
}

/** Templates padrão de cada igreja (criados no seed / primeiro acesso). */
export const TEMPLATES_PADRAO: { chave: string; titulo: string; corpo: string }[] = [
  {
    chave: "boas_vindas_visitante",
    titulo: "Boas-vindas ao visitante (15 min após o cadastro)",
    corpo:
      "Olá {nome}! 😊 Foi uma alegria imensa receber você na {igreja} hoje. " +
      "Ficamos muito felizes por ter você conosco e esperamos revê-lo(a) em breve. " +
      "Deus abençoe você e sua família!\n\n— Pr. Tiago Facchi",
  },
  {
    chave: "aniversario_vida",
    titulo: "Feliz aniversário (vida)",
    corpo:
      "Feliz aniversário, {nome}! 🎉 Que Deus te encha de vida, saúde e alegria neste novo ano. " +
      "A {igreja} celebra com você! 🎂",
  },
  {
    chave: "aniversario_batismo",
    titulo: "Aniversário de batismo",
    corpo:
      "{nome}, hoje celebramos o seu aniversário de batismo! 💧 Que alegria lembrar do dia em que você " +
      "declarou sua fé. A {igreja} agradece a Deus pela sua vida!",
  },
  {
    chave: "convite_retorno",
    titulo: "Convite de retorno (próximos cultos)",
    corpo:
      "Olá {nome}! Neste domingo teremos culto na {igreja} e queremos fazer um convite especial para você. " +
      "Venha fazer parte — será uma alegria receber você de novo! 🙏",
  },
];
