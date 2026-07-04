import { describe, expect, test } from "vitest";
import { toSlug } from "../../formatters/to-slug";

describe("toSlug utility", () => {
  test("should_convert_input_with_surrounding_spaces_and_uppercase_letters_into_a_lowercase_hyphenated_slug", () => {
    // Arrange
    const input = "  Hello World  ";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("hello-world");
  });

  test("should_remove_diacritics_and_replace_non_alphanumeric_with_hyphens", () => {
    // Arrange
    const input = "Zażółć gęślą jaźń";

    // Act
    const result = toSlug(input);

    // Assert
    // Non-decomposing characters like 'ł' are replaced with hyphens
    expect(result).toBe("zazo-c-gesla-jazn");
  });

  test("should_collapse_multiple_non_alphanumeric_characters_into_single_hyphens_and_trim_them_from_ends", () => {
    // Arrange
    const input = "---Hello---World!!!";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("hello-world");
  });

  test("should_preserve_numbers_and_replace_dots_and_spaces_with_hyphens", () => {
    // Arrange
    const input = "Product 123 Version 4.5";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("product-123-version-4-5");
  });

  test("should_return_empty_string_when_input_contains_only_non_latin_characters", () => {
    // Arrange
    const input = "Привет мир";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("");
  });

  test("should_return_empty_string_when_input_is_only_whitespace", () => {
    // Arrange
    const input = "     ";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("");
  });

  test("should_handle_mixed_accents_hyphens_and_symbols_consistently", () => {
    // Arrange
    const input = "Café-au-lait & Crème brûlée!";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("cafe-au-lait-creme-brulee");
  });

  test("should_normalize_already_slugified_string_without_changes", () => {
    // Arrange
    const input = "already-slugified-string";

    // Act
    const result = toSlug(input);

    // Assert
    expect(result).toBe("already-slugified-string");
  });
});
