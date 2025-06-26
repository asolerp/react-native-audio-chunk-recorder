/**
 * Error tracking provider interface and implementations
 * Supports Sentry and other error tracking services
 */

export interface ErrorTracker {
  captureException: (error: Error, context?: Record<string, any>) => void;
  captureMessage: (
    message: string,
    level?: "info" | "warning" | "error"
  ) => void;
  setUser: (userId: string) => void;
  setTag: (key: string, value: string) => void;
  setContext: (name: string, context: Record<string, any>) => void;
  addBreadcrumb: (breadcrumb: {
    message: string;
    category?: string;
    level?: "info" | "warning" | "error";
    data?: Record<string, any>;
  }) => void;
}

/**
 * No-op error tracker for when no error tracking is configured
 */
export const noopErrorTracker: ErrorTracker = {
  captureException: () => {},
  captureMessage: () => {},
  setUser: () => {},
  setTag: () => {},
  setContext: () => {},
  addBreadcrumb: () => {},
};

/**
 * Sentry error tracker implementation
 * Requires @sentry/react-native to be installed
 */
export const createSentryErrorTracker = (dsn: string): ErrorTracker => {
  let Sentry: any = null;

  try {
    Sentry = require("@sentry/react-native");
    Sentry.init({ dsn });
  } catch (error) {
    console.warn("Sentry not available, falling back to no-op error tracker");
    return noopErrorTracker;
  }

  return {
    captureException: (error: Error, context?: Record<string, any>) => {
      if (context) {
        Sentry.setContext("audio_recorder", context);
      }
      Sentry.captureException(error);
    },

    captureMessage: (
      message: string,
      level: "info" | "warning" | "error" = "info"
    ) => {
      Sentry.captureMessage(message, level);
    },

    setUser: (userId: string) => {
      Sentry.setUser({ id: userId });
    },

    setTag: (key: string, value: string) => {
      Sentry.setTag(key, value);
    },

    setContext: (name: string, context: Record<string, any>) => {
      Sentry.setContext(name, context);
    },

    addBreadcrumb: (breadcrumb: {
      message: string;
      category?: string;
      level?: "info" | "warning" | "error";
      data?: Record<string, any>;
    }) => {
      Sentry.addBreadcrumb({
        message: breadcrumb.message,
        category: breadcrumb.category || "audio_recorder",
        level: breadcrumb.level || "info",
        data: breadcrumb.data,
      });
    },
  };
};

/**
 * Console error tracker for development/debugging
 */
export const createConsoleErrorTracker = (): ErrorTracker => {
  return {
    captureException: (error: Error, context?: Record<string, any>) => {
      console.error("[AudioRecorder Error]", error);
      if (context) {
        console.error("[AudioRecorder Context]", context);
      }
    },

    captureMessage: (
      message: string,
      level: "info" | "warning" | "error" = "info"
    ) => {
      const logMethod =
        level === "error"
          ? console.error
          : level === "warning"
          ? console.warn
          : console.log;
      logMethod(`[AudioRecorder ${level.toUpperCase()}]`, message);
    },

    setUser: (userId: string) => {
      console.log("[AudioRecorder] Set user:", userId);
    },

    setTag: (key: string, value: string) => {
      console.log(`[AudioRecorder] Set tag ${key}:`, value);
    },

    setContext: (name: string, context: Record<string, any>) => {
      console.log(`[AudioRecorder] Set context ${name}:`, context);
    },

    addBreadcrumb: (breadcrumb: {
      message: string;
      category?: string;
      level?: "info" | "warning" | "error";
      data?: Record<string, any>;
    }) => {
      console.log(
        `[AudioRecorder Breadcrumb] ${
          breadcrumb.category || "audio_recorder"
        }:`,
        breadcrumb.message,
        breadcrumb.data
      );
    },
  };
};
