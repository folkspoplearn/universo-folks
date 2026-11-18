/** PWA só existe na web (pwa.web.ts). No iOS/Android nativo não há nada a fazer. */
export function setupPwa() {}
export const isStandalone = () => true;
export function canPromptInstall() { return false; }
export async function promptInstall(): Promise<boolean> { return false; }
export function onInstallAvailable(_cb: () => void) { return () => {}; }
