import { IconButton } from "@chakra-ui/react";
import { MaterialSymbol } from "./MaterialSymbol";
import { Tooltip } from "../ui/tooltip";

export const RefreshButton = ({
  label,
  refreshFunction,
  ...rest
}: {
  label: string;
  refreshFunction: () => void;
  [x: string]: any;
}) => (
  <Tooltip content={label}>
    <span>
      <IconButton
        variant={"outline"}
        aria-label={label}
        onClick={refreshFunction}
        {...rest}
      >
        <MaterialSymbol>refresh</MaterialSymbol>
      </IconButton>
    </span>
  </Tooltip>
);
