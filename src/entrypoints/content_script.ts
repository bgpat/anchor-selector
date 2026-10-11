import { installContentScript } from '@/lib/content-script';

export default defineUnlistedScript(() => {
  installContentScript();
});
