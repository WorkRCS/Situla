export function formatRuntimeDuration(valueInMinutes) {
  const minutesValue = Number(valueInMinutes);
  if (!Number.isFinite(minutesValue) || minutesValue <= 0) return "";

  const totalSeconds = Math.max(1, Math.round(minutesValue * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours + "h " + minutes + "m " + seconds + "s";
}
