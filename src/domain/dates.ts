const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hour = date.getHours();
  const displayHour = hour % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(timestamp)} · ${displayHour}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}
