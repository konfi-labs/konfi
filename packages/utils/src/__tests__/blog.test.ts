/**
 * Calculate estimated reading time for content
 */
function calculateReadingTime(content: string): number {
  // Average reading speed is about 200 words per minute
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  const readingTime = Math.ceil(words / wordsPerMinute);
  return Math.max(1, readingTime); // Minimum 1 minute
}

describe("Blog utilities", () => {
  describe("calculateReadingTime", () => {
    it("should calculate reading time for short content", () => {
      const content =
        "This is a short piece of content with about twenty words in it for testing purposes.";
      const readingTime = calculateReadingTime(content);
      expect(readingTime).toBe(1); // Minimum 1 minute
    });

    it("should calculate reading time for longer content", () => {
      const content = "Lorem ipsum ".repeat(100); // ~200 words
      const readingTime = calculateReadingTime(content);
      expect(readingTime).toBe(1); // 200 words / 200 wpm = 1 minute
    });

    it("should calculate reading time for very long content", () => {
      const content = "Lorem ipsum ".repeat(500); // ~1000 words
      const readingTime = calculateReadingTime(content);
      expect(readingTime).toBe(5); // 1000 words / 200 wpm = 5 minutes
    });

    it("should handle empty content", () => {
      const readingTime = calculateReadingTime("");
      expect(readingTime).toBe(1); // Minimum 1 minute
    });
  });
});
