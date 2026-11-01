// Druhy e-mailových upozornení (spoločné pre server aj stránky).

/** Upozornenia pre majiteľov, ktoré si môžu vypnúť v Môj účet. */
export const OWNER_MAIL_KINDS = ["credited", "billing", "credit_low", "support", "chat_closed"] as const;
/** Upozornenia pre webmastra (vypína ich v nastaveniach e-mailov). */
export const WEBMASTER_MAIL_KINDS = ["wm_request", "wm_chat"] as const;
export type OwnerMailKind = (typeof OWNER_MAIL_KINDS)[number];
export type WebmasterMailKind = (typeof WEBMASTER_MAIL_KINDS)[number];
/** Zmena ceny sa posiela vždy (nedá sa vypnúť), test len na zadanú adresu. */
export type MailKind = OwnerMailKind | WebmasterMailKind | "price_change" | "price_cancel" | "test";

/** Zmena ceny platí najskôr toľko dní po oznámení. */
export const PRICE_NOTICE_DAYS = 31;
/** Podpora: ďalšia odpoveď webmastra ide e-mailom, ak si ju majiteľ do 15 min neprečíta. */
export const SUPPORT_OWNER_DELAY_MIN = 15;
/** Chat člena tímu: majiteľom e-mail, ak si to člen do 30 min neprečíta. */
export const SUPPORT_MEMBER_DELAY_MIN = 30;

export const MAIL_LANGS = ["sk", "en", "cs"] as const;
export type MailLang = (typeof MAIL_LANGS)[number];

export const parseKinds = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
