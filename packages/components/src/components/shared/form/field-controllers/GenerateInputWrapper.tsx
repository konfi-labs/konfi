"use client";

import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";
import { themeGradients } from "../../../../theme/gradients";

interface GenerateInputWrapperProps {
  children: ReactNode;
  loading: boolean;
}

export const GenerateInputWrapper = ({
  children,
  loading,
}: GenerateInputWrapperProps) => {
  return (
    <Box
      w={"100%"}
      position="relative"
      borderRadius="24px"
      padding="4px"
      animation={loading ? "glow 20s linear infinite" : "none"}
      _before={{
        display: loading ? "block" : "none",
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        background: themeGradients.aiGlow,
        backgroundSize: "400%",
        zIndex: 0,
        animation: "inherit",
        width: "100%",
        borderRadius: "26px",
      }}
      _after={{
        display: loading ? "block" : "none",
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        background: themeGradients.aiGlow,
        backgroundSize: "400%",
        zIndex: 0,
        animation: "inherit",
        width: "100%",
        borderRadius: "26px",
        filter: "blur(25px)",
        transform: "translate3d(0, 0, 0)",
      }}
    >
      <Box position="relative" zIndex={1}>
        {children}
      </Box>
    </Box>
  );
};
