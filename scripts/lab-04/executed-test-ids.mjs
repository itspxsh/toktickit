export function filterExecutedTestIds(output, inventoryIds) {
  const found = output.match(/\b(?:T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}|RELEASE-01)\b/g) ?? [];
  return [...new Set(found.filter((id) => inventoryIds.has(id)))].sort();
}
