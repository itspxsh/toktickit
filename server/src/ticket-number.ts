/** The only application-level path for allocating a Ticket number. */
export interface TicketSequenceClient {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}

export interface AllocatedTicketNumber {
  ticketNumber: string;
  ticketSequence: bigint;
}

export function formatTicketNumber(sequence: bigint, now = new Date()): string {
  if (sequence < 1n) {
    throw new Error("Ticket sequence must be positive");
  }
  if (sequence > 999999n) {
    throw new Error("Ticket sequence must fit six digits");
  }

  const year = now.getUTCFullYear();
  if (!Number.isInteger(year)) {
    throw new Error("Ticket date must be valid");
  }

  return `TKT-${year}-${sequence.toString().padStart(6, "0")}`;
}

/**
 * Obtain one PostgreSQL sequence value and derive the official number from it.
 * Ticket creation must pass both returned fields to the same insert so the
 * persisted sequence and displayed number cannot drift apart.
 */
export async function allocateTicketNumber(
  prisma: TicketSequenceClient,
  now = new Date(),
): Promise<AllocatedTicketNumber> {
  const rows = (await prisma.$queryRaw`
    SELECT nextval('ticket_number_seq') AS sequence
  `) as Array<{ sequence: bigint | number | string }>;
  const sequence = BigInt(rows[0]?.sequence ?? 0);

  return {
    ticketSequence: sequence,
    ticketNumber: formatTicketNumber(sequence, now),
  };
}
