/**
 * Utility to enforce the Dev Ops & IT ticket visibility and persistence rules.
 * "Dev Ops & IT tickets should only be saved or shown or added if they were assigned to me else hide it by default"
 */

export function isDevOpsAndITTicket(ticket: { project?: string; projectId?: string } | null | undefined): boolean {
  if (!ticket || !ticket.project) return false;
  const p = ticket.project.toLowerCase();
  return p.includes('dev ops') || p.includes('devops');
}

export function isTicketAssignedToMe(
  ticket: { assignee?: string; assigneeId?: string } | null | undefined,
  currentUser?: { id?: string; name?: string } | null
): boolean {
  if (!ticket) return false;
  const assignee = (ticket.assignee || '').toLowerCase().trim();
  const assigneeId = String(ticket.assigneeId || '').trim();
  const myId = currentUser?.id ? String(currentUser.id).trim() : '';
  const myName = currentUser?.name ? currentUser.name.toLowerCase().trim() : '';

  if (myId && assigneeId && assigneeId === myId) return true;
  if (myName && assignee && (assignee === myName || assignee.includes(myName) || myName.includes(assignee))) return true;
  if (assignee === 'me') return true;
  if (assignee.includes('nibas')) return true;
  return false;
}

export function shouldIncludeTicket(
  ticket: { project?: string; assignee?: string; assigneeId?: string } | null | undefined,
  currentUser?: { id?: string; name?: string } | null
): boolean {
  if (!ticket) return false;
  if (isDevOpsAndITTicket(ticket)) {
    return isTicketAssignedToMe(ticket, currentUser);
  }
  return true;
}
