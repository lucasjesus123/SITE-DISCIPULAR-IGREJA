/**
 * Onboarding guiado de uma igreja — PURO e testável.
 *
 * Depois de criar a igreja, faltam poucos passos para ela ir ao ar: apontar o
 * domínio, subir o logo, ligar as gavetas, conectar o WhatsApp e configurar o
 * PIX. Esta função transforma o ESTADO atual (o que já existe no banco) numa
 * lista de passos com feito/pendente — o Super Admin vê num relance o que falta.
 */

export interface EstadoOnboarding {
  dominioVerificado: boolean;
  temLogo: boolean;
  modulosDefinidos: boolean;
  whatsappConectado: boolean;
  pixConfigurado: boolean;
  temAdmin: boolean;
}

export interface PassoOnboarding {
  chave: string;
  titulo: string;
  feito: boolean;
  dica: string;
  /** true = não impede ir ao ar, mas é recomendado. */
  opcional?: boolean;
}

export function passosOnboarding(e: EstadoOnboarding): PassoOnboarding[] {
  return [
    { chave: "admin", titulo: "Administrador criado", feito: e.temAdmin, dica: "A conta que gerencia a igreja." },
    { chave: "modulos", titulo: "Módulos definidos", feito: e.modulosDefinidos, dica: "Ligue as gavetas que a igreja contratou." },
    { chave: "dominio", titulo: "Domínio verificado", feito: e.dominioVerificado, dica: "Aponte o domínio da igreja e verifique o DNS." },
    { chave: "logo", titulo: "Logo enviado", feito: e.temLogo, dica: "A igreja sobe o logo em Site → Identidade.", opcional: true },
    { chave: "whatsapp", titulo: "WhatsApp conectado", feito: e.whatsappConectado, dica: "Conecte o número na aba WhatsApp (QR Code).", opcional: true },
    { chave: "pix", titulo: "PIX configurado", feito: e.pixConfigurado, dica: "Cole a chave/ASAAS em Pagamentos.", opcional: true },
  ];
}

/** Progresso considerando só os passos ESSENCIAIS (não-opcionais). */
export function progressoOnboarding(passos: PassoOnboarding[]): { feitos: number; total: number; pct: number; noAr: boolean } {
  const essenciais = passos.filter((p) => !p.opcional);
  const feitos = essenciais.filter((p) => p.feito).length;
  const total = essenciais.length;
  const pct = total === 0 ? 100 : Math.round((feitos / total) * 100);
  return { feitos, total, pct, noAr: feitos === total };
}
