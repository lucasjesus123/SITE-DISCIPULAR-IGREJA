import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Moldura de foto do site. Se a igreja enviou uma foto (fotoId), mostra a foto
 * cobrindo a moldura; senão, cai no placeholder com monograma e legenda — o
 * mesmo visual da referência enquanto a foto real não foi enviada.
 */
export function MolduraFoto({
  fotoId,
  legenda,
  placeholder,
  className = "frame frame--tall",
}: {
  fotoId?: string | null;
  legenda?: string;
  placeholder?: string;
  className?: string;
}) {
  if (fotoId) {
    return (
      <div className={className} style={{ overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlArquivoPublico(fotoId)}
          alt={legenda ?? ""}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {legenda && <span className="frame__cap">{legenda}</span>}
      </div>
    );
  }
  return (
    <div className={`${className} frame__mono`}>
      <div className="frame__grid" aria-hidden="true" />
      {legenda && <span className="frame__cap">{legenda}</span>}
      {placeholder && <span className="frame__badge">{placeholder}</span>}
    </div>
  );
}
