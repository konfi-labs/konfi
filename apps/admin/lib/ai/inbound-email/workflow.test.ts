vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  finalizeInboundEmailStep: vi.fn(),
  markInboundEmailFailureStep: vi.fn(),
  markInboundEmailProcessingStep: vi.fn(),
  persistInboundEmailManualCreateStep: vi.fn(),
  routeInboundEmailStep: vi.fn(),
  sendInboundAdminReplyStep: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: "workflow-run-1" }),
}));

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  inboundEmailWorkflowStepIds,
  runInboundEmailWorkflow,
} from "./workflow";
import type {
  InboundEmailWorkflowContext,
  InboundRoutingDecision,
} from "./types";

const context: InboundEmailWorkflowContext = {
  channelId: "channel-1",
};
const workflowUseStepSymbol = Symbol.for("WORKFLOW_USE_STEP");
const workflowGlobal = globalThis as typeof globalThis &
  Record<symbol, unknown>;
let previousUseStep: unknown;

const blockedDecision: InboundRoutingDecision = {
  blockReason: "unknown-sender",
  items: [],
  missingInformation: [],
  model: null,
  outcome: "blocked",
  rationale: "Unknown sender.",
  senderAuthentication: {
    dkim: "pass",
    dmarc: "pass",
    reasons: [],
    spf: "pass",
    verdict: "trusted",
  },
};

const quoteDecision: InboundRoutingDecision = {
  ...blockedDecision,
  blockReason: undefined,
  items: [],
  missingInformation: [],
  model: null,
  outcome: "quote",
  rationale: "Quote can be prepared.",
};

describe("runInboundEmailWorkflow", () => {
  beforeAll(() => {
    previousUseStep = workflowGlobal[workflowUseStepSymbol];
    workflowGlobal[workflowUseStepSymbol] = (stepId: string) => {
      const stepById: Record<string, (input: unknown) => unknown> = {
        [inboundEmailWorkflowStepIds.markFailure]:
          mocks.markInboundEmailFailureStep,
        [inboundEmailWorkflowStepIds.markProcessing]:
          mocks.markInboundEmailProcessingStep,
        [inboundEmailWorkflowStepIds.persistManualCreate]:
          mocks.persistInboundEmailManualCreateStep,
        [inboundEmailWorkflowStepIds.route]: mocks.routeInboundEmailStep,
        [inboundEmailWorkflowStepIds.sendAdminReply]:
          mocks.sendInboundAdminReplyStep,
      };
      const step = stepById[stepId];

      if (!step) {
        throw new Error(`Unexpected step id: ${stepId}`);
      }

      return step;
    };
  });

  afterAll(() => {
    workflowGlobal[workflowUseStepSymbol] = previousUseStep;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendInboundAdminReplyStep.mockResolvedValue({
      decision: blockedDecision,
      response: {
        body: "Blocked",
        subject: "Blocked",
        to: "admin@example.local",
      },
    });
  });

  it("does not finalize blocked decisions", async () => {
    mocks.routeInboundEmailStep.mockResolvedValue(blockedDecision);

    await runInboundEmailWorkflow({ inboundEmailId: "email-1" }, context);

    expect(mocks.markInboundEmailProcessingStep).toHaveBeenCalledWith({
      inboundEmailId: "email-1",
      workflowRunId: "workflow-run-1",
    });
    expect(mocks.finalizeInboundEmailStep).not.toHaveBeenCalled();
    expect(mocks.persistInboundEmailManualCreateStep).not.toHaveBeenCalled();
    expect(mocks.sendInboundAdminReplyStep).toHaveBeenCalledWith({
      collectedData: undefined,
      decision: blockedDecision,
      inboundEmailId: "email-1",
      sendEmail: true,
    });
  });

  it("stores non-blocked decisions for manual creation instead of finalizing", async () => {
    const collectedData = { items: [] };
    mocks.routeInboundEmailStep.mockResolvedValue(quoteDecision);
    mocks.persistInboundEmailManualCreateStep.mockResolvedValue({
      collectedData,
      decision: quoteDecision,
    });

    await runInboundEmailWorkflow({ inboundEmailId: "email-1" }, context);

    expect(mocks.finalizeInboundEmailStep).not.toHaveBeenCalled();
    expect(mocks.persistInboundEmailManualCreateStep).toHaveBeenCalledWith({
      decision: quoteDecision,
      inboundEmailId: "email-1",
      workflowRunId: "workflow-run-1",
    });
    expect(mocks.sendInboundAdminReplyStep).toHaveBeenCalledWith({
      collectedData,
      decision: quoteDecision,
      inboundEmailId: "email-1",
      sendEmail: true,
    });
  });

  it("can suppress the outbound admin reply for benchmark runs", async () => {
    const benchmarkRoutingContext = {
      items: [],
      senderMatch: {
        candidate: {
          contact: {
            active: true,
            email: "buyer@example.com",
            name: "Buyer",
            phone: "",
          },
          customer: {
            active: true,
            billingAddresses: [],
            contacts: [],
            email: "buyer@example.com",
            id: "customer-1",
            name: "Buyer Company",
            shippingAddresses: [],
          },
          matchField: "customer-email",
        },
        candidates: [],
        status: "exact",
      },
    } satisfies InboundEmailWorkflowContext["benchmarkRoutingContext"];
    mocks.routeInboundEmailStep.mockResolvedValue(blockedDecision);

    await runInboundEmailWorkflow(
      { inboundEmailId: "email-1" },
      { ...context, benchmarkRoutingContext, sendAdminReply: false },
    );

    expect(mocks.routeInboundEmailStep).toHaveBeenCalledWith({
      benchmarkRoutingContext,
      channelId: "channel-1",
      inboundEmailId: "email-1",
    });
    expect(mocks.sendInboundAdminReplyStep).toHaveBeenCalledWith({
      collectedData: undefined,
      decision: blockedDecision,
      inboundEmailId: "email-1",
      sendEmail: false,
    });
  });

  it("marks the inbound email as failed when a workflow step throws", async () => {
    mocks.routeInboundEmailStep.mockRejectedValue(new Error("routing failed"));

    await expect(
      runInboundEmailWorkflow({ inboundEmailId: "email-1" }, context),
    ).rejects.toThrow("routing failed");
    expect(mocks.markInboundEmailFailureStep).toHaveBeenCalledWith({
      error: "routing failed",
      inboundEmailId: "email-1",
      workflowRunId: "workflow-run-1",
    });
  });
});
