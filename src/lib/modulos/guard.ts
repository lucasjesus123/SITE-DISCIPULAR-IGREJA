import "server-only";

import { redirect } from "next/navigation";
import type { TenantDb } from "@/lib/db/tenant-client";
import { carregarModulos } from "@/lib/services/modulos";
import type { ModuloChave } from "./modulos";

/**
 * Barra a rota quando a igreja não tem o módulo ligado. Esconder do menu é
 * usabilidade; ESTA é a barreira de servidor — a igreja que não contratou o
 * Louvor não abre /painel/louvor nem digitando a URL.
 *
 * Não vaza dado (tudo já é escopado por tenant); apenas devolve a pessoa ao
 * início do painel, onde ela tem o que contratou.
 */
export async function exigirModulo(db: TenantDb, chave: ModuloChave, destino = "/painel"): Promise<void> {
  const modulos = await carregarModulos(db);
  if (!modulos[chave]) redirect(destino);
}
