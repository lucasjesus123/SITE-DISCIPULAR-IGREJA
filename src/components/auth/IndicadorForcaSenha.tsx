"use client";

/**
 * Indicador de força da senha.
 *
 * ISTO É INTERFACE, NÃO CONTROLE DE SEGURANÇA.
 * A política de verdade mora em `validarForca()`, no servidor
 * (src/lib/auth/password.ts), e é a única que decide se a senha entra. O que
 * este componente faz é dizer à pessoa, ENQUANTO ela digita, se o que ela
 * escolheu vai ser aceito — evitando o vaivém de enviar, tomar erro e recomeçar.
 *
 * As regras abaixo espelham as do servidor de propósito. Se elas divergirem, o
 * pior que acontece é a barra prometer "forte" e o servidor recusar: a decisão
 * continua sendo do servidor.
 */

/** Mesma lista curta do servidor: o que aparece em vazamento e o que é óbvio
 *  neste produto ("igreja", "discipular"). */
const PROIBIDAS = [
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "senha", "password", "qwerty", "abc123", "111111", "000000",
  "igreja", "discipular", "jesus123", "deus123", "admin", "administrador",
  "mudar123", "trocar123", "teste123",
];

export interface AvaliacaoSenha {
  /** 0 a 4. Abaixo de 2 o servidor recusa. */
  nivel: number;
  rotulo: string;
  /** O que falta para passar na política. Vazio quando já passa. */
  pendencia: string | null;
}

export function avaliarSenha(senha: string): AvaliacaoSenha {
  if (!senha) return { nivel: 0, rotulo: "", pendencia: null };

  const normalizada = senha.toLowerCase();

  if (senha.length < 12) {
    return {
      nivel: senha.length >= 8 ? 1 : 0,
      rotulo: "Curta demais",
      pendencia: `Faltam ${12 - senha.length} caractere(s) para o mínimo de 12.`,
    };
  }

  if (PROIBIDAS.some((p) => normalizada === p || normalizada.startsWith(p))) {
    return {
      nivel: 1,
      rotulo: "Muito comum",
      pendencia: "Esta senha é previsível demais. Escolha outra.",
    };
  }

  const variedade = new Set(normalizada).size;
  if (variedade < 5) {
    return {
      nivel: 1,
      rotulo: "Repetitiva",
      pendencia: "Use mais variedade de caracteres.",
    };
  }

  // A partir daqui a senha passa na política. O restante é só orientação.
  const classes =
    Number(/[a-z]/.test(senha)) +
    Number(/[A-Z]/.test(senha)) +
    Number(/\d/.test(senha)) +
    Number(/[^A-Za-z0-9]/.test(senha));

  if (senha.length >= 20 || (senha.length >= 16 && classes >= 3)) {
    return { nivel: 4, rotulo: "Excelente", pendencia: null };
  }
  if (senha.length >= 14 || classes >= 3) {
    return { nivel: 3, rotulo: "Boa", pendencia: null };
  }
  return { nivel: 2, rotulo: "Aceitável", pendencia: null };
}

const CORES = ["#cf222e", "#cf222e", "#9a6700", "#1a7f37", "#1a7f37"];

export function IndicadorForcaSenha({ senha }: { senha: string }) {
  const { nivel, rotulo, pendencia } = avaliarSenha(senha);

  if (!senha) {
    return (
      <p className="campo__ajuda">
        Mínimo de 12 caracteres. Uma frase que só você lembra vale mais que
        símbolos embaralhados.
      </p>
    );
  }

  // `noUncheckedIndexedAccess` obriga o fallback: o índice vem de um cálculo,
  // não de um literal.
  const cor = CORES[nivel] ?? "#cf222e";

  return (
    <div>
      <div
        style={{ display: "flex", gap: ".3rem", marginTop: ".2rem" }}
        role="img"
        aria-label={`Força da senha: ${rotulo}`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              background: i < nivel ? cor : "var(--line-on-light, rgb(0 0 0 / .12))",
              transition: "background .2s ease",
            }}
          />
        ))}
      </div>
      <p className="campo__ajuda" style={{ marginTop: ".4rem", color: cor }}>
        {rotulo}
        {pendencia ? ` — ${pendencia}` : ""}
      </p>
    </div>
  );
}
