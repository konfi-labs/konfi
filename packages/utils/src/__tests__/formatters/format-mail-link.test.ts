import { formatMailLink } from "../../formatters/format-mail-link";

describe("formatMailLink", () => {
  describe("when_url_contains_outlook_office_com_should_format_for_outlook", () => {
    it("should_replace_office_with_office365_and_transform_mail_path_and_add_query_parameters", () => {
      // Arrange
      const inputUrl =
        "https://outlook.office.com/mail/inbox/id/AAMkADExampleMessageId";
      const expectedUrl =
        "https://outlook.office365.com/owa/?ItemID=AAMkADExampleMessageId&exvsurl=1&viewmodel=ReadMessageItem";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(expectedUrl);
    });

    it("should_handle_outlook_url_with_multiple_office_occurrences", () => {
      // Arrange
      const inputUrl =
        "https://outlook.office.com/mail/inbox/id/AAMkAD.office.ExampleId";
      const expectedUrl =
        "https://outlook.office365.com/owa/?ItemID=AAMkAD.office365.ExampleId&exvsurl=1&viewmodel=ReadMessageItem";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(expectedUrl);
    });

    it("should_transform_complex_outlook_mail_inbox_path", () => {
      // Arrange
      const inputUrl =
        "https://outlook.office.com/mail/inbox/id/AAMkADg1OTY4ZjE2LTNhYWUtNGRkNi05MzQ4LWVjNjI1ZjA2NzRhNwBGAAAAAAC";
      const expectedUrl =
        "https://outlook.office365.com/owa/?ItemID=AAMkADg1OTY4ZjE2LTNhYWUtNGRkNi05MzQ4LWVjNjI1ZjA2NzRhNwBGAAAAAAC&exvsurl=1&viewmodel=ReadMessageItem";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(expectedUrl);
    });
  });

  describe("when_url_does_not_contain_outlook_office_com_should_return_unchanged", () => {
    it("should_return_gmail_url_unchanged", () => {
      // Arrange
      const inputUrl =
        "https://mail.google.com/mail/u/0/#inbox/1234567890abcdef";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl);
    });

    it("should_return_yahoo_mail_url_unchanged", () => {
      // Arrange
      const inputUrl = "https://mail.yahoo.com/d/folders/1/messages/12345";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl);
    });

    it("should_return_generic_email_url_unchanged", () => {
      // Arrange
      const inputUrl = "https://webmail.example.com/inbox/message/12345";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl);
    });

    it("should_return_empty_string_unchanged", () => {
      // Arrange
      const inputUrl = "";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl);
    });
  });

  describe("when_url_contains_outlook_office_com_but_different_path_should_still_format", () => {
    it("should_format_outlook_url_without_mail_inbox_id_path", () => {
      // Arrange
      const inputUrl = "https://outlook.office.com/calendar/view/week";
      const expectedUrl =
        "https://outlook.office365.com/calendar/view/week&exvsurl=1&viewmodel=ReadMessageItem";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(expectedUrl);
    });

    it("should_format_outlook_url_with_existing_query_parameters", () => {
      // Arrange
      const inputUrl =
        "https://outlook.office.com/mail/inbox/id/AAMkADExample?param=value";
      const expectedUrl =
        "https://outlook.office365.com/owa/?ItemID=AAMkADExample?param=value&exvsurl=1&viewmodel=ReadMessageItem";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(expectedUrl);
    });
  });

  describe("when_url_has_edge_cases_should_handle_correctly", () => {
    it("should_handle_url_with_outlook_office_com_substring_in_different_context", () => {
      // Arrange
      const inputUrl = "https://example.com/redirect?url=outlook.office.com";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(
        "https://example.com/redirect?url=outlook.office365.com&exvsurl=1&viewmodel=ReadMessageItem",
      );
    });

    it("should_handle_case_sensitive_outlook_office_com_match", () => {
      // Arrange
      const inputUrl = "https://OUTLOOK.OFFICE.COM/mail/inbox/id/AAMkADExample";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl); // Should not match due to case sensitivity
    });

    it("should_handle_null_input_gracefully", () => {
      // Arrange
      const inputUrl = null as any;

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(null); // Should return original input when error occurs
    });

    it("should_handle_undefined_input_gracefully", () => {
      // Arrange
      const inputUrl = undefined as any;

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(undefined); // Should return original input when error occurs
    });

    it("should_handle_non_string_input_gracefully", () => {
      // Arrange
      const inputUrl = 12345 as any;

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(12345); // Should return original input when error occurs
    });

    it("should_handle_object_input_gracefully", () => {
      // Arrange
      const inputUrl = { url: "https://outlook.office.com/mail" } as any;

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(result).toBe(inputUrl); // Should return original input when error occurs
    });
  });

  describe("when_error_occurs_during_processing_should_handle_gracefully", () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("should_demonstrate_error_handling_exists_for_defensive_programming", () => {
      // Note: The try-catch block in formatMailLink is for defensive programming
      // to handle potential edge cases or library failures gracefully.
      // This test verifies normal operation without error.

      const inputUrl = "https://outlook.office.com/mail/inbox/id/AAMkADExample";

      const result = formatMailLink(inputUrl);

      // Should transform normally since no actual error occurs with valid input
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(result).toBe(
        "https://outlook.office365.com/owa/?ItemID=AAMkADExample&exvsurl=1&viewmodel=ReadMessageItem",
      );
    });

    it("should_handle_valid_outlook_url_normally_without_error", () => {
      // Arrange
      const inputUrl = "https://outlook.office.com/mail/inbox/id/AAMkADExample";

      // Act
      const result = formatMailLink(inputUrl);

      // Assert
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(result).toBe(
        "https://outlook.office365.com/owa/?ItemID=AAMkADExample&exvsurl=1&viewmodel=ReadMessageItem",
      );
    });
  });
});
