export function splitShares(totalCents: number, memberIds: string[]) {
  const base = Math.floor(totalCents / memberIds.length)
  const extra = totalCents % memberIds.length
  return memberIds.map((memberId, index) => ({
    memberId,
    amountCents: base + (index < extra ? 1 : 0),
  }))
}
