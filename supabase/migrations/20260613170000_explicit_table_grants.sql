-- Karaokê Live — grants de tabela explícitos pro role authenticated
-- O schema inicial só dava `grant execute` nas funções e confiava nos
-- privilégios default do Supabase pras tabelas. Esse default depende da
-- versão da imagem do Postgres (passava local com a CLI 2.104, quebrava no
-- CI com a `latest`: "permission denied for table rooms"). Tornamos os
-- grants explícitos — RLS continua sendo o que filtra as linhas; isto só
-- libera o acesso de nível de tabela. Idempotente onde já existem.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.queue_items to authenticated;
grant select, insert, update, delete on public.room_participants to authenticated;
