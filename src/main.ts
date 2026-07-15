import './game';
import { capturePendingInviteFromUrl } from './lib/identity';
import { injectGlobalStyles } from './lib/globalStyles';
import { initInstallPromptCapture } from './lib/installPrompt';

injectGlobalStyles();

// Capture ?ref=CODE from a friend invite link before anything else runs
capturePendingInviteFromUrl();

// Capture the browser's beforeinstallprompt event (Android/Chrome/Edge) as
// early as possible — it only fires once per page load, and any scene that
// wants to offer an install button later needs this to have already run.
initInstallPromptCapture();
