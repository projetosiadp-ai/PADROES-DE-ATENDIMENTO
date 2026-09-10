-- CHECK constraints execute with the inserting role's function privileges.
-- The private schema remains without USAGE for clients, so this pure helper is
-- available to the constraint without becoming a directly callable API.
grant execute on function private.request_tags_are_valid(text[]) to authenticated;
