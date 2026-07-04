import { describe, expect, it } from "vitest";
import {
  evaluateInboundAdminForwarderAuthentication,
  evaluateInboundSenderAuthentication,
  normalizeHeaders,
  parseSenderAuthenticationHeaders,
} from "./sender-auth";

describe("parseSenderAuthenticationHeaders", () => {
  it("trusts DMARC pass", () => {
    expect(
      parseSenderAuthenticationHeaders({
        "Authentication-Results":
          "mx.resend.dev; spf=fail smtp.mailfrom=example.com; dkim=fail; dmarc=pass header.from=example.com",
      }),
    ).toMatchObject({
      dmarc: "pass",
      verdict: "trusted",
    });
  });

  it("trusts combined SPF and DKIM pass", () => {
    expect(
      parseSenderAuthenticationHeaders({
        "authentication-results":
          "mx.resend.dev; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com",
      }),
    ).toMatchObject({
      dkim: "pass",
      spf: "pass",
      verdict: "trusted",
    });
  });

  it("requires SPF/DKIM fallback authentication to align with the From domain", () => {
    expect(
      evaluateInboundSenderAuthentication({
        from: "Buyer <buyer@example.com>",
        headers: {
          "authentication-results":
            "mx.resend.dev; spf=pass smtp.mailfrom=mailer.example.net; dkim=pass header.d=example.net",
          "return-path": "<bounce@example.net>",
        },
      }),
    ).toMatchObject({
      verdict: "untrusted",
    });

    expect(
      evaluateInboundSenderAuthentication({
        from: "Buyer <buyer@example.com>",
        headers: {
          "authentication-results":
            "mx.resend.dev; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com",
          "return-path": "<bounce@example.com>",
        },
      }),
    ).toMatchObject({
      verdict: "trusted",
    });
  });

  it("blocks messages without trusted authentication results", () => {
    const result = parseSenderAuthenticationHeaders(normalizeHeaders({}));

    expect(result.verdict).toBe("untrusted");
    expect(result.reasons).toContain(
      "No sender authentication headers were present.",
    );
  });

  it("trusts a known admin forwarder with aligned SPF even when DKIM and DMARC are absent", () => {
    expect(
      evaluateInboundAdminForwarderAuthentication({
        adminEmail: "forwarding-admin@print.example",
        from: '"Forwarding Admin" <forwarding-admin@print.example>',
        headers: {
          "authentication-results":
            "amazonses.com; spf=pass envelope-from=forwarding-admin@print.example; dmarc=none header.from=print.example; dkim=none",
          "return-path": "forwarding-admin@print.example",
        },
      }),
    ).toMatchObject({
      dkim: "none",
      dmarc: "none",
      spf: "pass",
      verdict: "trusted",
    });
  });

  it("does not apply the admin forwarder fallback to a different sender", () => {
    expect(
      evaluateInboundAdminForwarderAuthentication({
        adminEmail: "forwarding-admin@print.example",
        from: "Attacker <attacker@print.example>",
        headers: {
          "authentication-results":
            "amazonses.com; spf=pass envelope-from=attacker@print.example; dmarc=none header.from=print.example; dkim=none",
          "return-path": "attacker@print.example",
        },
      }),
    ).toMatchObject({
      verdict: "untrusted",
    });
  });
});
