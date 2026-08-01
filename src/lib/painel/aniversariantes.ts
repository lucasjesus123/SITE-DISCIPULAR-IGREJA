/**
 * Aniversariantes — classificação PURA por mês/dia (ignorando o ano) em três
 * baldes sem repetição: hoje, próximos 7 dias e o resto do mês corrente.
 *
 * `hojeIso` ("YYYY-MM-DD") é injetado para o teste ser determinístico. As datas
 * `@db.Date` chegam como meia-noite UTC, então lemos mês/dia em UTC.
 */

export type PessoaAniv = {
  id: string;
  nome: string;
  telefone: string | null;
  dataNascimento: Date | null;
  dataBatismo: Date | null;
};

export type ItemAniv = {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: "vida" | "batismo";
  dia: number;
  mes: number;
};

export function calcularAniversariantes(
  pessoas: PessoaAniv[],
  hojeIso: string,
): { hoje: ItemAniv[]; semana: ItemAniv[]; mes: ItemAniv[] } {
  const [anoH, mesH, diaH] = hojeIso.split("-").map(Number) as [number, number, number];

  const proximos: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(anoH, mesH - 1, diaH + i, 12));
    proximos.push(`${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
  }
  const chaveHoje = `${mesH}-${diaH}`;

  const entradas: ItemAniv[] = [];
  for (const p of pessoas) {
    if (p.dataNascimento) {
      entradas.push({ id: `${p.id}-v`, nome: p.nome, telefone: p.telefone, tipo: "vida", mes: p.dataNascimento.getUTCMonth() + 1, dia: p.dataNascimento.getUTCDate() });
    }
    if (p.dataBatismo) {
      entradas.push({ id: `${p.id}-b`, nome: p.nome, telefone: p.telefone, tipo: "batismo", mes: p.dataBatismo.getUTCMonth() + 1, dia: p.dataBatismo.getUTCDate() });
    }
  }

  const hoje: ItemAniv[] = [];
  const semana: ItemAniv[] = [];
  const mes: ItemAniv[] = [];
  for (const e of entradas) {
    const chave = `${e.mes}-${e.dia}`;
    if (chave === chaveHoje) hoje.push(e);
    else if (proximos.includes(chave)) semana.push(e);
    else if (e.mes === mesH) mes.push(e);
  }

  const porDia = (a: ItemAniv, b: ItemAniv) => a.dia - b.dia || a.nome.localeCompare(b.nome);
  return { hoje: hoje.sort(porDia), semana: semana.sort(porDia), mes: mes.sort(porDia) };
}
