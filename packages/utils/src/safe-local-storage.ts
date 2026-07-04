/**
 * Safe localStorage wrapper that handles SecurityError exceptions
 * which can occur when localStorage access is restricted (e.g., in private browsing mode)
 */
export const safeLocalStorage = {
  /**
   * Get an item from localStorage with fallback handling
   */
  getItem: (key: string, defaultValue: string = ""): string => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        return localStorage.getItem(key) || defaultValue;
      }
    } catch (error) {
      console.debug("Unable to access localStorage:", error);
    }
    return defaultValue;
  },

  /**
   * Set an item in localStorage with error handling
   */
  setItem: (key: string, value: string): void => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.debug("Unable to write to localStorage:", error);
    }
  },

  /**
   * Remove an item from localStorage with error handling
   */
  removeItem: (key: string): void => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.debug("Unable to remove from localStorage:", error);
    }
  },

  /**
   * Clear all localStorage with error handling
   */
  clear: (): void => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.clear();
      }
    } catch (error) {
      console.debug("Unable to clear localStorage:", error);
    }
  },

  /**
   * Get and parse JSON from localStorage with fallback handling
   */
  getJSON: <T>(key: string, defaultValue: T | null = null): T | null => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        const item = localStorage.getItem(key);
        if (item) {
          return JSON.parse(item) as T;
        }
      }
    } catch (error) {
      console.debug("Unable to parse JSON from localStorage:", error);
    }
    return defaultValue;
  },

  /**
   * Set a JSON object in localStorage with error handling
   */
  setJSON: <T>(key: string, value: T): void => {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.debug("Unable to set JSON in localStorage:", error);
    }
  },
};
