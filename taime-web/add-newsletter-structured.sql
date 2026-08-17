-- TAIME newsletter_sends: coluna `structured` (snapshot editorial da semanal)
-- Rodar no Supabase SQL Editor. Opcional para o envio funcionar (o codigo e
-- resiliente: se a coluna nao existir, o e-mail sai igual e o snapshot grava sem
-- o campo). Aplicar quando quiser guardar o JSON estruturado do que foi enviado.
--
-- Guarda a estrutura editorial da newsletter SEMANAL (lead + temas com
-- signal_count real por tema + janela da semana) para o snapshot em
-- newsletter_sends refletir exatamente o que foi enviado. A diaria nao usa (fica
-- null). Sem FK, sem constraint: e apenas um snapshot.

ALTER TABLE public.newsletter_sends
  ADD COLUMN IF NOT EXISTS structured jsonb;

COMMENT ON COLUMN public.newsletter_sends.structured IS
  'Snapshot editorial da newsletter semanal (pt/en: titulo, lead, temas com signal_count real, janela da semana). Null na diaria.';
