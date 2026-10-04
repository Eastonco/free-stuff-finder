import { eq } from "drizzle-orm";
import { db } from "@/db";
import { searches, users } from "@/db/schema";
import { type FormValues, updateProfile } from "../../actions";
import ProfileForm from "../../profile-form";

export default async function EditProfile({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { token } = await params;
  const { created } = await searchParams;

  const user = await db.query.users.findFirst({ where: eq(users.editToken, token) });
  if (!user) return <div className="err">Profile not found.</div>;

  const search = await db.query.searches.findFirst({ where: eq(searches.userId, user.id) });

  const defaults: FormValues = {
    name: user.name,
    channel: user.notifyChannel,
    target: user.notifyTarget,
    urls: search ? search.urls.join("\n") : "",
    prompt: search?.preferencePrompt ?? "",
    filters: search ? search.excludeFilters.join(", ") : "",
    pickupPhone: user.pickupPhone ?? "",
    pickupNote: user.pickupNote ?? "",
  };

  return (
    <>
      {created ? (
        <div className="ok">
          Profile created. You&apos;ll start getting alerts within a couple minutes.
          <br />
          <strong>Bookmark this private edit link</strong> — anyone with it can edit your profile.
        </div>
      ) : null}
      <h1>Edit profile</h1>
      <ProfileForm action={updateProfile} defaults={defaults} submitLabel="Save" token={token} />
    </>
  );
}
