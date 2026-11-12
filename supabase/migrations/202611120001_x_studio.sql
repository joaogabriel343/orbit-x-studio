-- Orbit: execute no SQL Editor do projeto Supabase existente.
begin;
create table public.x_studio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.x_accounts (
  id smallint primary key check (id between 1 and 10),
  name text not null, username text not null default '', avatar_url text,
  color text not null default '#c8ed89', active boolean not null default true,
  verified_at timestamptz, followers integer, last_error text,
  updated_at timestamptz not null default now()
);
create unique index x_accounts_username_unique on public.x_accounts(lower(username)) where username <> '';
insert into public.x_accounts(id,name,color)
select i,'Conta '||i,(array['#c8ed89','#c8b8fb','#9fcef0','#efc396','#eea6b0','#83d4bd','#d9cf92','#b6c1f4','#e1b1df','#b6d5a4'])[i]
from generate_series(1,10) i;
create table public.x_campaigns (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  title text not null check (length(title)<=100), body text not null,
  scheduled_at timestamptz not null, timezone text not null default 'America/Sao_Paulo',
  state text not null check(state in ('draft','scheduled','canceled')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.x_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.x_campaigns(id) on delete cascade,
  account_id smallint not null references public.x_accounts(id), body text not null,
  status text not null default 'pending' check(status in ('pending','processing','published','failed','uncertain','canceled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null,
  locked_at timestamptz, lock_token uuid, tweet_id text, error text, published_at timestamptz,
  unique(campaign_id,account_id)
);
create index x_deliveries_due on public.x_deliveries(next_attempt_at) where status='pending';
create index x_deliveries_campaign on public.x_deliveries(campaign_id);
create index x_campaigns_schedule on public.x_campaigns(scheduled_at desc);
create table public.x_worker_state (
  id boolean primary key default true check(id), last_run_at timestamptz,
  last_error text, last_processed integer not null default 0
);
insert into public.x_worker_state(id) values(true);
alter table public.x_studio_admins enable row level security;
alter table public.x_accounts enable row level security;
alter table public.x_campaigns enable row level security;
alter table public.x_deliveries enable row level security;
alter table public.x_worker_state enable row level security;
revoke all on public.x_studio_admins,public.x_accounts,public.x_campaigns,public.x_deliveries,public.x_worker_state from anon,authenticated;
grant all on public.x_studio_admins,public.x_accounts,public.x_campaigns,public.x_deliveries,public.x_worker_state to service_role;

create function public.x_create_campaign(p_request_id uuid,p_title text,p_body text,p_scheduled_at timestamptz,p_timezone text,p_draft boolean,p_created_by uuid,p_deliveries jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if jsonb_array_length(p_deliveries) not between 1 and 10 then raise exception 'Selecione de 1 a 10 contas'; end if;
  insert into public.x_campaigns(request_id,title,body,scheduled_at,timezone,state,created_by)
  values(p_request_id,p_title,p_body,p_scheduled_at,p_timezone,case when p_draft then 'draft' else 'scheduled' end,p_created_by)
  on conflict(request_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.x_campaigns where request_id=p_request_id; return v_id; end if;
  perform 1 from public.x_accounts a where a.id in(select (d->>'account_id')::smallint from jsonb_array_elements(p_deliveries) d) order by a.id for update;
  if exists(select 1 from jsonb_array_elements(p_deliveries) d left join public.x_accounts a on a.id=(d->>'account_id')::smallint where a.id is null or not a.active or(not p_draft and a.verified_at is null)) then raise exception 'Uma conta está pausada ou não foi conectada'; end if;
  insert into public.x_deliveries(campaign_id,account_id,body,status,next_attempt_at)
  select v_id,(d->>'account_id')::smallint,d->>'body','pending',p_scheduled_at from jsonb_array_elements(p_deliveries) d;
  return v_id;
end $$;

-- SKIP LOCKED: somente um worker recebe cada entrega. Claim de uma por vez.
create function public.x_claim_delivery()
returns setof public.x_deliveries language plpgsql security invoker set search_path='' as $$
begin
  update public.x_deliveries set status='uncertain',error='Worker interrompido. Confira o perfil no X antes de reenviar.',lock_token=null
  where status='processing' and locked_at<now()-interval '5 minutes';
  return query with due as (
    select d.id from public.x_deliveries d
    join public.x_campaigns c on c.id=d.campaign_id
    join public.x_accounts a on a.id=d.account_id
    where d.status='pending' and d.next_attempt_at<=now() and c.state='scheduled' and a.active and a.verified_at is not null
    order by d.next_attempt_at,d.id for update of d skip locked limit 1
  ) update public.x_deliveries d set status='processing',attempts=attempts+1,locked_at=now(),lock_token=gen_random_uuid(),error=null
  from due where d.id=due.id returning d.*;
end $$;

create function public.x_cancel_campaign(p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.x_campaigns where id=p_id for update;
  if not found then return false; end if;
  update public.x_campaigns set state='canceled' where id=p_id;
  update public.x_deliveries set status='canceled' where campaign_id=p_id and status='pending';
  return true;
end $$;
create function public.x_delete_draft(p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  delete from public.x_campaigns where id=p_id and state='draft'; return found;
end $$;
revoke execute on function public.x_create_campaign(uuid,text,text,timestamptz,text,boolean,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.x_claim_delivery() from public,anon,authenticated;
revoke execute on function public.x_cancel_campaign(uuid) from public,anon,authenticated;
revoke execute on function public.x_delete_draft(uuid) from public,anon,authenticated;
grant execute on function public.x_create_campaign(uuid,text,text,timestamptz,text,boolean,uuid,jsonb) to service_role;
grant execute on function public.x_claim_delivery() to service_role;
grant execute on function public.x_cancel_campaign(uuid) to service_role;
grant execute on function public.x_delete_draft(uuid) to service_role;
commit;
-- Liberar um operador existente no Auth do sistema principal:
-- insert into public.x_studio_admins(user_id) values('UUID-DO-USUARIO');
