"use client";

import { Center } from "@chakra-ui/react";
import { Image } from "@konfi/components";

export default function NotFound() {
  return (
    <Center>
      <Image
        src={"/assets/404.avif"}
        ratio={2}
        minW={"50vw"}
        width={3500}
        height={1750}
        alt={"404"}
        priority={true}
        transparentBackground
      />
    </Center>
  );
}
