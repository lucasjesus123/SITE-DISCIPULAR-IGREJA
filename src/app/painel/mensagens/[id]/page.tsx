import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { id as idSchema } from "@/lib/validation/comum";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { FormularioMensagem } from "@/components/painel/FormularioMensagem";
import type { ArquivoEnviado } from "@/components/painel/CampoUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar mensagem" };

export default async function EditarMensagem({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await exigirPermissao("mensagens.gerenciar");
  const { id: idBruto } = await params;

  // Valida o FORMATO antes de consultar: um valor absurdo vira 404, e não uma
  // exceção do Prisma vazando nome de coluna na tela de erro.
  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();

  const mensagem = await ctx.db.mensagem.findFirst({
    where: { id: parse.data },
    select: {
      id: true, titulo: true, slug: true, descricao: true, preletor: true,
      serie: true, youtubeVideoId: true, duracaoSegundos: true, data: true,
      publicado: true, destaque: true, criadoEm: true, atualizadoEm: true,
      capa: { select: { id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true } },
    },
  });

  // A leitura já veio escopada ao tenant: um ID de outra igreja simplesmente
  // não existe aqui, e a resposta é a mesma de um ID inventado — 404. Responder
  // de forma diferente transformaria a rota num detector de IDs válidos.
  if (!mensagem) notFound();

  const capaInicial: ArquivoEnviado | null = mensagem.capa
    ? {
        id: mensagem.capa.id,
        url: urlArquivoPublico(mensagem.capa.id),
        nome: mensagem.capa.nomeOriginal,
        mimeType: mensagem.capa.mimeType,
        tamanhoBytes: mensagem.capa.tamanhoBytes,
      }
    : null;

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/mensagens" className="link" style={{ fontSize: ".72rem" }}>
              ← Mensagens
            </Link>
          </p>
          <h1 className="painel__titulo">{mensagem.titulo}</h1>
          <p className="painel__sub">
            {mensagem.publicado ? "Publicada" : "Rascunho"} · endereço público /{mensagem.slug} ·
            atualizada em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(mensagem.atualizadoEm)}
          </p>
        </div>
      </div>

      <FormularioMensagem
        modo="editar"
        mensagemId={mensagem.id}
        capaInicial={capaInicial}
        inicial={{
          titulo: mensagem.titulo,
          slug: mensagem.slug,
          descricao: mensagem.descricao ?? "",
          preletor: mensagem.preletor ?? "",
          serie: mensagem.serie ?? "",
          video: mensagem.youtubeVideoId ?? "",
          duracaoMinutos:
            mensagem.duracaoSegundos === null
              ? ""
              : String(Math.round(mensagem.duracaoSegundos / 60)),
          // A coluna é `@db.Date`, gravada à meia-noite UTC. Formatar em UTC
          // evita o clássico "a data volta um dia" em fusos negativos.
          data: mensagem.data ? mensagem.data.toISOString().slice(0, 10) : "",
          publicado: mensagem.publicado,
          destaque: mensagem.destaque,
        }}
      />
    </>
  );
}
