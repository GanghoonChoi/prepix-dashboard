interface Window {
  Paddle?: {
    Environment: {
      set: (env: string) => void;
    };
    Initialize: (config: Record<string, unknown>) => void;
    Checkout: {
      open: (config: Record<string, unknown>) => void;
    };
  };
  // Set to true by the dashboard layout only after Paddle.Initialize() succeeds.
  // The plan page checks this before using the overlay; when false it falls back
  // to the hosted-checkout redirect so a missing client token can't strand the
  // user on a broken overlay.
  __paddleReady?: boolean;
  // Google Identity Services (accounts.google.com/gsi/client). Loaded on the
  // auth pages for "Sign in with Google".
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential?: string }) => void;
          [key: string]: unknown;
        }) => void;
        renderButton: (
          parent: HTMLElement,
          options: Record<string, unknown>,
        ) => void;
        prompt: () => void;
      };
    };
  };
}
