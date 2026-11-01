import type { Metadata } from "next";

import { isAiConfigured, loadAiConfig } from "@/lib/ai/config";
import { loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { ProfileReview } from "./profile-review";

export const metadata: Metadata = { title: "Review your profile" };

/** The AI's look for duplicates and contradictions in the profile (.scratch/profile-review); `?job=` follows a review in progress. */
export default async function ProfileReviewPage({ searchParams }: PageProps<"/profile/review">) {
  const [{ job }, aiReady, ai, profile, settings] = await Promise.all([searchParams, isAiConfigured(), loadAiConfig(), loadProfile(), loadSettings()]);
  return (
    <ProfileReview
      aiReady={aiReady}
      provider={ai.provider}
      initialJobId={typeof job === "string" ? job : null}
      profile={profile}
      skipped={settings.reviewSkipped}
    />
  );
}
