type Permission = { granted: boolean; canAskAgain: boolean };

export async function notificationPermissionGranted(read: () => Promise<Permission>, request: () => Promise<Permission>): Promise<boolean> {
  const current = await read();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await request()).granted;
}
