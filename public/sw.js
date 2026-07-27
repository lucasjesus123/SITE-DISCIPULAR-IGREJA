/**
 * Service worker do PWA.
 *
 * FILOSOFIA: cache mínimo e conservador.
 *
 * A tentação num PWA é cachear tudo para ficar rápido offline. Aqui isso seria
 * um problema de segurança e de privacidade:
 *
 *   - O app é MULTI-TENANT. Uma resposta cacheada no domínio de uma igreja
 *     jamais pode aparecer em outra. Como o cache do service worker é por
 *     ORIGEM (e cada igreja tem o seu domínio), isso já está isolado — mas só
 *     enquanto não cachearmos nada de forma transversal.
 *
 *   - O app mostra DADO PESSOAL: ficha, pedidos de oração, contatos. Guardar
 *     isso no disco do celular significa que ele sobrevive ao logout e fica
 *     legível para quem pegar o aparelho.
 *
 * Por isso a regra é: cacheamos apenas o "casco" (assets estáticos e a página
 * offline). NENHUMA resposta de /api/ ou de rota autenticada entra no cache.
 */

const VERSAO = "v1";
const CACHE_CASCO = `discipular-casco-${VERSAO}`;

/** Só recursos públicos e sem dado pessoal. */
const ARQUIVOS_CASCO = ["/app/offline", "/icone-192.png", "/icone-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_CASCO)
      // `addAll` falha inteiro se UM arquivo faltar; o catch impede que a
      // instalação do service worker quebre por causa de um ícone ausente.
      .then((cache) => cache.addAll(ARQUIVOS_CASCO).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave.startsWith("discipular-") && chave !== CACHE_CASCO)
            .map((chave) => caches.delete(chave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  // Só GET. POST/PUT/DELETE mudam estado e nunca devem ser servidos de cache.
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);

  // Nada de outra origem passa por aqui.
  if (url.origin !== self.location.origin) return;

  // ---------------------------------------------------------------------------
  // NUNCA CACHEAR — a lista mais importante deste arquivo
  // ---------------------------------------------------------------------------
  const nuncaCachear = [
    "/api/",        // respostas de API contêm dado pessoal
    "/painel",      // painel administrativo
    "/plataforma",  // super admin
    "/login",
    "/sair",
    "/manifest.webmanifest", // varia por tenant
  ];
  if (nuncaCachear.some((prefixo) => url.pathname.startsWith(prefixo))) {
    return; // deixa passar direto para a rede, sem tocar no cache
  }

  // ---------------------------------------------------------------------------
  // Assets estáticos com hash no nome: cache-first é seguro porque a URL muda
  // a cada build.
  // ---------------------------------------------------------------------------
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      caches.match(requisicao).then(
        (cacheado) =>
          cacheado ??
          fetch(requisicao).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              caches.open(CACHE_CASCO).then((cache) => cache.put(requisicao, copia));
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Navegação: rede primeiro. Se a rede falhar, mostramos a página offline —
  // e NÃO uma versão em cache da página, que poderia estar desatualizada ou
  // pertencer a uma sessão já encerrada.
  // ---------------------------------------------------------------------------
  if (requisicao.mode === "navigate") {
    evento.respondWith(
      fetch(requisicao).catch(() =>
        caches.match("/app/offline").then(
          (offline) =>
            offline ??
            new Response(
              "<!doctype html><meta charset=utf-8><title>Sem conexão</title><p>Você está sem conexão.</p>",
              { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 },
            ),
        ),
      ),
    );
  }

  // Todo o resto (imagens, fontes) segue direto para a rede.
});

/**
 * Limpa o cache no logout.
 *
 * A página envia esta mensagem quando o usuário sai. Sem isso, os assets
 * ficariam no aparelho — não é dado pessoal, mas é higiene, e cobre o caso de
 * um aparelho compartilhado na igreja.
 */
self.addEventListener("message", (evento) => {
  if (evento.data === "limpar-cache") {
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c.startsWith("discipular-")).map((c) => caches.delete(c))),
    );
  }
});
