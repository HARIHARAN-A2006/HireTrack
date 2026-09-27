-- Ensure application messages can only be sent to the other participant
-- selected for that application by the trusted contact lookup.

drop policy if exists "Participants send application messages" on public.application_messages;
create policy "Participants send application messages" on public.application_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_application(application_id)
    and recipient_id = public.get_application_contact(application_id)
    and sender_id <> recipient_id
  );

revoke all on function public.get_application_contact(uuid) from public;
grant execute on function public.get_application_contact(uuid) to authenticated;
