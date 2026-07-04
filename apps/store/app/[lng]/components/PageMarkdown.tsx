import { Box, Heading, List, Text } from "@chakra-ui/react";
import { GoogleMapsEmbed } from "@next/third-parties/google";
import { Link } from "@konfi/components";
import { MDXRemote } from "next-mdx-remote/rsc";
import type { ComponentProps } from "react";

interface Props {
  source: string;
}

type BoxProps = ComponentProps<typeof Box>;
type HeadingProps = ComponentProps<typeof Heading>;
type LinkProps = ComponentProps<typeof Link> & {
  hasColor?: boolean;
  lng?: string;
};
type ListItemProps = ComponentProps<typeof List.Item>;
type ListRootProps = ComponentProps<typeof List.Root>;
type TextProps = ComponentProps<typeof Text>;
type GoogleMapsEmbedProps = ComponentProps<typeof GoogleMapsEmbed>;

type MarkdownGoogleMapsEmbedProps = Omit<
  GoogleMapsEmbedProps,
  "apiKey" | "q"
> & {
  apiKey?: string;
  q?: string;
};

function normalizeGoogleMapsQuery(
  query: string | undefined,
): string | undefined {
  if (!query) return query;

  const queryWithSpaces = query.replace(/\+/g, " ");

  try {
    return decodeURIComponent(queryWithSpaces);
  } catch {
    return queryWithSpaces;
  }
}

const components = {
  h1: (props: HeadingProps) => (
    <Heading fontSize={"4xl"} size={"4xl"} mb={"8"} {...props} />
  ),
  h2: (props: HeadingProps) => (
    <Heading as={"h2"} size={"2xl"} mt={"4"} mb={"2"} {...props} />
  ),
  h3: (props: HeadingProps) => (
    <Heading as={"h3"} size={"xl"} mt={"4"} mb={"2"} {...props} />
  ),
  p: (props: TextProps) => <Text {...props} />,
  a: ({ href, lng, hasColor: _hasColor, ...props }: LinkProps) => (
    <Link lng={lng} href={href} {...props} hasColor />
  ),
  ol: (props: ListRootProps) => (
    <List.Root as={"ol"} {...props} listStyleType={"decimal"} m={4} />
  ),
  ul: (props: ListRootProps) => (
    <List.Root {...props} listStyleType={"disc"} pl={4} py={1} />
  ),
  li: (props: ListItemProps) => <List.Item {...props} m={2} />,
  Box: (props: BoxProps) => <Box {...props} />,
  GoogleMapsEmbed: (props: MarkdownGoogleMapsEmbedProps) => (
    <GoogleMapsEmbed
      {...props}
      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
      q={normalizeGoogleMapsQuery(props.q)}
    />
  ),
};

export function PageMarkdown({ source }: Props) {
  return <MDXRemote source={source} components={components} />;
}
