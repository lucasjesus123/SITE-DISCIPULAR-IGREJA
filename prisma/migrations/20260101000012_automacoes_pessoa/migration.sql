-- Marcadores das automações de relacionamento na Pessoa (idempotência do envio).
ALTER TABLE "pessoas" ADD COLUMN "boasVindasEm" TIMESTAMP(3);
ALTER TABLE "pessoas" ADD COLUMN "conviteRetornoEm" TIMESTAMP(3);
