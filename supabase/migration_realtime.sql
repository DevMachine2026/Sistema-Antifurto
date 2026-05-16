-- Habilita Realtime na tabela cameras para que câmeras auto-registradas
-- pelo agente apareçam no frontend sem recarregar a página.
--
-- Execute uma vez no SQL Editor do Supabase Dashboard.

ALTER TABLE public.cameras REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cameras;
