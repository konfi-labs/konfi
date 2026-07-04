import {
  BadgePlus,
  Banknote,
  BellRing,
  ChevronsDown,
  Clipboard,
  ClipboardCheck,
  ClipboardPenLine,
  Contact,
  Cuboid,
  DraftingCompass,
  Factory,
  FilePenLine,
  FileSearch,
  Flag,
  Headset,
  MailOpen,
  MapPin,
  MessageCircleWarning,
  MessageSquareQuote,
  Route,
  Ruler,
  Scale,
  SquareDashed,
  TrendingDown,
  TrendingUp,
  UserCog,
  Wallet,
} from "lucide-react";
import { getLucideIconForMaterialSymbol } from "../materialSymbolToLucide";

describe("metadata icon mappings", () => {
  test.each([
    ["straighten", Ruler],
    ["support_agent", Headset],
    ["crop_square", SquareDashed],
    ["linear_scale", Ruler],
    ["route", Route],
    ["deployed_code", Cuboid],
    ["image_search", FileSearch],
    ["edit_document", FilePenLine],
    ["rate_review", ClipboardPenLine],
    ["account_balance_wallet", Wallet],
    ["drafts", MailOpen],
    ["money", Banknote],
    ["wallet", Wallet],
    ["badge", Contact],
    ["pin_drop", MapPin],
    ["move_location", MapPin],
    ["square_foot", Ruler],
    ["scale", Scale],
    ["view_in_ar", Cuboid],
  ])(
    "maps console warning icon %s to the expected Lucide icon",
    (name, icon) => {
      expect(getLucideIconForMaterialSymbol(name)).toBe(icon);
    },
  );

  test.each([
    ["feedback", MessageCircleWarning],
    ["fiber_new", BadgePlus],
    ["format_quote", MessageSquareQuote],
    ["task", ClipboardCheck],
    ["person_alert", UserCog],
    ["low_priority", ChevronsDown],
    ["flag", Flag],
    ["notification_important", BellRing],
    ["manufacturing", Factory],
    ["design_services", DraftingCompass],
    ["assignment", Clipboard],
    ["trending_up", TrendingUp],
    ["trending_down", TrendingDown],
  ])("maps selectable metadata icon %s", (name, icon) => {
    expect(getLucideIconForMaterialSymbol(name)).toBe(icon);
  });
});
