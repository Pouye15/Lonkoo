import React from "react";
import { PALABRE_BLUEPRINTS } from "@/lib/lonkoo-data";
import { BlueprintDetailClient } from "@/components/palabre/BlueprintDetailClient";

export function generateStaticParams() {
  return PALABRE_BLUEPRINTS.map((bp) => ({ slug: bp.slug }));
}

export default async function BlueprintDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blueprint =
    PALABRE_BLUEPRINTS.find((b) => b.slug === slug) ?? PALABRE_BLUEPRINTS[0]!;

  return <BlueprintDetailClient blueprint={blueprint} />;
}
