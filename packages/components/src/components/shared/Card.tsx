import { Box, Card as ChakraCard, HStack, Text } from "@chakra-ui/react";
import { LinkOverlay } from "./LinkOverlay";
import { MaterialSymbol } from "./MaterialSymbol";

interface IProps {
  lng?: string;
  route?: string;
  nofollow?: boolean;
  icon: string;
  title: string;
  description?: string;
  onboardingId?: string;
}

export const Card = ({
  lng,
  route,
  nofollow,
  icon,
  title,
  description,
  onboardingId,
}: IProps) =>
  route ? (
    <LinkOverlay
      lng={lng}
      href={route}
      rel={nofollow ? "nofollow" : undefined}
      display="block"
      h="full"
      borderRadius="3xl"
      transition="transform 0.2s ease"
      css={{
        "& > a": {
          borderRadius: "inherit",
          display: "block",
          height: "100%",
        },
      }}
      _hover={{
        transform: "translateY(-2px)",
      }}
      _focusWithin={{
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: "primary.solid",
        outlineOffset: "2px",
        transform: "translateY(-2px)",
      }}
    >
      <Base
        icon={icon}
        title={title}
        description={description}
        onboardingId={onboardingId}
        liftOnHover={false}
      />
    </LinkOverlay>
  ) : (
    <Base
      icon={icon}
      title={title}
      description={description}
      onboardingId={onboardingId}
    />
  );

interface BaseProps extends Pick<
  IProps,
  "icon" | "title" | "description" | "onboardingId"
> {
  liftOnHover?: boolean;
}

const Base = ({
  icon,
  title,
  description,
  onboardingId,
  liftOnHover = true,
}: BaseProps) => (
  <ChakraCard.Root
    className="group"
    data-onboarding-id={onboardingId}
    h="full"
    position="relative"
    overflow="hidden"
    borderWidth="1px"
    borderColor="border.muted"
    boxShadow="xs"
    cursor="pointer"
    transition="border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease"
    _hover={{
      borderColor: "primary.emphasized",
      boxShadow: "md",
      ...(liftOnHover ? { transform: "translateY(-2px)" } : {}),
    }}
  >
    {/* Oversized, faded brand watermark bleeding from the corner */}
    <Box
      position="absolute"
      right="-3"
      bottom="-5"
      color="primary.solid"
      opacity={0.07}
      pointerEvents="none"
      aria-hidden="true"
    >
      <MaterialSymbol fontSize="7rem">{icon}</MaterialSymbol>
    </Box>

    <ChakraCard.Body position="relative" px="5" py="4">
      <HStack justifyContent="space-between" alignItems="flex-start" gap="3">
        <Text fontSize="md" fontWeight="semibold">
          {title}
        </Text>
        <MaterialSymbol
          fontSize="1.125rem"
          color="fg.subtle"
          transition="transform 0.2s ease, color 0.2s ease"
          _groupHover={{ color: "primary.solid", transform: "translateX(3px)" }}
        >
          arrow_forward
        </MaterialSymbol>
      </HStack>
      {description && (
        <Text mt="1" fontSize="sm" color="fg.muted" lineClamp={2}>
          {description}
        </Text>
      )}
    </ChakraCard.Body>
  </ChakraCard.Root>
);
