-- pgTAP: eventos futuros — pré-fila, start_room, bloqueio de advance_queue e constraints.

begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'event-host@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'event-guest@test.local');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

-- Constraints de agendamento e timezone
select throws_ok(
  $$insert into public.rooms (code, host_id, name, scheduled_end_at)
    values ('BAD001', auth.uid(), 'Sem início', '2026-12-10T23:00:00Z')$$,
  '23514', null, 'rejeita scheduled_end_at sem scheduled_at'
);

select throws_ok(
  $$insert into public.rooms (code, host_id, name, scheduled_at, scheduled_end_at)
    values ('BAD002', auth.uid(), 'Fim inválido', '2026-12-10T23:00:00Z', '2026-12-10T22:00:00Z')$$,
  '23514', null, 'rejeita scheduled_end_at anterior a scheduled_at'
);

select throws_ok(
  $$insert into public.rooms (code, host_id, name, event_timezone)
    values ('BAD003', auth.uid(), 'Timezone vazio', '   ')$$,
  '23514', null, 'rejeita event_timezone em branco'
);

-- Host cria evento futuro (started_at = null)
select lives_ok(
  $$insert into public.rooms (
      id, code, host_id, name, scheduled_at, scheduled_end_at, event_timezone, started_at, is_public, venue_name
    ) values (
      '00000000-0000-0000-0000-000000000f99',
      'FUT123',
      auth.uid(),
      'Karaokê Futuro',
      '2026-12-20T23:00:00Z',
      '2026-12-21T02:00:00Z',
      'America/Sao_Paulo',
      null,
      true,
      'Bar Futuro'
    )$$,
  'cria evento futuro agendado'
);

-- Convidado pode pré-enfileirar antes do início, mas não pode iniciar o evento
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

select lives_ok(
  $$select public.enqueue_item(
      '00000000-0000-0000-0000-000000000f99',
      'vid-pre1', 'Pré-fila', null, 180)$$,
  'convidado pré-enfileira música antes do evento começar'
);

select throws_ok(
  $$select public.start_room('00000000-0000-0000-0000-000000000f99')$$,
  '42501', 'cannot_start_room', 'convidado não inicia evento de outro host'
);

-- Host não pode avançar fila antes de iniciar o evento
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

select throws_ok(
  $$select public.advance_queue('00000000-0000-0000-0000-000000000f99')$$,
  'room_not_started', 'advance_queue bloqueia fila antes de start_room'
);

-- Host inicia o evento e então avança a fila
select ok(
  (public.start_room('00000000-0000-0000-0000-000000000f99')).started_at is not null,
  'host inicia o evento e preenche started_at'
);

select lives_ok(
  $$select public.advance_queue('00000000-0000-0000-0000-000000000f99')$$,
  'advance_queue funciona após o host iniciar o evento'
);

select is(
  (select status from public.queue_items where video_id = 'vid-pre1'),
  'now_playing',
  'música da pré-fila vira now_playing ao iniciar e avançar'
);

select * from finish();
rollback;
