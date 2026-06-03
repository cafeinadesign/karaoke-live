-- Karaokê Live — dono troca a música escolhida sem perder a vez
-- RPC replace_queue_item_video: só o dono do item (e só se ainda 'pending')
-- substitui video_id/title/thumbnail/duration. Mantém id, position, user_id.
-- gemini_message é limpa pra que o próximo roast pegue a música nova.

create or replace function public.replace_queue_item_video(
  p_item_id uuid,
  p_video_id text,
  p_video_title text,
  p_video_thumbnail text,
  p_video_duration_seconds int
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.queue_items;
begin
  update public.queue_items
    set
      video_id = p_video_id,
      video_title = p_video_title,
      video_thumbnail = p_video_thumbnail,
      video_duration_seconds = p_video_duration_seconds,
      gemini_message = null
    where id = p_item_id
      and user_id = auth.uid()
      and status = 'pending'
    returning * into v_item;

  if v_item.id is null then
    raise exception 'not_owner_or_not_pending';
  end if;

  return v_item;
end;
$$;

grant execute on function public.replace_queue_item_video(uuid, text, text, text, int) to authenticated;
