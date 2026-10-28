"use client";

import Intercom, { update } from "@intercom/messenger-js-sdk";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";

// The same workspace as prepix.ai (apps/site/next.config.ts). Public by
// construction — it ships in the page and authorises nothing. Empty = off.
const APP_ID = process.env.NEXT_PUBLIC_INTERCOM_APP_ID ?? "q2xxme4l";

/**
 * The Fin messenger, as the signed-in account.
 *
 * Who this is reaches Intercom only inside the JWT the backend signs
 * (`GET /intercom/token`), never as a bare user_id/email from here — anyone
 * can type those into the console. Fin files refund reviews on that user_id,
 * so this is what keeps one account from filing on another. Until the backend
 * has the Messenger secret the token is null and the messenger is anonymous.
 */
export function IntercomMessenger() {
  const { lang } = useI18n();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (!APP_ID) return;
    let cancelled = false;
    apiClient
      .get<{ data: { token: string | null } }>("/intercom/token")
      .then((r) => r.data.data.token, () => null)
      .then((token) => {
        if (cancelled) return;
        Intercom({
          app_id: APP_ID,
          language_override: lang,
          ...(token ? { intercom_user_jwt: token } : {}),
        });
        setBooted(true);
      });
    return () => {
      cancelled = true;
    };
    // Boots once; a language switch goes through update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booted) update({ language_override: lang });
  }, [booted, lang]);

  return null;
}
