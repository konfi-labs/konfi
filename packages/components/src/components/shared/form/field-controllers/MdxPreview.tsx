"use client";

import { isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import {
  Box,
  Code,
  CodeBlock,
  Float,
  Heading,
  IconButton,
  Link,
  List,
  Separator,
  Span,
  Table,
  Text,
} from "@chakra-ui/react";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { useColorMode } from "../../../ui";

function getCodeString(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((child) => getCodeString(child)).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getCodeString(children.props.children);
  }
  return "";
}

export const mdxComponents = {
  h1: (props: any) => <Heading size={"4xl"} mt={10} mb={"8"} {...props} />,
  h2: (props: any) => (
    <Heading
      textAlign={"justify"}
      as={"h2"}
      mt={8}
      mb={6}
      size={"4xl"}
      {...props}
    />
  ),
  h3: (props: any) => (
    <Heading
      textAlign={"justify"}
      as={"h3"}
      mt={6}
      mb={2}
      size={"2xl"}
      {...props}
    />
  ),
  p: (props: any) => <Text textAlign={"justify"} {...props} />,
  a: (props: any) => (
    <Link
      maxW="100%"
      lng={props.lng}
      href={props.href}
      {...props}
      hasColor
      wordBreak="break-all"
      display="inline-block"
    />
  ),
  ol: (props: any) => (
    <List.Root as={"ol"} {...props} listStyleType={"decimal"} m={4} />
  ),
  ul: (props: any) => (
    <List.Root {...props} listStyleType={"disc"} pl={4} py={1} />
  ),
  li: (props: any) => <List.Item {...props} m={2} />,
  hr: (props: any) => <Separator my={6} w={"100%"} {...props} />,
  table: (props: any) => (
    <Table.Root size="sm" variant="outline" my={4} {...props} />
  ),
  thead: (props: any) => <Table.Header {...props} />,
  tbody: (props: any) => <Table.Body {...props} />,
  tr: (props: any) => <Table.Row {...props} />,
  th: (props: any) => <Table.ColumnHeader {...props} />,
  td: (props: any) => <Table.Cell {...props} />,
  strong: (props: any) => <Span fontWeight="bold" {...props} />,
  b: (props: any) => <Span fontWeight="bold" {...props} />,
  em: (props: any) => <Span fontStyle="italic" {...props} />,
  i: (props: any) => <Span fontStyle="italic" {...props} />,
  Box: (props: any) => <Box {...props} />,
  code: (props: any) => <Code {...props} />,
  pre: (props: any) => {
    const { colorMode } = useColorMode();

    const codeString = getCodeString(props.children);
    const language =
      props.children?.props?.className?.replace("language-", "") || "text";

    return (
      <CodeBlock.Root
        code={codeString}
        language={language}
        meta={{ colorScheme: colorMode }}
        my={4}
      >
        <CodeBlock.Content>
          <Float placement="top-end" offset="5" zIndex="1">
            <CodeBlock.CopyTrigger asChild>
              <IconButton variant="ghost" size="2xs">
                <CodeBlock.CopyIndicator />
              </IconButton>
            </CodeBlock.CopyTrigger>
          </Float>
          <CodeBlock.Code>
            <CodeBlock.CodeText />
          </CodeBlock.Code>
        </CodeBlock.Content>
      </CodeBlock.Root>
    );
  },
};

export function Preview({ source }: { source?: string }) {
  const cleanedSource = useMemo(() => {
    // Remove import statements and replace GoogleMapsEmbed with placeholder
    return (source ?? "")
      .replace(/^import\s+.*from\s+['"].*['"];?\s*$/gm, "") // Remove import statements
      .replace(/^import\s+{[^}]*}\s+from\s+['"].*['"];?\s*$/gm, "") // Remove named imports
      .replace(
        /<GoogleMapsEmbed\s+([^>]*)\s*\/?>(?:<\/GoogleMapsEmbed>)?/g,
        (match, props) => {
          // Extract id or q prop if present
          const idMatch = props.match(/id=["']([^"']+)["']/);
          const qMatch = props.match(/q=["']([^"']+)["']/);
          const identifier = idMatch?.[1] || qMatch?.[1] || "N/A";
          return `\n\n**[Google Maps: ${identifier}]**\n\n`;
        },
      );
  }, [source]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkParse, remarkRehype, remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeStringify]}
      components={mdxComponents}
    >
      {cleanedSource}
    </ReactMarkdown>
  );
}
