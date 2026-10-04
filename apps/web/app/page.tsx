import { createProfile, type FormValues } from "./actions";
import ProfileForm from "./profile-form";

const EMPTY: FormValues = {
  name: "",
  channel: "ntfy",
  target: "",
  urls: "",
  prompt: "",
  filters: "",
  pickupPhone: "",
  pickupNote: "",
};

export default function Landing() {
  return (
    <>
      <h1>Free Stuff Finder</h1>
      <p className="lede">Create a profile and get pinged only about free items you&apos;d actually want.</p>
      <ProfileForm action={createProfile} defaults={EMPTY} submitLabel="Create my profile" />
    </>
  );
}
