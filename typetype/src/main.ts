import './game';
import { capturePendingInviteFromUrl } from './lib/identity';
import { injectGlobalStyles } from './lib/globalStyles';

injectGlobalStyles();

// Capture ?ref=CODE from a friend invite link before anything else runs
capturePendingInviteFromUrl();
