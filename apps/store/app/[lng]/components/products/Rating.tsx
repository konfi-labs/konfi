"use client";

import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { TFunction } from "i18next";
import { useState } from "react";

export default function Rating({
  channelId,
  id,
  productId,
  trigger,
}: {
  channelId: string;
  id: string;
  productId: string;
  trigger: () => Promise<unknown>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
  const { t } = useT();

  const handleRatingClick = (selectedRating: number) => {
    setRating(selectedRating);
  };

  const handleCommentChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setComment(event.target.value);
  };
  async function handleSubmit() {
    if (rating === 0 || rating < 1 || rating > 5) {
      toaster.create({
        title: t("rating.selectRating", {
          defaultValue: "Please select a rating!",
        }),
        type: "warning",
        duration: 5000,
      });
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User must be authenticated to submit a rating.");
      }

      const idToken = await user.getIdToken();
      const response = await fetch("/api/ratings/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channelId,
          productId,
          ratingId: id,
          rating,
          comment: comment.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Rating submission failed.");
      }

      toaster.success({
        title: t("rating.thankYou", {
          defaultValue: "Thank you for your rating!",
        }),
        duration: 5000,
      });

      await trigger();
      setRating(0);
      setComment("");
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "An error occurred!" }),
        description: t("rating.submitError", {
          defaultValue: "An error occurred while submitting your rating!",
        }),
        duration: 5000,
      });
      return;
    }
  }

  return (
    <>
      <HStack>
        <Box bg={"gray.100"} p={4} borderRadius={"3xl"}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              index={star}
              rating={rating}
              hoveredRating={hoveredRating}
              onMouseEnter={setHoveredRating}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={handleRatingClick}
              t={t}
            />
          ))}
        </Box>
      </HStack>
      <Text mt={4}>
        {t("store.reviewOptional", { defaultValue: "Review (optional)" })}
      </Text>
      <Textarea
        value={comment}
        onChange={handleCommentChange}
        placeholder={t("store.writeReviewPlaceholder", {
          defaultValue: "Write a review...",
        })}
        size="sm"
        mt={2}
        borderRadius={"3xl"}
      />
      <Button
        colorPalette="primary"
        onClick={handleSubmit}
        disabled={rating === 0}
        mt={2}
      >
        {t("common.submit", { defaultValue: "Submit" })}
      </Button>
    </>
  );
}

const Star = ({
  index,
  rating,
  hoveredRating,
  onMouseEnter,
  onMouseLeave,
  onClick,
  t,
}: {
  index: number;
  rating: number;
  hoveredRating: number;
  onMouseEnter: (index: number) => void;
  onMouseLeave: () => void;
  onClick: (index: number) => void;
  t: TFunction;
}) => {
  const fill =
    hoveredRating >= index
      ? "primary.400"
      : rating >= index
        ? "primary.400"
        : "gray.300";

  return (
    <IconButton
      color={fill}
      onClick={() => onClick(index)}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseLeave={() => onMouseLeave()}
      aria-label={t("rating.rateStar", {
        defaultValue: "Rate {{index}}",
        index,
      })}
    >
      <MaterialSymbol>star</MaterialSymbol>
    </IconButton>
  );
};
