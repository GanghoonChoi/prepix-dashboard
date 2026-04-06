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
}
