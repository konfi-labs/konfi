import { Base } from "../../base";
import { Locale } from "../../enums";
import type { TranslatedContentMetadata } from "../../translation-meta";

export interface IHero {
  cards: HeroCard[];
}

export interface HeroCardTranslation extends Omit<
  HeroCard,
  "image" | "buttonColor" | "backgroundColor" | "textColor" | "active"
> {}

export interface HeroTranslation
  extends Omit<Base, "name">, TranslatedContentMetadata {
  locale: Locale; // e.g., "en", "pl", "de"
  cards: HeroCardTranslation[];
}

export interface HeroTranslationCreate extends HeroTranslation {}

export interface HeroTranslationCreateForm extends Omit<
  HeroTranslationCreate,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface HeroTranslationUpdate extends Omit<
  HeroTranslation,
  "id" | "createdAt" | "createdBy"
> {}

export interface HeroTranslationUpdateForm extends Omit<
  HeroTranslationUpdate,
  "updatedAt"
> {}

/**
 * Hero class
 * @description Hero
 *   - cards: HeroCard[]
 */

export class Hero implements IHero {
  cards: HeroCard[];

  constructor();
  constructor(hero: IHero);
  constructor(hero?: IHero, cards?: HeroCard[]);
  constructor(hero?: IHero, cards?: HeroCard[]) {
    this.cards = hero?.cards.map((card) => new HeroCard(card)) ??
      cards?.map((card) => new HeroCard(card)) ?? [
        {
          title: "",
          subtitle: "",
          image: "",
          buttonLabel: "",
          buttonUrl: "",
          buttonColor: "",
          backgroundColor: "",
          textColor: "",
          active: true,
        },
      ];
  }
}

export type IHeroCard = {
  title: string;
  subtitle: string;
  image: string;
  buttonLabel: string;
  buttonUrl: string;
  buttonColor: string;
  backgroundColor: string;
  textColor: string;
  active: boolean;
};

/**
 * HeroCard class
 * @description Hero card
 *   - title: string
 *   - subtitle: string
 *   - image: string
 *   - buttonLabel: string
 *   - buttonUrl: string
 *   - buttonColor: string
 *   - backgroundColor: string
 *   - textColor: string
 */

export class HeroCard implements IHeroCard {
  title: string;
  subtitle: string;
  image: string;
  buttonLabel: string;
  buttonUrl: string;
  buttonColor: string;
  backgroundColor: string;
  textColor: string;
  active: boolean;

  constructor();
  constructor(heroCard: IHeroCard);
  constructor(
    heroCard?: IHeroCard,
    title?: string,
    subtitle?: string,
    image?: string,
    buttonLabel?: string,
    buttonUrl?: string,
    buttonColor?: string,
    backgroundColor?: string,
    textColor?: string,
    active?: boolean,
  );
  constructor(
    heroCard?: IHeroCard,
    title?: string,
    subtitle?: string,
    image?: string,
    buttonLabel?: string,
    buttonUrl?: string,
    buttonColor?: string,
    backgroundColor?: string,
    textColor?: string,
    active?: boolean,
  ) {
    this.title = heroCard?.title ?? title ?? "";
    this.subtitle = heroCard?.subtitle ?? subtitle ?? "";
    this.image = heroCard?.image ?? image ?? "";
    this.buttonLabel = heroCard?.buttonLabel ?? buttonLabel ?? "";
    this.buttonUrl = heroCard?.buttonUrl ?? buttonUrl ?? "";
    this.buttonColor = heroCard?.buttonColor ?? buttonColor ?? "";
    this.backgroundColor = heroCard?.backgroundColor ?? backgroundColor ?? "";
    this.textColor = heroCard?.textColor ?? textColor ?? "";
    this.active = heroCard?.active ?? active ?? true;
  }
}

export interface HeroForm extends Hero {}
