// Thin wrapper around Google's Ad Placement API (adBreak/adConfig), used for
// H5 Games Ads rewarded video. The real functions are injected by the inline
// shim script in index.html, which queues calls onto window.adsbygoogle
// before the AdSense script tag has finished loading.
//
// Docs: https://developers.google.com/ad-placement/apis/adbreak

type PlacementInfo = {
  breakType: string;
  breakName?: string;
  breakFormat?: 'interstitial' | 'reward';
  breakStatus:
    | 'notReady'
    | 'timeout'
    | 'error'
    | 'noAdPreloaded'
    | 'frequencyCapped'
    | 'ignored'
    | 'other'
    | 'dismissed'
    | 'viewed';
};

type AdBreakConfig = {
  type: 'reward';
  name?: string;
  beforeReward?: (showAdFn: () => void) => void;
  adViewed?: () => void;
  adDismissed?: () => void;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (placementInfo: PlacementInfo) => void;
};

declare global {
  interface Window {
    adsbygoogle: unknown[];
    adBreak: (config: AdBreakConfig) => void;
    adConfig: (config: Record<string, unknown>) => void;
  }
}

/**
 * Requests a rewarded video ad via the Ad Placement API.
 * Resolves `true` only if the player watched the ad to completion.
 * Resolves `false` if they dismissed it early, no ad was available,
 * or the API isn't loaded yet (e.g. blocked by an ad blocker).
 */
export function requestRewardedAd(): Promise<boolean> {
  return new Promise(resolve => {
    if (typeof window.adBreak !== 'function') {
      console.warn('[TypeType] Ad Placement API not available — skipping rewarded ad.');
      resolve(false);
      return;
    }

    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    window.adBreak({
      type: 'reward',
      name: 'unlock-unlimited-retries',

      // Called once an ad is ready. We show our own "Watch Ad" prompt
      // via the quit modal already, so we immediately call showAdFn()
      // rather than waiting for a second confirmation.
      beforeReward: (showAdFn) => {
        showAdFn();
      },

      adViewed: () => {
        console.info('[TypeType] Rewarded ad watched in full.');
        settle(true);
      },

      adDismissed: () => {
        console.info('[TypeType] Rewarded ad dismissed early.');
        settle(false);
      },

      // Always fires last, even if no ad was shown at all — this is our
      // safety net so the promise never hangs (e.g. no fill, ad blocker,
      // network error).
      adBreakDone: (placementInfo) => {
        settle(placementInfo.breakStatus === 'viewed');
      },
    });
  });
}
