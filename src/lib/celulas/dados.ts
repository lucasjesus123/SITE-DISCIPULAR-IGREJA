/**
 * Células (Casas de Discípulos) — dados para o mapa e a listagem.
 *
 * Coordenadas: APROXIMADAS por cidade/bairro (geocodificação de rua exige um
 * serviço externo que não temos aqui). Cada célula tem `mapsQuery` com o
 * endereço completo, usado no botão "Ver rota" — a navegação é sempre exata,
 * mesmo que o pino esteja no ponto aproximado. Para pinos exatos no futuro,
 * basta ajustar lat/lng aqui (ou geocodificar as queries uma vez).
 *
 * Fonte: lista oficial das células enviada pela igreja.
 */

export interface Celula {
  cidade: string;
  lideres: string;
  /** Tipo especial da célula (ex.: "Célula de Mulheres"), quando houver. */
  tipo?: string;
  dia: string;
  horario: string;
  /** Rua + número. */
  endereco: string;
  bairro?: string;
  lat: number;
  lng: number;
}

export const CELULAS: Celula[] = [
  // ---- Arroio do Meio -------------------------------------------------------
  { cidade: "Arroio do Meio", lideres: "Beto e Júlia", dia: "Terça-feira", horario: "20h", endereco: "Rua dos Cravos, 350", bairro: "Bela Vista", lat: -29.3985, lng: -51.949 },
  { cidade: "Arroio do Meio", lideres: "Zandor e Niandra", dia: "Quarta-feira", horario: "19h30", endereco: "Rua Hibisco, 310", bairro: "Novo Horizonte", lat: -29.406, lng: -51.94 },
  { cidade: "Arroio do Meio", lideres: "Éder e Felipe", dia: "Quarta-feira", horario: "19h30", endereco: "Avenida Presidente Vargas, 1236", bairro: "Aimoré", lat: -29.4005, lng: -51.95 },

  // ---- Lajeado --------------------------------------------------------------
  { cidade: "Lajeado", lideres: "Catiele e Kathleen", tipo: "Célula de Mulheres", dia: "Terça-feira", horario: "20h", endereco: "Rua Arthur Bernardes, 506", bairro: "São Cristóvão", lat: -29.459, lng: -51.97 },
  { cidade: "Lajeado", lideres: "Rodrigo", tipo: "Célula de Homens", dia: "Terça-feira", horario: "20h", endereco: "Av. Senador Alberto Pasqualini, 2962", bairro: "Universitário", lat: -29.472, lng: -51.955 },
  { cidade: "Lajeado", lideres: "Marcelo e Fabiano", dia: "Quarta-feira", horario: "19h30", endereco: "Rua das Begônias, 179", bairro: "São Bento", lat: -29.464, lng: -51.966 },
  { cidade: "Lajeado", lideres: "Lauro e Camila", dia: "Terça-feira", horario: "20h", endereco: "Avenida Senador Alberto Pasqualini, 1175", bairro: "São Cristóvão · TriHotel Lajeado", lat: -29.466, lng: -51.962 },
  { cidade: "Lajeado", lideres: "Gerson e Maribel", dia: "Quarta-feira", horario: "20h", endereco: "Rua Arthur Fucks, Esquina", bairro: "Bom Pastor", lat: -29.471, lng: -51.968 },

  // ---- Estrela --------------------------------------------------------------
  { cidade: "Estrela", lideres: "Maria Tereza e Andréia", dia: "Quarta-feira", horario: "20h", endereco: "Rua Bruno João Erichsen, 101", bairro: "Estados", lat: -29.498, lng: -51.96 },

  // ---- Cruzeiro do Sul ------------------------------------------------------
  { cidade: "Cruzeiro do Sul", lideres: "Allan e Arthur", tipo: "Célula Jovem Masculina", dia: "Quarta-feira", horario: "19h30", endereco: "Rua Eugênio Floriano Sehn, 503", bairro: "Glucostarck", lat: -29.512, lng: -51.999 },
  { cidade: "Cruzeiro do Sul", lideres: "Sofia e Ana", tipo: "Célula Jovem Feminina", dia: "Terça-feira", horario: "19h30", endereco: "Rua A, 70", bairro: "Cascata", lat: -29.518, lng: -51.99 },
  { cidade: "Cruzeiro do Sul", lideres: "Acenéia e Denise", tipo: "Célula de Mulheres", dia: "Terça-feira", horario: "19h30", endereco: "Rua Dom Pedro II, 535", bairro: "Centro", lat: -29.5147, lng: -51.995 },
  { cidade: "Cruzeiro do Sul", lideres: "Ismael e Eduarda", dia: "Terça-feira", horario: "20h", endereco: "Rua Maximiano José Francisco, 460", bairro: "Glucostark", lat: -29.51, lng: -51.993 },

  // ---- Vera Cruz ------------------------------------------------------------
  { cidade: "Vera Cruz", lideres: "Everton e Viviane", dia: "Terça-feira", horario: "19h30", endereco: "Rua Valentim Rech, 205", lat: -29.715, lng: -52.51 },
  { cidade: "Vera Cruz", lideres: "Márcio e Marli", dia: "Terça-feira", horario: "19h30", endereco: "Rua Cipriano de Oliveira, 555", lat: -29.72, lng: -52.52 },
  { cidade: "Vera Cruz", lideres: "Ismael e Natália", dia: "Quarta-feira", horario: "19h30", endereco: "Rua Alvino Finkler, 191", lat: -29.722, lng: -52.512 },
  { cidade: "Vera Cruz", lideres: "Daniel e Lídia", dia: "Terça-feira", horario: "20h", endereco: "Rua Albino Trindade, 95", lat: -29.716, lng: -52.518 },

  // ---- Teutônia -------------------------------------------------------------
  { cidade: "Teutônia", lideres: "Pr. Lucas Jesus e Pra. Maíra", dia: "Terça-feira", horario: "19h30", endereco: "Rua 24 de Maio, 1676", bairro: "Canabarro", lat: -29.45, lng: -51.8 },
];

/** Cidades únicas, na ordem em que aparecem. */
export const CIDADES: string[] = [...new Set(CELULAS.map((c) => c.cidade))];

/** Endereço completo para o link de rota (Google Maps). */
export function enderecoCompleto(c: Celula): string {
  return [c.endereco, c.bairro?.split(" · ")[0], c.cidade, "RS", "Brasil"]
    .filter(Boolean)
    .join(", ");
}

/** Link de rota no Google Maps (abre o app/site com o endereço exato). */
export function linkRota(c: Celula): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(c))}`;
}
