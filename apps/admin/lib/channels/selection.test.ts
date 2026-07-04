import { describe, expect, it } from "vitest";
import { resolveInitialChannelSelection } from "./selection";

const channels = [
  { id: "channel-first", name: "First" },
  { id: "channel-default", name: "Default" },
  { id: "channel-current", name: "Current" },
];

describe("resolveInitialChannelSelection", () => {
  it("uses a valid current channel over the default computer channel on startup", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: true,
        currentChannelId: "channel-current",
        defaultComputerChannelId: "channel-default",
      }),
    ).toEqual({
      channel: channels[2],
      defaultComputerChannel: channels[1],
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: "channel-current",
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });

  it("uses the default computer channel when no current channel is stored", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: true,
        currentChannelId: null,
        defaultComputerChannelId: "channel-default",
      }),
    ).toEqual({
      channel: channels[1],
      defaultComputerChannel: channels[1],
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: "channel-default",
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });

  it("uses the default computer channel when the stored current channel is invalid", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: true,
        currentChannelId: "missing-current",
        defaultComputerChannelId: "channel-default",
      }),
    ).toEqual({
      channel: channels[1],
      defaultComputerChannel: channels[1],
      invalidCurrentChannelId: "missing-current",
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: "channel-default",
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });

  it("does not invalidate stored channels while the channel list is unverified", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: false,
        currentChannelId: null,
        defaultComputerChannelId: "missing-default",
      }),
    ).toEqual({
      channel: channels[0],
      defaultComputerChannel: null,
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: "channel-first",
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });

  it("does not overwrite an unmatched current channel while the channel list is unverified", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: false,
        currentChannelId: "missing-current",
        defaultComputerChannelId: "channel-default",
      }),
    ).toEqual({
      channel: channels[1],
      defaultComputerChannel: channels[1],
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: "missing-current",
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });

  it("falls back to the first channel when neither stored channel is valid after verification", () => {
    expect(
      resolveInitialChannelSelection({
        channels,
        channelsVerified: true,
        currentChannelId: null,
        defaultComputerChannelId: "missing-default",
      }),
    ).toEqual({
      channel: channels[0],
      defaultComputerChannel: null,
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: "missing-default",
      persistedCurrentChannelId: "channel-first",
      shouldPromptDefaultComputerChannelSetup: true,
    });
  });

  it("does not invalidate stored channels or prompt when the verified channel list is empty", () => {
    expect(
      resolveInitialChannelSelection({
        channels: [],
        channelsVerified: true,
        currentChannelId: "missing-current",
        defaultComputerChannelId: "missing-default",
      }),
    ).toEqual({
      channel: null,
      defaultComputerChannel: null,
      invalidCurrentChannelId: null,
      invalidDefaultComputerChannelId: null,
      persistedCurrentChannelId: null,
      shouldPromptDefaultComputerChannelSetup: false,
    });
  });
});
