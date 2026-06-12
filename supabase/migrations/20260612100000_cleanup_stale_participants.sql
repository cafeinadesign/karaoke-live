-- Karaokê Live — limpeza periódica de participantes zumbis
-- O heartbeat atualiza last_seen_at a cada 30s e a leitura já filtra
-- linhas com mais de 90s, mas as linhas mortas ficavam no DB pra sempre
-- (aba fechada sem leave(), crash, rede). pg_cron varre a cada 5 minutos.

create extension if not exists pg_cron;

-- cron.schedule é upsert por jobname — re-rodar a migration não duplica.
select cron.schedule(
  'cleanup-stale-room-participants',
  '*/5 * * * *',
  $$
    delete from public.room_participants
    where last_seen_at < now() - interval '5 minutes'
  $$
);
