begin;
set search_path to extensions, public;
select plan(3);

select has_table('public', 'health', 'tabela health existe');
select col_is_pk('public', 'health', 'id', 'id é PK');
select is(
  (select relrowsecurity from pg_class where oid = 'public.health'::regclass),
  true,
  'RLS habilitado em health'
);

select * from finish();
rollback;
