import { Text, Center, Heading, Box, Badge } from "@chakra-ui/react";
import { MaterialSymbol } from "../MaterialSymbol";
import { EmptyState } from "../../ui/empty-state";

import type { JSX } from "react";

/**
 * Empty component renders an empty state interface with a title, description, and icon.
 *
 * @param {Object} props - The props object contains title, description, and icon as keys.
 * @param {string} props.title - Title of the empty state component.
 * @param {string} props.description - Description of the empty state component.
 * @param {string} props.icon - Icon to display in the empty state component.
 * @param {string} [props.fontSize] - Optional font size for the icon.
 *
 * @returns {JSX.Element} Empty component JSX representation.
 */

export const Empty = (props: {
  title: string;
  description: string;
  icon: string;
  fontSize?: string;
  children?: React.ReactNode;
}): JSX.Element => {
  return (
    <Center
      h={"50vh"}
      justifyContent={"center"}
      textAlign={"center"}
      flexDirection={"column"}
    >
      <EmptyState
        icon={
          <MaterialSymbol
            style={{
              fontSize: props.fontSize ? props.fontSize : "140px",
              opacity: 0.1,
            }}
          >
            {props.icon}
          </MaterialSymbol>
        }
        title={props.title}
        description={props.description}
      >
        {props.children}
      </EmptyState>
    </Center>
  );
};
