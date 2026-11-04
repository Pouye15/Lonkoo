import React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-edge bg-surface text-ink hover:border-edge-strong hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
  inverse: "bg-inverse text-inverse-ink hover:bg-inverse-hover",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "href"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/** Bouton ou lien d'action, avec trois tailles et quatre variantes opaques. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, children, ...rest } = props;
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorProps } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
