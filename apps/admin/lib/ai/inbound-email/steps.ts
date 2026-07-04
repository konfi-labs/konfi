type InboundEmailStepsServer = typeof import("./steps.server");

type StepInput<TName extends keyof InboundEmailStepsServer> = Parameters<
  InboundEmailStepsServer[TName]
>[0];

type StepOutput<TName extends keyof InboundEmailStepsServer> = Awaited<
  ReturnType<InboundEmailStepsServer[TName]>
>;

async function getInboundEmailStepsServer() {
  return import("./steps.server");
}

export async function loadInboundEmailStartContextStep(
  input: StepInput<"loadInboundEmailStartContextStep">,
): Promise<StepOutput<"loadInboundEmailStartContextStep">> {
  "use step";

  const { loadInboundEmailStartContextStep } =
    await getInboundEmailStepsServer();
  return loadInboundEmailStartContextStep(input);
}

export async function routeInboundEmailStep(
  input: StepInput<"routeInboundEmailStep">,
): Promise<StepOutput<"routeInboundEmailStep">> {
  "use step";

  const { routeInboundEmailStep } = await getInboundEmailStepsServer();
  return routeInboundEmailStep(input);
}

export async function saveInboundRoutingDecisionStep(
  input: StepInput<"saveInboundRoutingDecisionStep">,
): Promise<StepOutput<"saveInboundRoutingDecisionStep">> {
  "use step";

  const { saveInboundRoutingDecisionStep } = await getInboundEmailStepsServer();
  return saveInboundRoutingDecisionStep(input);
}

export async function finalizeInboundEmailStep(
  input: StepInput<"finalizeInboundEmailStep">,
): Promise<StepOutput<"finalizeInboundEmailStep">> {
  "use step";

  const { finalizeInboundEmailStep } = await getInboundEmailStepsServer();
  return finalizeInboundEmailStep(input);
}

export async function persistInboundEmailManualCreateStep(
  input: StepInput<"persistInboundEmailManualCreateStep">,
): Promise<StepOutput<"persistInboundEmailManualCreateStep">> {
  "use step";

  const { persistInboundEmailManualCreateStep } =
    await getInboundEmailStepsServer();
  return persistInboundEmailManualCreateStep(input);
}

export async function markInboundEmailProcessingStep(
  input: StepInput<"markInboundEmailProcessingStep">,
): Promise<StepOutput<"markInboundEmailProcessingStep">> {
  "use step";

  const { markInboundEmailProcessingStep } = await getInboundEmailStepsServer();
  return markInboundEmailProcessingStep(input);
}

export async function markInboundEmailFailureStep(
  input: StepInput<"markInboundEmailFailureStep">,
): Promise<StepOutput<"markInboundEmailFailureStep">> {
  "use step";

  const { markInboundEmailFailureStep } = await getInboundEmailStepsServer();
  return markInboundEmailFailureStep(input);
}

export async function sendInboundAdminReplyStep(
  input: StepInput<"sendInboundAdminReplyStep">,
): Promise<StepOutput<"sendInboundAdminReplyStep">> {
  "use step";

  const { sendInboundAdminReplyStep } = await getInboundEmailStepsServer();
  return sendInboundAdminReplyStep(input);
}
