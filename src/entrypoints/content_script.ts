import {
  ensureContentScriptInstalled,
  notifyContentScriptReady,
} from '@/lib/content-script';

export default defineUnlistedScript(() => {
  const installed = ensureContentScriptInstalled();
  notifyContentScriptReady(installed === 'installed');
});
