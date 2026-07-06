"use client";

import { Button, Select } from "nextra/components";
import { useCopy } from "nextra/hooks";
import {
  ArrowRightIcon,
  ChatGPTIcon,
  CopyIcon,
  LinkArrowIcon,
} from "nextra/icons";
import type { ComponentType, SVGProps } from "react";
import cs from "../lib/locales/cs.json";
import de from "../lib/locales/de.json";
import en from "../lib/locales/en.json";
import fr from "../lib/locales/fr.json";
import pl from "../lib/locales/pl.json";
import sk from "../lib/locales/sk.json";
import uk from "../lib/locales/uk.json";
import type { DocsDictionary, Locale } from "../lib/i18n";
import { useDocsLocale } from "./docs-locale-provider";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type PageActionLabels = DocsDictionary["pageActions"];

type ActionItemProps = {
  description: string;
  icon: IconComponent;
  isExternal?: boolean;
  title: string;
};

const pageActionLabels = {
  cs: cs.pageActions,
  de: de.pageActions,
  en: en.pageActions,
  fr: fr.pageActions,
  pl: pl.pageActions,
  sk: sk.pageActions,
  uk: uk.pageActions,
} satisfies Record<Locale, PageActionLabels>;

function joinClasses(classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ActionItem({
  description,
  icon: Icon,
  isExternal,
  title,
}: ActionItemProps) {
  return (
    <div className="x:flex x:gap-3 x:items-center">
      <Icon width="16" />
      <div className="x:flex x:flex-col">
        <span className="x:font-medium x:flex x:gap-1">
          {title}
          {isExternal ? <LinkArrowIcon height="1em" /> : null}
        </span>
        <span className="x:text-xs">{description}</span>
      </div>
    </div>
  );
}

function formatPrompt(template: string, url: string) {
  return template.replace("{{url}}", url);
}

export function CopyPageActions({ sourceCode }: { sourceCode: string }) {
  const locale = useDocsLocale();
  const labels = pageActionLabels[locale];
  const { copy, isCopied } = useCopy();

  function handleCopy() {
    void copy(sourceCode);
  }

  function handleSelect(value: string) {
    if (value === "copy") {
      handleCopy();
      return;
    }

    if (value === "chatgpt") {
      const query = formatPrompt(labels.chatGptPrompt, window.location.href);
      const encodedQuery = encodeURIComponent(query);

      window.open(
        `https://chatgpt.com/?hints=search&prompt=${encodedQuery}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  }

  const buttonLabel = isCopied ? labels.copied : labels.copyPage;
  const buttonClassName = ({ hover }: { focus: boolean; hover: boolean }) =>
    joinClasses([
      "x:ps-2 x:pe-1 x:flex x:gap-2 x:text-sm x:font-medium x:items-center",
      isCopied && "x:opacity-70",
      hover &&
        "x:bg-gray-200 x:text-gray-900 x:dark:bg-primary-100/5 x:dark:text-gray-50",
    ]);

  return (
    <div className="x:border x:inline-flex x:rounded-md x:items-stretch nextra-border x:float-end x:overflow-hidden">
      <Button
        aria-label={buttonLabel}
        className={buttonClassName}
        onClick={handleCopy}
      >
        <CopyIcon width="16" />
        {buttonLabel}
      </Button>
      <Select
        anchor={{ to: "bottom end", gap: 10 }}
        className="x:rounded-none"
        onChange={handleSelect}
        options={[
          {
            id: "copy",
            name: (
              <ActionItem
                description={labels.copyPageDescription}
                icon={CopyIcon}
                title={labels.copyPage}
              />
            ),
          },
          {
            id: "chatgpt",
            name: (
              <ActionItem
                description={labels.openInChatGPTDescription}
                icon={ChatGPTIcon}
                isExternal
                title={labels.openInChatGPT}
              />
            ),
          },
        ]}
        selectedOption={<ArrowRightIcon className="x:rotate-90" width="12" />}
        title={labels.menuLabel}
        value=""
      />
    </div>
  );
}
