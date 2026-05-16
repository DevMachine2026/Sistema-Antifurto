-- Backfill: registra em `cameras` todas as câmeras já aprovadas em
-- `agent_camera_candidates` que ainda não foram auto-registradas.
-- Execute uma vez no SQL Editor do Supabase Dashboard.

INSERT INTO public.cameras (establishment_id, name, camera_id, ip, port, brand, camera_type, status)
SELECT
  ac.establishment_id,
  CASE
    WHEN c.device_type = 'dvr' THEN
      'DVR ' ||
      COALESCE(
        CASE LOWER(c.manufacturer)
          WHEN 'intelbras' THEN 'Intelbras'
          WHEN 'hikvision' THEN 'Hikvision'
          WHEN 'dahua'     THEN 'Dahua'
        END,
        'Genérico'
      ) ||
      COALESCE(' — ' || c.channel_count::text || ' canais', '')
    WHEN LOWER(c.manufacturer) LIKE '%intelbras%' THEN 'Câmera Intelbras'
    WHEN LOWER(c.manufacturer) LIKE '%hikvision%' THEN 'Câmera Hikvision'
    WHEN LOWER(c.manufacturer) LIKE '%dahua%'     THEN 'Câmera Dahua'
    ELSE 'Câmera ' || c.ip
  END AS name,
  'auto-' || REPLACE(c.ip, '.', '-') AS camera_id,
  c.ip,
  COALESCE(c.port, 80) AS port,
  CASE
    WHEN LOWER(c.manufacturer) LIKE '%intelbras%' THEN 'intelbras'
    WHEN LOWER(c.manufacturer) LIKE '%hikvision%' THEN 'hikvision'
    WHEN LOWER(c.manufacturer) LIKE '%dahua%'     THEN 'dahua'
    ELSE 'generic'
  END AS brand,
  'people_counting' AS camera_type,
  'online' AS status
FROM public.agent_camera_candidates c
JOIN public.agent_configs ac ON ac.id = c.agent_id
ON CONFLICT (establishment_id, camera_id) DO NOTHING;
