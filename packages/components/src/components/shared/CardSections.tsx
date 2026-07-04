import { Separator, Heading, SimpleGrid } from "@chakra-ui/react";
import { Card } from "./Card";

interface Props {
  sectionCards: {
    heading: string;
    cards: {
      route: string;
      icon: string;
      title: string;
      description: string;
      nofollow?: boolean;
    }[];
  }[];
}

export function CardSections(props: Props) {
  return (
    <>
      {props.sectionCards.map((section, sectionIndex) => (
        <section key={sectionIndex}>
          <Separator mt={"6"} />
          <Heading my={"4"} size={"md"}>
            {section.heading}
          </Heading>
          <SimpleGrid columns={{ md: 1, lg: 2 }} gap={"4"}>
            {props.sectionCards[sectionIndex].cards.map((card, cardIndex) => (
              <Card
                key={cardIndex}
                route={card.route}
                nofollow={card.nofollow}
                icon={card.icon}
                title={card.title}
                description={card.description}
              ></Card>
            ))}
          </SimpleGrid>
        </section>
      ))}
    </>
  );
}
